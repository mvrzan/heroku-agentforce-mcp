import "dotenv/config";
import { MCPClient } from "./utils/MCPClient.js";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";

async function main() {
  if (process.argv.length < 3) {
    console.log(`${getCurrentTimestamp()} - 📝 MCPClient Index - Usage: node build/index.js <path_to_server_script>`);
    return;
  }

  const mcpClient = new MCPClient();

  try {
    console.log(`${getCurrentTimestamp()} - ⏳ MCPClient Index - Instantiating an MCP client...`);

    await mcpClient.connectToServer(process.argv[2]);
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();

    process.exit(0);
  }
}

main();
