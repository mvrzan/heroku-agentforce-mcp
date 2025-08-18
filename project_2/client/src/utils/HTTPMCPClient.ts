import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getCurrentTimestamp } from "./loggingUtil.js";
import { BaseMCPClient } from "./BaseMCPClient.js";

export class HTTPMCPClient extends BaseMCPClient {
  constructor() {
    super("http-mcp-client", "HTTP");
  }

  async connectToServer(serverUrl: string): Promise<void> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error(
          `${getCurrentTimestamp()} - ❌ SSEMCPClient - SSE server URL must start with http:// or https://`
        );
      }

      const headers: Record<string, string> = {};
      const mcpApiKey = process.env.MCP_CLIENT_API_KEY;

      if (mcpApiKey) {
        headers["Authorization"] = `Bearer ${mcpApiKey}`;
        console.log(`${getCurrentTimestamp()} - 🔑 HTTPMCPClient - Using API key authentication`);
      }

      this.transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        requestInit: {
          headers,
        },
      });
      await this.initializeConnection(serverUrl);
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ HTTPMCPClient - Failed to connect to HTTP server:`, error);
      throw error;
    }
  }

  get sessionId(): string | undefined {
    return this.transport?.sessionId;
  }
}
