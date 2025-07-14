import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import readline from "readline/promises";
import { getCurrentTimestamp } from "./loggingUtil.js";
import { WeatherDataset } from "./types.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPClient - ANTHROPIC_API_KEY is not set!`);
}

export class MCPClient {
  private mcp: Client;
  private anthropic: Anthropic;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private tools: Tool[] = [];

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async connectToServer(serverScriptPath: string) {
    try {
      const isUrl = serverScriptPath.startsWith("http://") || serverScriptPath.startsWith("https://");

      if (isUrl) {
        // Use SSE transport for remote MCP server
        this.transport = new SSEClientTransport(new URL(serverScriptPath));
        this.mcp.connect(this.transport);
      } else {
        if (!serverScriptPath.endsWith(".js")) {
          throw new Error("Server script must be a .js file or a valid URL");
        }

        this.transport = new StdioClientTransport({
          command: process.execPath,
          args: [serverScriptPath],
        });
        this.mcp.connect(this.transport);
      }

      // List available tools
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      console.log(
        `${getCurrentTimestamp()} - 🔌 MCPClient - Connected to server with tools:`,
        this.tools.map(({ name }) => name)
      );

      // Check for available resources
      const resources = await this.mcp.listResources();
      if (resources.resources && resources.resources.length > 0) {
        console.log(
          `${getCurrentTimestamp()} - 🧰 MCPClient - Available resources:`,
          resources.resources.map((resource) => resource.name).join(", ")
        );
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ MCPClient - Failed to connect to MCP server:`, error);
      throw error;
    }
  }

  async processQuery(query: string) {
    /**
     * Process a query using Claude and available tools
     *
     * @param query - The user's input query
     * @returns Processed response as a string
     */
    const weatherKeywords = ["weather", "climate", "temperature", "forecast", "climate change", "dataset"];
    let weatherData: WeatherDataset;
    let weatherInfo = "";

    // Initialize messages array for Claude API
    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    // Check if query is related to weather data
    if (weatherKeywords.some((keyword) => query.toLowerCase().includes(keyword))) {
      try {
        // Check for available resources
        const resources = await this.mcp.listResources();

        // Check if any of our tools are specifically for weather forecasts or alerts
        const hasWeatherTools = this.tools.some(
          (tool) => tool.name.includes("forecast") || tool.name.includes("alert") || tool.name.includes("weather")
        );

        // Get real-time data request indicators
        const requestsRealTimeData =
          query.toLowerCase().includes("current") ||
          query.toLowerCase().includes("today") ||
          query.toLowerCase().includes("now") ||
          query.toLowerCase().includes("forecast") ||
          query.toLowerCase().includes("alert");

        // If the query is about current conditions or forecasts AND we have weather tools,
        // let Claude use the tools instead of the static JSON data
        if (requestsRealTimeData && hasWeatherTools) {
          console.log("Query likely requires real-time weather data. Let Claude decide whether to use weather tools.");
          // We'll leave the original query intact so Claude can choose to use the tools

          // Add a system note about available tools
          messages[0].content = `${query}\n\n(Note: You have access to weather tools that can provide real-time forecasts and alerts. Use them if the query requires current weather information.)`;
        }
        // Otherwise, check for historical/static weather data
        else if (resources.resources && resources.resources.length > 0) {
          // Find weather data resource
          const weatherResource = resources.resources.find(
            (resource) =>
              resource.uri.toLowerCase().includes("data.json") || resource.title?.toLowerCase().includes("weather")
          );

          if (weatherResource) {
            try {
              // Fetch the weather data resource
              const content = await this.mcp.readResource({ uri: weatherResource.uri });

              if (content.contents && content.contents.length > 0) {
                // Get text content and parse JSON
                const contentText = typeof content.contents[0].text === "string" ? content.contents[0].text : "";
                weatherData = JSON.parse(contentText);

                // Prepare weather information to add to the query
                weatherInfo = "I found historical weather data from the MCP server with the following categories:\n";
                for (const key of Object.keys(weatherData)) {
                  weatherInfo += `- ${key}\n`;
                }

                // Add the relevant weather data to Claude's context
                messages[0].content = `${query}\n\nHere's the available historical weather data from the server:\n${weatherInfo}\n\nFull weather data JSON:\n${JSON.stringify(
                  weatherData,
                  null,
                  2
                )}`;
                console.log("Including historical weather data in the request to Claude");
              }
            } catch (error) {
              console.error("Error reading weather data:", error);
              // Continue with normal query processing
            }
          }
        }
      } catch (error) {
        console.error("Error fetching resources:", error);
        // Continue with normal query processing if resource fetch fails
      }
    }

    try {
      // Initial Claude API call
      let response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1500, // Increased to accommodate larger responses with weather data
        messages,
        tools: this.tools,
      });

      // Process response and handle tool calls
      const finalText = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          // Execute tool call
          const toolName = content.name;
          const toolArgs = content.input as { [x: string]: unknown } | undefined;

          console.log(`[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`);

          const result = await this.mcp.callTool({
            name: toolName,
            arguments: toolArgs,
          });

          // Add the assistant's response (with tool use) to messages
          messages.push({
            role: "assistant",
            content: response.content,
          });

          // Add the tool result
          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: result.content as string,
              },
            ],
          });

          // Get next response from Claude with tool results
          response = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            messages,
            tools: this.tools,
          });

          // Add the final response text
          for (const finalContent of response.content) {
            if (finalContent.type === "text") {
              finalText.push(finalContent.text);
            }
          }
        }
      }

      return finalText.join("\n");
    } catch (error) {
      console.error("Error processing query:", error);
      return "Sorry, I encountered an error while processing your query.";
    }
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        try {
          const response = await this.processQuery(message);
          console.log("\n" + response);
        } catch (error) {
          console.error("Error processing query:", error);
          console.log("Session continuing...");
        }
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }
}
