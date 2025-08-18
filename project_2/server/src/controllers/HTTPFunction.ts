import { getCurrentTimestamp } from "../utils/loggingUtil.js";
import { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import unifiedMCPServer from "../utils/UnifiedMCPServer.js";

const httpTransports: Record<string, StreamableHTTPServerTransport> = {};

function isInitializeRequest(body: any): boolean {
  return body && body.method === "initialize";
}

export const HTTPFunction = async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;

  if (sessionId) {
    console.error(`${getCurrentTimestamp()} - 📨 Unified server - Received HTTP request for session: ${sessionId}`);
  } else {
    console.error(`${getCurrentTimestamp()} - 📨 Unified server - Received HTTP request (no session ID)`);
  }

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && httpTransports[sessionId]) {
      transport = httpTransports[sessionId];
      console.error(
        `${getCurrentTimestamp()} - 🔄 Unified server - Reusing existing HTTP transport for session: ${sessionId}`
      );
    } else if (!sessionId && isInitializeRequest(req.body)) {
      console.error(`${getCurrentTimestamp()} - 🆕 Unified server - Creating new HTTP transport for initialization`);

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          console.error(
            `${getCurrentTimestamp()} - ✅ Unified server - HTTP session initialized with ID: ${sessionId}`
          );
          httpTransports[sessionId] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && httpTransports[sid]) {
          console.error(
            `${getCurrentTimestamp()} - 🔐 Unified server - HTTP transport closed for session ${sid}, removing from transports map`
          );
          delete httpTransports[sid];
        }
      };

      const server = unifiedMCPServer("HTTP");

      try {
        await server.connect(transport);
        console.error(
          `${getCurrentTimestamp()} - 🔗 Unified server - HTTP MCP server connected to transport successfully`
        );
      } catch (error) {
        console.error(
          `${getCurrentTimestamp()} - ❌ Unified server - Failed to connect HTTP MCP server to transport:`,
          error
        );
        throw error;
      }

      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      console.error(
        `${getCurrentTimestamp()} - ❌ Unified server - Invalid HTTP request: no session ID and not initialization`
      );
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ Unified server - Error handling HTTP request:`, error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
};
