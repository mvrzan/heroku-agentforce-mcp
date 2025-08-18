import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getCurrentTimestamp } from "./loggingUtil.js";
import { BaseMCPClient } from "./BaseMCPClient.js";

export class SSEMCPClient extends BaseMCPClient {
  constructor() {
    super("sse-mcp-client", "SSE");
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
        console.log(`${getCurrentTimestamp()} - 🔑 SSEMCPClient - Using API key authentication`);
      }

      this.transport = new SSEClientTransport(new URL(serverUrl), {
        requestInit: {
          headers,
        },
      });

      await this.initializeConnection(serverUrl);
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ SSEMCPClient - Failed to connect to SSE server:`, error);
      throw error;
    }
  }
}
