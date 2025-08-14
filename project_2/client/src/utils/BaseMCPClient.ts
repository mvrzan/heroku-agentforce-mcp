import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { getCurrentTimestamp } from "./loggingUtil.js";

export abstract class BaseMCPClient {
  protected mcp: Client;
  protected transport: any = null;
  protected tools: Tool[] = [];
  protected clientType: string;

  constructor(clientName: string, clientType: string) {
    this.mcp = new Client({ name: clientName, version: "1.0.0" });
    this.clientType = clientType;
  }

  abstract connectToServer(serverUrl: string): Promise<void>;

  protected async initializeConnection(serverUrl: string) {
    console.log(
      `${getCurrentTimestamp()} - 🔗 ${this.clientType}MCPClient - Connecting to ${
        this.clientType
      } server at: ${serverUrl}`
    );

    await this.mcp.connect(this.transport);

    const toolsResult = await this.mcp.listTools();
    this.tools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    console.log(
      `${getCurrentTimestamp()} - 🔌 ${this.clientType}MCPClient - Connected to ${this.clientType} server with tools:`,
      this.tools.map(({ name }) => name)
    );

    const resources = await this.mcp.listResources();
    if (resources.resources && resources.resources.length > 0) {
      console.log(
        `${getCurrentTimestamp()} - 🧰 ${this.clientType}MCPClient - Available resources:`,
        resources.resources.map((resource) => resource.name).join(", ")
      );
    }
  }

  async cleanup() {
    await this.mcp.close();
  }

  get mcpClient() {
    return this.mcp;
  }
}
