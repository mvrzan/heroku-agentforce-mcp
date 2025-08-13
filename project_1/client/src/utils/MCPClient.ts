import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import readline from "readline/promises";
import { getCurrentTimestamp } from "./loggingUtil.js";
import { WeatherDataset } from "./types.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_CLAUDE_MODEL = process.env.ANTHROPIC_CLAUDE_MODEL;

if (!ANTHROPIC_API_KEY) {
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPClient - ANTHROPIC_API_KEY is not set!`);
}

if (!ANTHROPIC_CLAUDE_MODEL) {
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPClient - ANTHROPIC_CLAUDE_MODEL is not set!`);
}

export class MCPClient {
  private mcp: Client;
  private anthropic: Anthropic;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  private tools: Tool[] = [];
  private messages: MessageParam[] = []; // Add persistent conversation history

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
     * Process a query using Claude with available tools and resources
     *
     * @param query - The user's input query
     * @returns Processed response as a string
     */
    const weatherKeywords = ["weather", "climate", "temperature", "forecast", "climate change", "dataset"];
    let weatherData: WeatherDataset;
    let weatherInfo = "";

    // Create a working copy of messages for this query
    const workingMessages: MessageParam[] = [...this.messages];

    // First, try to fetch the prompt from MCP server to use as system prompt
    try {
      console.log(`${getCurrentTimestamp()} - 🔍 MCPClient - Discovering available prompts...`);

      // Get list of available prompts
      const promptsList = await this.mcp.listPrompts();

      if (promptsList.prompts && promptsList.prompts.length > 0) {
        console.log(`${getCurrentTimestamp()} - ✅ MCPClient - Found ${promptsList.prompts.length} prompts`);

        // Find the weather assistant prompt
        const weatherPrompt = promptsList.prompts.find(
          (p) => p.name === "weather-assistant" || (p.description && p.description.toLowerCase().includes("weather"))
        );

        if (weatherPrompt) {
          console.log(`${getCurrentTimestamp()} - 📋 MCPClient - Found weather prompt: ${weatherPrompt.name}`);

          // Get the specific prompt content
          const promptResponse = await this.mcp.getPrompt({ name: weatherPrompt.name });

          if (promptResponse && promptResponse.messages) {
            console.log(
              `${getCurrentTimestamp()} - 📚 MCPClient - Successfully retrieved prompt with ${
                promptResponse.messages.length
              } messages`
            );

            // Add the prompt messages first, then add the user query
            for (const promptMessage of promptResponse.messages) {
              workingMessages.push({
                role: promptMessage.role as "user" | "assistant", // Ensure correct type
                content: promptMessage.content.type === "text" ? promptMessage.content.text : "",
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ⚠️ MCPClient - Failed to load prompt:`, error);
    }

    // Add user query after any prompt messages
    workingMessages.push({
      role: "user",
      content: query,
    });

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
          console.log(
            `${getCurrentTimestamp()} - 🤔 MCPClient - The query likely requires a use of the weather tool. Claude will decide what is the appropriate action. `
          );
          // We'll leave the original query intact so Claude can choose to use the tools

          // Update message with tools note
          const messageContent = workingMessages[workingMessages.length - 1].content;
          workingMessages[
            workingMessages.length - 1
          ].content = `${messageContent}\n\n(Note: You have access to weather tools that can provide real-time forecasts and alerts. Use them if the query requires current weather information.)`;
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
                const messageContent = workingMessages[workingMessages.length - 1].content;
                workingMessages[
                  workingMessages.length - 1
                ].content = `${messageContent}\n\nHere's the available historical weather data from the server:\n${weatherInfo}\n\nFull weather data JSON:\n${JSON.stringify(
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
        model: ANTHROPIC_CLAUDE_MODEL!,
        max_tokens: 1500,
        messages: workingMessages,
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

          const result = await this.mcp.callTool({
            name: toolName,
            arguments: toolArgs,
          });

          // Add the assistant's response (with tool use) to messages
          workingMessages.push({
            role: "assistant",
            content: response.content,
          });

          // Add the tool result - extract text from MCP result content array
          let toolResultText = "";
          if (Array.isArray(result.content)) {
            toolResultText = result.content
              .map((item: any) => (item.type === "text" ? item.text : String(item)))
              .join("\n");
          } else {
            toolResultText = String(result.content);
          }

          workingMessages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: toolResultText,
              },
            ],
          });

          // Get final response from Claude with tool results - no tools to prevent additional calls
          response = await this.anthropic.messages.create({
            model: ANTHROPIC_CLAUDE_MODEL!,
            max_tokens: 1000,
            messages: workingMessages,
            // Don't pass tools to prevent Claude from making additional tool calls
          });

          // Add the final response text
          for (const finalContent of response.content) {
            if (finalContent.type === "text") {
              finalText.push(finalContent.text);
            }
          }
        }
      }

      // Update the persistent conversation history with the final working messages
      this.messages = workingMessages;

      return finalText.join("\n");
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ MCPClient- Error processing query:`, error);
      return "Sorry, I encountered an error while processing your query.";
    }
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log(`\n${getCurrentTimestamp()} - ✅ MCPClient - MCP Client Started!`);
      console.log(`${getCurrentTimestamp()} - ✍️ MCPClient - Type your queries or 'quit' to exit.`);

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        try {
          const response = await this.processQuery(message);
          console.log("\n" + response);
        } catch (error) {
          console.error(`${getCurrentTimestamp()} - ❌ MCPClient - Error processing query:`, error);
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
