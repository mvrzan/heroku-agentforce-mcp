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
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPClient - ANTHROPIC_API_KEY is not set!`);
}

if (!ANTHROPIC_CLAUDE_MODEL) {
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPClient - ANTHROPIC_CLAUDE_MODEL is not set!`);
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
    console.log("Initializing unified client...");

    // Collect all tools and resources from all clients
    for (const clientInstance of this.clients) {
      try {
        // Get tools from this client - we need to access the internal tools
        const clientTools = await this.getClientTools(clientInstance.client);
        clientTools.forEach((tool) => {
          this.unifiedTools.push({
            name: tool.name,
            description: tool.description || "No description",
            input_schema: tool.input_schema,
            source: clientInstance.identifier,
            client: clientInstance.client,
          });
        });

        // Get resources from this client
        const clientResources = await this.getClientResources(clientInstance.client);
        clientResources.forEach((resource) => {
          this.unifiedResources.push({
            name: resource.name || "Unknown Resource",
            description: resource.description || "No description",
            uri: resource.uri || "",
            source: clientInstance.identifier,
            client: clientInstance.client,
          });
        });

        console.log(`✅ Integrated ${clientInstance.identifier}`);
      } catch (error) {
        console.error(`❌ Failed to integrate ${clientInstance.identifier}:`, error);
      }
    }

    console.log(
      `🔄 Unified client ready with ${this.unifiedTools.length} tools and ${this.unifiedResources.length} resources`
    );
  }

  private async getClientTools(client: SSEMCPClient | HTTPMCPClient): Promise<Tool[]> {
    // Access the private tools property - we'll need to make this accessible
    // For now, let's try to get tools through the MCP client's listTools method
    try {
      // This is a bit of a hack, but we need to access the MCP client
      const mcpClient = (client as any).mcp;
      if (mcpClient) {
        const toolsResult = await mcpClient.listTools();
        return toolsResult.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        }));
      }
    } catch (error) {
      console.error("Error getting tools from client:", error);
    }
    return [];
  }

  private async getClientResources(client: SSEMCPClient | HTTPMCPClient): Promise<any[]> {
    try {
      const mcpClient = (client as any).mcp;
      if (mcpClient) {
        const resourcesResult = await mcpClient.listResources();
        return resourcesResult.resources || [];
      }
    } catch (error) {
      console.error("Error getting resources from client:", error);
    }
    return [];
  }

  async getAllTools(): Promise<UnifiedTool[]> {
    return this.unifiedTools;
  }

  async getAllResources(): Promise<UnifiedResource[]> {
    return this.unifiedResources;
  }

  async processQuery(query: string): Promise<string> {
    try {
      const messages: MessageParam[] = [
        {
          role: "user",
          content: query,
        },
      ];

      // Convert unified tools to Anthropic format
      const tools: Tool[] = this.unifiedTools.map((tool) => ({
        name: tool.name,
        description: `${tool.description} (from ${tool.source})`,
        input_schema: tool.input_schema,
      }));

      console.log(`🤖 Querying Claude with ${tools.length} available tools...`);

      let response = await this.anthropic.messages.create({
        model: ANTHROPIC_CLAUDE_MODEL!,
        max_tokens: 1500,
        messages,
        tools: tools,
      });

      const finalText: string[] = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          const toolName = content.name;
          const toolArgs = content.input as { [x: string]: unknown } | undefined;

          // Find the unified tool and its source client
          const unifiedTool = this.unifiedTools.find((t) => t.name === toolName);
          if (!unifiedTool) {
            finalText.push(`Error: Tool ${toolName} not found`);
            continue;
          }

          console.log(`🔧 Calling tool ${toolName} on ${unifiedTool.source}`);

          // Call the tool on the appropriate client
          const mcpClient = (unifiedTool.client as any).mcp;
          const result = await mcpClient.callTool({
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
            model: ANTHROPIC_CLAUDE_MODEL!,
            max_tokens: 1000,
            messages,
            tools: tools,
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
}

async function unifiedChatMode(unifiedClient: UnifiedMCPClient, rl: readline.Interface) {
  console.log("\n🤖 Unified Chat Mode - Connected to all MCP servers");
  console.log("Claude will automatically select the best tools from all available servers");
  console.log("Type 'quit' to exit\n");

  const allTools = await unifiedClient.getAllTools();
  const allResources = await unifiedClient.getAllResources();

  console.log(`Available tools: ${allTools.map((t) => `${t.name} (${t.source})`).join(", ")}`);
  if (allResources.length > 0) {
    console.log(`Available resources: ${allResources.map((r) => `${r.name} (${r.source})`).join(", ")}`);
  }
  console.log();

  while (true) {
    const input = await rl.question("You: ");
    if (input.toLowerCase() === "quit") break;

    console.log("🤖 Processing...");
    const response = await unifiedClient.processQuery(input);
    console.log("Assistant:", response);
    console.log();
  }
}

async function main() {
  console.log("Multi-MCP Client CLI");
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

  try {
    // Setup phase - connect to servers
    await setupClients(clients, rl);

    if (clients.length === 0) {
      console.log("No clients connected. Exiting.");
      return;
    }

    // Interactive phase - choose clients and send queries
    await interactiveMode(clients, rl);
  } finally {
    // Cleanup all clients
    console.log("\nCleaning up clients...");
    for (const clientInstance of clients) {
      try {
        await clientInstance.client.cleanup();
      } catch (error) {
        console.error(`Error cleaning up ${clientInstance.identifier}:`, error);
      }
    }
    rl.close();
    process.exit(0);
  }
}

async function setupClients(clients: ClientInstance[], rl: readline.Interface) {
  console.log("=== Client Setup ===");
  console.log("You can connect to multiple MCP servers. Press Enter with empty input when done.");
  console.log();

  let clientNumber = 1;

  while (true) {
    console.log(`\nSetting up Client #${clientNumber}:`);
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
            console.log("No URL provided, skipping.");
            continue;
          }
          client = new SSEMCPClient();
          type = "SSE";
          break;

        case "2":
          // HTTP Server
          serverPath = await rl.question("Enter HTTP server URL (e.g., http://localhost:3000/mcp): ");
          if (!serverPath) {
            console.log("No URL provided, skipping.");
            continue;
          }
          client = new HTTPMCPClient();
          type = "HTTP";
          break;

        default:
          console.log("Invalid choice, skipping.");
          continue;
      }

      console.log(`Connecting to ${type} server...`);
      await client.connectToServer(serverPath);

      const identifier = `${type}-Client-${clientNumber}`;
      clients.push({ type, client, identifier });
      console.log(`✅ Successfully connected ${identifier}`);
      clientNumber++;
    } catch (error) {
      console.error(`❌ Failed to connect client: ${error}`);
      console.log("Continuing with setup...");
    }
  }

  console.log(`\n✅ Setup complete! Connected ${clients.length} client(s).`);
}

async function interactiveMode(clients: ClientInstance[], rl: readline.Interface) {
  console.log("\n=== Unified MCP Client ===");
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
          console.log("\nAvailable tools across all servers:");
          const allTools = await unifiedClient.getAllTools();
          allTools.forEach((tool, index) => {
            console.log(`  ${index + 1}. ${tool.name} - ${tool.description} (from ${tool.source})`);
          });
          break;

        case "resources":
          console.log("\nAvailable resources across all servers:");
          const allResources = await unifiedClient.getAllResources();
          allResources.forEach((resource, index) => {
            console.log(`  ${index + 1}. ${resource.name} - ${resource.description} (from ${resource.source})`);
          });
          break;

        case "servers":
          console.log("\nConnected servers:");
          clients.forEach((client, index) => {
            console.log(`  ${index + 1}. ${client.identifier} (${client.type})`);
          });
          break;

        case "chat":
          console.log("Starting unified chat mode. The LLM can use tools from any connected server.");
          await unifiedChatMode(unifiedClient, rl);
          break;

        case "quit":
        case "exit":
          return;

        case "help":
          console.log("\nAvailable commands:");
          console.log("- 'tools' - Show all available tools from all servers");
          console.log("- 'resources' - Show all available resources from all servers");
          console.log("- 'servers' - Show connected servers");
          console.log("- 'chat' - Start chat mode (LLM will choose appropriate tools)");
          console.log("- 'quit' - Exit");
          break;

        default:
          // Treat any other input as a direct query
          if (input.trim()) {
            console.log("Processing query through unified client...");
            const response = await unifiedClient.processQuery(input.trim());
            console.log("\nResponse:");
            console.log(response);
          } else {
            console.log("Unknown command. Type 'help' for available commands.");
          }
          break;
      }
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
}

async function chatMode(clientInstance: ClientInstance, rl: readline.Interface) {
  console.log(`\n=== Chat Mode: ${clientInstance.identifier} ===`);

  while (true) {
    const query = await rl.question(`\n[${clientInstance.identifier}] Query: `);

    if (query.toLowerCase() === "quit" || query.toLowerCase() === "exit") {
      break;
    }

    if (query.trim()) {
      try {
        const response = await clientInstance.client.processQuery(query.trim());
        console.log(`\n[${clientInstance.identifier}] Response:`);
        console.log(response);
      } catch (error) {
        console.error(`Error processing query: ${error}`);
      }
    }
  }
}

async function broadcastQuery(clients: ClientInstance[], query: string) {
  console.log(`\nBroadcasting query to ${clients.length} client(s): "${query}"`);
  console.log("=" + "=".repeat(50));

  const promises = clients.map(async (clientInstance) => {
    try {
      const response = await clientInstance.client.processQuery(query);
      return { client: clientInstance.identifier, response, success: true };
    } catch (error) {
      return { client: clientInstance.identifier, response: `Error: ${error}`, success: false };
    }
  });

  const results = await Promise.all(promises);

  results.forEach((result) => {
    const status = result.success ? "✅" : "❌";
    console.log(`\n${status} [${result.client}]:`);
    console.log(result.response);
    console.log("-".repeat(50));
  });
}

main();
