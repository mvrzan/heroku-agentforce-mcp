import { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { getCurrentTimestamp } from "../utils/loggingUtil.js";
import createWeatherServer from "../utils/UnifiedMCPServer.js";

const sseTransports = new Map<string, SSEServerTransport>();

export const SSEFunction = async (_req: Request, res: Response) => {
  console.error(
    `${getCurrentTimestamp()} - 🔗 Unified server - Received GET request to /sse (establishing SSE stream)`
  );

  try {
    // Create a new SSE transport for the client
    const transport = new SSEServerTransport("/messages", res);

    // Store the transport by session ID
    const sessionId = transport.sessionId;
    sseTransports.set(sessionId, transport);

    // Set up onclose handler to clean up transport when closed
    transport.onclose = () => {
      console.error(`${getCurrentTimestamp()} - 🔐 Unified server - SSE transport closed for session ${sessionId}`);
      sseTransports.delete(sessionId);
    };

    // Connect the transport to a new MCP server instance
    const server = createWeatherServer("SSE");
    await server.connect(transport);

    console.error(
      `${getCurrentTimestamp()} - ✅ Unified server - Established SSE stream with session ID: ${sessionId}`
    );
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ Unified server - Error establishing SSE stream:`, error);
    if (!res.headersSent) {
      res.status(500).send("Error establishing SSE stream");
    }
  }
};

export const messages = async (req: Request, res: Response) => {
  console.error(`${getCurrentTimestamp()} - 📨 Unified server - Received POST request to /messages (SSE)`);

  // Extract session ID from URL query parameter
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    console.error(`${getCurrentTimestamp()} - ❌ Unified server - No session ID provided in SSE request URL`);
    return res.status(400).json({ error: "Session ID is required" });
  }

  const transport = sseTransports.get(sessionId);
  if (!transport) {
    console.error(`${getCurrentTimestamp()} - ❌ Unified server - No SSE transport found for session ID: ${sessionId}`);
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    console.error(
      `${getCurrentTimestamp()} - 📤 Unified server - Handling SSE message via transport for session: ${sessionId}`
    );
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ Unified server - Error handling SSE request:`, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
