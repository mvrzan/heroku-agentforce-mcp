import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";

async function main() {
  const serverScriptPath = process.argv[2];

  if (!serverScriptPath.endsWith(".js")) {
    throw new Error(`${getCurrentTimestamp()} - ❌ testServer - Server script must be a .js file`);
  }

  // Create client and transport
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverScriptPath],
  });

  try {
    // Connect to the server
    await client.connect(transport);
    console.log(`${getCurrentTimestamp()} - ✅ testServer - Connected to MCP Server...`);

    // List available tools
    const toolsResult = await client.listTools();

    if (!toolsResult.tools || toolsResult.tools.length === 0) {
      console.log(`${getCurrentTimestamp()} - ❌ testServer - No tools found!`);
      return;
    }

    console.log(`${getCurrentTimestamp()} - 🕵️‍♀️ testServer - Found ${toolsResult.tools.length} tools:`);

    // Display each tool's details
    for (const tool of toolsResult.tools) {
      console.log(`${getCurrentTimestamp()} - 🔧 testServer - Tool: ${tool.name}`);
      console.log(`${getCurrentTimestamp()} - 🔧 testServer - Description: ${tool.description}`);
    }

    // List available resources
    const resources = await client.listResources();
    console.log(`${getCurrentTimestamp()} - 🗃️ testServer - Available resources:`, resources);

    if (resources.resources.length === 0 || !resources.resources) {
      console.log(`${getCurrentTimestamp()} -  ❌ testServer - No resources found!`);
      return;
    }

    const resource = resources.resources[0];
    console.log(`${getCurrentTimestamp()} - 🤓 testServer - Trying to read resource: ${resource.uri}`);

    const content = await client.readResource({ uri: resource.uri });
    console.log(`${getCurrentTimestamp()} - 👀 testServer - Resource content:`, content);
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ testServer - Error:`, error);
  } finally {
    // Cleanup
    await client.close();
    console.log(`${getCurrentTimestamp()} - 🚪 testServer - Client closed!`);
  }
}

main();
