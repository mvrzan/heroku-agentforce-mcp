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
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];
  private messages: MessageParam[] = [];

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async connectToServer(serverScriptPath: string) {
    try {
      this.transport = new StdioClientTransport({
        command: process.execPath,
        args: [serverScriptPath],
      });
      this.mcp.connect(this.transport);

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

      const mcpServerResources = await this.mcp.listResources();

      if (mcpServerResources.resources && mcpServerResources.resources.length > 0) {
        console.log(
          `${getCurrentTimestamp()} - 🧰 MCPClient - Available resources:`,
          mcpServerResources.resources.map((mcpServerResource) => mcpServerResource.name).join(", ")
        );
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ MCPClient - Failed to connect to MCP server:`, error);
      throw error;
    }
  }

  async processQuery(query: string) {
    const workingMessages: MessageParam[] = [...this.messages];

    try {
      console.log("\n");
      console.log(`${getCurrentTimestamp()} - 🔍 MCPClient - Discovering available prompts...`);

      const promptsList = await this.mcp.listPrompts();
      const prompt = promptsList.prompts[0];
      const promptResponse = await this.mcp.getPrompt({ name: prompt.name });

      if (promptResponse && promptResponse.messages) {
        for (const promptMessage of promptResponse.messages) {
          workingMessages.push({
            role: promptMessage.role as "user" | "assistant",
            content: promptMessage.content.type === "text" ? promptMessage.content.text : "",
          });

          console.log(`${getCurrentTimestamp()} - ✅ MCPClient - Prompt added!`);
        }
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ⚠️ MCPClient - Failed to load prompt:`, error);
    }

    workingMessages.push({
      role: "user",
      content: query,
    });

    try {
      console.log(`${getCurrentTimestamp()} - 🔍 MCPClient - Checking for available resources...`);
      const resources = await this.mcp.listResources();
      const dataResource = resources.resources.find((resource) => resource.uri.toLowerCase().includes("data.json"))!;

      try {
        const content = await this.mcp.readResource({ uri: dataResource.uri });

        if (content.contents && content.contents.length > 0) {
          const contentText = typeof content.contents[0].text === "string" ? content.contents[0].text : "";
          const resourceData = JSON.parse(contentText);
          const resourceInfo = `Available data from MCP server (${dataResource.name}):\n${Object.keys(resourceData)
            .map((key) => `- ${key}`)
            .join("\n")}`;

          const messageContent = workingMessages[workingMessages.length - 1].content;
          workingMessages[
            workingMessages.length - 1
          ].content = `${messageContent}\n\n${resourceInfo}\n\nFull data:\n${JSON.stringify(resourceData, null, 2)}`;

          console.log(`${getCurrentTimestamp()} - ✅ MCPClient - Resource data added to context`);
        }
      } catch (error) {
        console.error(`${getCurrentTimestamp()} - ❌ MCPClient - Error reading resource:`, error);
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ MCPClient - Error fetching resources:`, error);
    }

    try {
      console.log(`${getCurrentTimestamp()} - 💬 MCPClient - Sending query to Claude...`);

      let response = await this.anthropic.messages.create({
        model: ANTHROPIC_CLAUDE_MODEL!,
        max_tokens: 1500,
        messages: workingMessages,
        tools: this.tools,
      });

      const finalText = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          // Execute tool call
          const toolName = content.name;
          const toolArgs = content.input as { [x: string]: unknown } | undefined;

          console.log(`${getCurrentTimestamp()} - 🔧 MCPClient - Calling tool: ${toolName}`);

          const result = await this.mcp.callTool({
            name: toolName,
            arguments: toolArgs,
          });

          workingMessages.push({
            role: "assistant",
            content: response.content,
          });

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

          console.log(`${getCurrentTimestamp()} - 📝 MCPClient - Getting final response from Claude...`);

          response = await this.anthropic.messages.create({
            model: ANTHROPIC_CLAUDE_MODEL!,
            max_tokens: 1000,
            messages: workingMessages,
          });

          for (const finalContent of response.content) {
            if (finalContent.type === "text") {
              finalText.push(finalContent.text);
            }
          }
        }
      }

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

    rl.on("SIGINT", () => {
      console.log("\n");
      console.log(`${getCurrentTimestamp()} - 🛑 MCPClient - Interrupted by user`);
      rl.close();
      process.exit(0);
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
