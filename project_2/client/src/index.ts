import "dotenv/config";
import { SSEMCPClient } from "./utils/SSEMCPClient.js";
import { HTTPMCPClient } from "./utils/HTTPMCPClient.js";
import readline from "readline/promises";

interface ClientInstance {
  type: "SSE" | "HTTP";
  client: SSEMCPClient | HTTPMCPClient;
  identifier: string;
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
  console.log("\n=== Interactive Mode ===");
  console.log("Available commands:");
  console.log("- 'list' - Show all connected clients");
  console.log("- 'use <number>' - Switch to a specific client");
  console.log("- 'chat' - Start chat mode with current client");
  console.log("- 'broadcast <query>' - Send query to all clients");
  console.log("- 'quit' - Exit");
  console.log();

  let currentClient: ClientInstance | null = clients.length > 0 ? clients[0] : null;

  if (currentClient) {
    console.log(`Current active client: ${currentClient.identifier}`);
  }

  while (true) {
    const input = await rl.question("\n> ");
    const args = input.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    try {
      switch (command) {
        case "list":
          console.log("\nConnected clients:");
          clients.forEach((client, index) => {
            const current = client === currentClient ? " (current)" : "";
            console.log(`  ${index + 1}. ${client.identifier}${current}`);
          });
          break;

        case "use":
          const clientNum = parseInt(args[1]);
          if (clientNum > 0 && clientNum <= clients.length) {
            currentClient = clients[clientNum - 1];
            console.log(`Switched to: ${currentClient.identifier}`);
          } else {
            console.log(`Invalid client number. Use 'list' to see available clients.`);
          }
          break;

        case "chat":
          if (!currentClient) {
            console.log("No client selected. Use 'use <number>' to select a client.");
            break;
          }
          console.log(`Starting chat mode with ${currentClient.identifier}. Type 'quit' to exit chat mode.`);
          await chatMode(currentClient, rl);
          console.log(`Exited chat mode with ${currentClient.identifier}`);
          break;

        case "broadcast":
          const query = args.slice(1).join(" ");
          if (!query) {
            console.log("Please provide a query to broadcast.");
            break;
          }
          await broadcastQuery(clients, query);
          break;

        case "quit":
        case "exit":
          return;

        default:
          // Try to process as a query with the current client
          if (currentClient && input.trim()) {
            const response = await currentClient.client.processQuery(input.trim());
            console.log(`\n[${currentClient.identifier}] Response:`);
            console.log(response);
          } else if (!currentClient) {
            console.log("No client selected. Use 'use <number>' to select a client or type 'help' for commands.");
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
