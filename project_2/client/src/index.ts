import "dotenv/config";
import { SSEMCPClient } from "./utils/SSEMCPClient.js";
import { HTTPMCPClient } from "./utils/HTTPMCPClient.js";
import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import readline from "readline/promises";
import { ClientInstance, UnifiedTool, UnifiedResource } from "./utils/types.js";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_CLAUDE_MODEL = process.env.ANTHROPIC_CLAUDE_MODEL;

if (!ANTHROPIC_API_KEY) {
  throw new Error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - ANTHROPIC_API_KEY is not set!`);
}

if (!ANTHROPIC_CLAUDE_MODEL) {
  throw new Error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - ANTHROPIC_CLAUDE_MODEL is not set!`);
}

class UnifiedMCPClient {
  private clients: ClientInstance[];
  private anthropic: Anthropic;
  private unifiedTools: UnifiedTool[] = [];
  private unifiedResources: UnifiedResource[] = [];

  constructor(clients: ClientInstance[]) {
    this.clients = clients;
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  async initialize() {
    console.log(`${getCurrentTimestamp()} - 🔄 UnifiedMCPClient - Initializing unified client...`);

    for (const clientInstance of this.clients) {
      try {
        const mcpClient = clientInstance.client.mcpClient;

        if (!mcpClient) break;

        const toolsResult = await mcpClient.listTools();
        const clientTools = toolsResult.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        }));

        clientTools.forEach((tool) => {
          this.unifiedTools.push({
            name: tool.name,
            description: tool.description || "No description",
            input_schema: tool.input_schema,
            source: clientInstance.identifier,
            client: clientInstance.client,
          });
        });

        const resourcesResult = await mcpClient.listResources();
        const clientResources = resourcesResult.resources || [];

        clientResources.forEach((resource) => {
          this.unifiedResources.push({
            name: resource.name || "Unknown Resource",
            description: resource.description || "No description",
            uri: resource.uri || "",
            source: clientInstance.identifier,
            client: clientInstance.client,
          });
        });

        console.log(`${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Integrated ${clientInstance.identifier}`);
      } catch (error) {
        console.error(
          `${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Failed to integrate ${clientInstance.identifier}:`,
          error
        );
      }
    }

    console.log(
      `${getCurrentTimestamp()} - 🔄 UnifiedMCPClient - Unified client ready with ${
        this.unifiedTools.length
      } tools and ${this.unifiedResources.length} resources`
    );
  }

  async getAllTools(): Promise<UnifiedTool[]> {
    return this.unifiedTools;
  }

  async getAllResources(): Promise<UnifiedResource[]> {
    return this.unifiedResources;
  }

  async processQuery(query: string): Promise<string> {
    const workingMessages: MessageParam[] = [];

    try {
      console.log(`${getCurrentTimestamp()} - 🔍 UnifiedMCPClient - Discovering available prompts...`);

      for (const clientInstance of this.clients) {
        const mcpClient = clientInstance.client.mcpClient;
        const promptsList = await mcpClient.listPrompts();

        if (promptsList.prompts && promptsList.prompts.length > 0) {
          const prompt = promptsList.prompts[0];
          const promptResponse = await mcpClient.getPrompt({ name: prompt.name });

          if (promptResponse && promptResponse.messages) {
            for (const promptMessage of promptResponse.messages) {
              workingMessages.push({
                role: promptMessage.role as "user" | "assistant",
                content: promptMessage.content.type === "text" ? promptMessage.content.text : "",
              });
            }

            console.log(
              `${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Prompt added from ${clientInstance.identifier}!`
            );

            break;
          }
        }
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ⚠️ UnifiedMCPClient - Failed to discover prompts:`, error);
    }

    workingMessages.push({
      role: "user",
      content: query,
    });

    try {
      console.log(`${getCurrentTimestamp()} - 🔍 UnifiedMCPClient - Checking for available resources...`);

      for (const clientInstance of this.clients) {
        const mcpClient = clientInstance.client.mcpClient;
        const resources = await mcpClient.listResources();

        if (resources.resources && resources.resources.length > 0) {
          const dataResource = resources.resources.find((resource) => resource.uri.toLowerCase().includes("data.json"));

          if (dataResource) {
            const content = await mcpClient.readResource({ uri: dataResource.uri });

            if (content.contents && content.contents.length > 0) {
              const contentText = typeof content.contents[0].text === "string" ? content.contents[0].text : "";
              const resourceData = JSON.parse(contentText);
              const resourceInfo = `Available data from MCP server (${dataResource.name}) on ${
                clientInstance.identifier
              }:\n${Object.keys(resourceData)
                .map((key) => `- ${key}`)
                .join("\n")}`;

              const messageContent = workingMessages[workingMessages.length - 1].content;
              workingMessages[
                workingMessages.length - 1
              ].content = `${messageContent}\n\n${resourceInfo}\n\nFull data:\n${JSON.stringify(
                resourceData,
                null,
                2
              )}`;

              console.log(
                `${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Resource data added from ${clientInstance.identifier}`
              );
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Error fetching resources:`, error);
    }

    try {
      const tools: Tool[] = this.unifiedTools.map((tool) => ({
        name: tool.name,
        description: `${tool.description} (from ${tool.source})`,
        input_schema: tool.input_schema,
      }));

      console.log(
        `${getCurrentTimestamp()} - 💬 UnifiedMCPClient - Querying Claude with ${tools.length} available tools...`
      );

      let response = await this.anthropic.messages.create({
        model: ANTHROPIC_CLAUDE_MODEL!,
        max_tokens: 1500,
        messages: workingMessages,
        tools: tools,
      });

      const finalText: string[] = [];
      const toolCalls = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          toolCalls.push(content);
        }
      }

      if (toolCalls.length > 0) {
        workingMessages.push({
          role: "assistant",
          content: response.content,
        });

        const toolResults = [];

        for (const toolCall of toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.input as { [x: string]: unknown } | undefined;
          const unifiedTool = this.unifiedTools.find((t) => t.name === toolName);

          if (!unifiedTool) {
            console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Tool ${toolName} not found`);
            toolResults.push({
              type: "tool_result" as const,
              tool_use_id: toolCall.id,
              content: `Error: Tool ${toolName} not found`,
            });

            continue;
          }

          console.log(
            `${getCurrentTimestamp()} - 🔧 UnifiedMCPClient - Calling tool ${toolName} on ${unifiedTool.source}`
          );

          const mcpClient = unifiedTool.client.mcpClient;
          const result = await mcpClient.callTool({
            name: toolName,
            arguments: toolArgs,
          });

          let toolResultText = "";

          if (Array.isArray(result.content)) {
            toolResultText = result.content
              .map((item: any) => (item.type === "text" ? item.text : String(item)))
              .join("\n");
          } else {
            toolResultText = String(result.content);
          }

          toolResults.push({
            type: "tool_result" as const,
            tool_use_id: toolCall.id,
            content: toolResultText,
          });
        }

        workingMessages.push({
          role: "user",
          content: toolResults,
        });

        console.log(`${getCurrentTimestamp()} - 📝 UnifiedMCPClient - Getting final response from Claude...`);

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

      return finalText.join("\n");
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Error processing query:`, error);
      return "Sorry, I encountered an error while processing your query.";
    }
  }
}

async function unifiedChatMode(unifiedClient: UnifiedMCPClient, rl: readline.Interface) {
  console.log(`\n${getCurrentTimestamp()} - 🤖 UnifiedMCPClient - Unified Chat Mode - Connected to all MCP servers`);
  console.log(
    `${getCurrentTimestamp()} - 🔧 UnifiedMCPClient - Claude will automatically select the best tools from all available servers`
  );
  console.log(`${getCurrentTimestamp()} - ✍️ UnifiedMCPClient - Type 'quit' to exit\n`);

  const allTools = await unifiedClient.getAllTools();
  const allResources = await unifiedClient.getAllResources();

  console.log(
    `${getCurrentTimestamp()} - 🧰 UnifiedMCPClient - Available tools: ${allTools
      .map((t) => `${t.name} (${t.source})`)
      .join(", ")}`
  );
  if (allResources.length > 0) {
    console.log(
      `${getCurrentTimestamp()} - 🧰 UnifiedMCPClient - Available resources: ${allResources
        .map((r) => `${r.name} (${r.source})`)
        .join(", ")}`
    );
  }
  console.log();

  while (true) {
    const input = await rl.question("Query: ");
    if (input.toLowerCase() === "quit") break;

    try {
      console.log(`${getCurrentTimestamp()} - 🤖 UnifiedMCPClient - Processing query...`);
      const response = await unifiedClient.processQuery(input);
      console.log("\n" + response);
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Error processing query:`, error);
      console.log("Session continuing...");
    }
  }
}

async function main() {
  console.log(`${getCurrentTimestamp()} - 🚀 UnifiedMCPClient - Multi-MCP Client CLI`);
  console.log("==================");
  console.log("This CLI supports connecting to multiple MCP servers:");
  console.log("- SSE (Server-Sent Events) servers");
  console.log("- HTTP (Streamable HTTP) servers");
  console.log();

  const clients: ClientInstance[] = [];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    console.log(`\n${getCurrentTimestamp()} - 🛑 UnifiedMCPClient - Interrupted by user`);
    rl.close();
    process.exit(0);
  });

  try {
    // Setup phase - connect to servers
    await setupClients(clients, rl);

    if (clients.length === 0) {
      console.log(`${getCurrentTimestamp()} - ⚠️ UnifiedMCPClient - No clients connected. Exiting.`);
      return;
    }

    // Interactive phase - choose clients and send queries
    await interactiveMode(clients, rl);
  } finally {
    await cleanup(clients);
    rl.close();
    process.exit(0);
  }
}

async function cleanup(clients: ClientInstance[]) {
  console.log(`\n${getCurrentTimestamp()} - 🧹 UnifiedMCPClient - Cleaning up clients...`);
  for (const clientInstance of clients) {
    try {
      await clientInstance.client.cleanup();
      console.log(`${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Cleaned up ${clientInstance.identifier}`);
    } catch (error) {
      console.error(
        `${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Error cleaning up ${clientInstance.identifier}:`,
        error
      );
    }
  }
}

async function setupClients(clients: ClientInstance[], rl: readline.Interface) {
  console.log(`${getCurrentTimestamp()} - ⚙️ UnifiedMCPClient - === Client Setup ===`);
  console.log("You can connect to multiple MCP servers. Press Enter with empty input when done.");
  console.log();

  let clientNumber = 1;

  while (true) {
    console.log(`\n${getCurrentTimestamp()} - 🔧 UnifiedMCPClient - Setting up Client #${clientNumber}:`);
    console.log("1. SSE Server (e.g., http://localhost:3000/sse)");
    console.log("2. HTTP Server (e.g., http://localhost:3000/mcp)");
    console.log("3. Skip (finish setup)");

    const choice = await rl.question("Choose connection type (1-3): ");

    if (choice === "3" || choice === "") {
      break;
    }

    try {
      let client: SSEMCPClient | HTTPMCPClient;
      let type: "SSE" | "HTTP";
      let serverPath: string;

      switch (choice) {
        case "1":
          // SSE Server
          serverPath = await rl.question("Enter SSE server URL (e.g., http://localhost:3000/sse): ");
          if (!serverPath) {
            console.log(`${getCurrentTimestamp()} - ⚠️ UnifiedMCPClient - No URL provided, skipping.`);
            continue;
          }
          client = new SSEMCPClient();
          type = "SSE";
          break;

        case "2":
          // HTTP Server
          serverPath = await rl.question("Enter HTTP server URL (e.g., http://localhost:3000/mcp): ");
          if (!serverPath) {
            console.log(`${getCurrentTimestamp()} - ⚠️ UnifiedMCPClient - No URL provided, skipping.`);
            continue;
          }
          client = new HTTPMCPClient();
          type = "HTTP";
          break;

        default:
          console.log(`${getCurrentTimestamp()} - ⚠️ UnifiedMCPClient - Invalid choice, skipping.`);
          continue;
      }

      console.log(`${getCurrentTimestamp()} - 🔗 UnifiedMCPClient - Connecting to ${type} server...`);
      await client.connectToServer(serverPath);

      const identifier = `${type}-Client-${clientNumber}`;
      clients.push({ type, client, identifier });
      console.log(`${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Successfully connected ${identifier}`);
      clientNumber++;
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Failed to connect client:`, error);
      console.log("Continuing with setup...");
    }
  }

  console.log(
    `\n${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Setup complete! Connected ${clients.length} client(s).`
  );
}

async function interactiveMode(clients: ClientInstance[], rl: readline.Interface) {
  console.log(`\n${getCurrentTimestamp()} - 🤖 UnifiedMCPClient - === Unified MCP Client ===`);
  console.log("All connected servers have been unified into a single interface.");
  console.log("The LLM can see and use tools from all servers automatically.");
  console.log();

  // Create unified client that aggregates all tools and resources
  const unifiedClient = new UnifiedMCPClient(clients);
  await unifiedClient.initialize();

  console.log("Available commands:");
  console.log("- 'tools' - Show all available tools from all servers");
  console.log("- 'resources' - Show all available resources from all servers");
  console.log("- 'servers' - Show connected servers");
  console.log("- 'chat' - Start chat mode (LLM will choose appropriate tools)");
  console.log("- 'quit' - Exit");
  console.log();

  while (true) {
    const input = await rl.question("\n> ");
    const command = input.trim().toLowerCase();

    try {
      switch (command) {
        case "tools":
          console.log(`\n${getCurrentTimestamp()} - 🧰 UnifiedMCPClient - Available tools across all servers:`);
          const allTools = await unifiedClient.getAllTools();
          allTools.forEach((tool, index) => {
            console.log(`  ${index + 1}. ${tool.name} - ${tool.description} (from ${tool.source})`);
          });
          break;

        case "resources":
          console.log(`\n${getCurrentTimestamp()} - 🧰 UnifiedMCPClient - Available resources across all servers:`);
          const allResources = await unifiedClient.getAllResources();
          allResources.forEach((resource, index) => {
            console.log(`  ${index + 1}. ${resource.name} - ${resource.description} (from ${resource.source})`);
          });
          break;

        case "servers":
          console.log(`\n${getCurrentTimestamp()} - 🔗 UnifiedMCPClient - Connected servers:`);
          clients.forEach((client, index) => {
            console.log(`  ${index + 1}. ${client.identifier} (${client.type})`);
          });
          break;

        case "chat":
          console.log(
            `${getCurrentTimestamp()} - 💬 UnifiedMCPClient - Starting unified chat mode. The LLM can use tools from any connected server.`
          );
          await unifiedChatMode(unifiedClient, rl);
          break;

        case "quit":
        case "exit":
          return;

        case "help":
          console.log(`\n${getCurrentTimestamp()} - ℹ️ UnifiedMCPClient - Available commands:`);
          console.log("- 'tools' - Show all available tools from all servers");
          console.log("- 'resources' - Show all available resources from all servers");
          console.log("- 'servers' - Show connected servers");
          console.log("- 'chat' - Start chat mode (LLM will choose appropriate tools)");
          console.log("- 'quit' - Exit");
          break;

        default:
          // Treat any other input as a direct query
          if (input.trim()) {
            console.log(`${getCurrentTimestamp()} - 🤖 UnifiedMCPClient - Processing query through unified client...`);
            const response = await unifiedClient.processQuery(input.trim());
            console.log("\nResponse:");
            console.log(response);
          } else {
            console.log(
              `${getCurrentTimestamp()} - ⚠️ UnifiedMCPClient - Unknown command. Type 'help' for available commands.`
            );
          }
          break;
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Error executing command:`, error);
    }
  }
}

main();
