import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getCurrentTimestamp } from "./loggingUtil.js";
import { BaseMCPClient } from "./BaseMCPClient.js";

export class HTTPMCPClient extends BaseMCPClient {
  constructor() {
    super("http-mcp-client", "HTTP");
  }

  async connectToServer(serverUrl: string): Promise<void> {
    try {
      // Create HTTP transport for the server
      this.transport = new StreamableHTTPClientTransport(new URL(serverUrl));
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
