import "dotenv/config";
import express from "express";
import cors from "cors";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";
import MCPServerRoutes from "./routes/routes.js";

const app = express();
app.use(express.json());
app.use(MCPServerRoutes);
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id"],
  })
);

const sseTransports = new Map<string, SSEServerTransport>();
const httpTransports: Record<string, StreamableHTTPServerTransport> = {};
const PORT = process.env.APP_PORT || process.env.PORT || 3000;

const httpServer = app.listen(PORT, () => {
  console.error(`${getCurrentTimestamp()} - 🏃 Unified server - Weather MCP Unified Server running on:`);
  console.error(`  - SSE Transport:  http://localhost:${PORT}/sse`);
  console.error(`  - HTTP Transport: http://localhost:${PORT}/http`);
  console.error(`${getCurrentTimestamp()} - 🎯 Unified server - Server is ready to accept connections`);
});

httpServer.on("error", (error) => {
  console.error(`${getCurrentTimestamp()} - ❌ Unified server - Server error:`, error);
});

async function gracefulShutdown(signal: string) {
  console.error(`${getCurrentTimestamp()} - 🛑 Unified server - Received ${signal}, shutting down gracefully...`);

  for (const [sessionId, transport] of sseTransports) {
    try {
      console.error(`${getCurrentTimestamp()} - 🔐 Unified server - Closing SSE transport for session ${sessionId}`);
      await transport.close();
      sseTransports.delete(sessionId);
    } catch (error) {
      console.error(
        `${getCurrentTimestamp()} - ❌ Unified server - Error closing SSE transport for session ${sessionId}:`,
        error
      );
    }
  }

  for (const sessionId in httpTransports) {
    try {
      console.error(`${getCurrentTimestamp()} - 🔐 Unified server - Closing HTTP transport for session ${sessionId}`);
      await httpTransports[sessionId].close();
      delete httpTransports[sessionId];
    } catch (error) {
      console.error(
        `${getCurrentTimestamp()} - ❌ Unified server - Error closing HTTP transport for session ${sessionId}:`,
        error
      );
    }
  }

  httpServer.close(() => {
    console.error(`${getCurrentTimestamp()} - ✅ Unified server - Server closed successfully`);
    process.exit(0);
  });
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  console.error(`${getCurrentTimestamp()} - ❌ Unified server - Uncaught exception:`, error);
  console.error(
    `${getCurrentTimestamp()} - 🛑 Unified server - Server will continue running, but this should be investigated`
  );
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(`${getCurrentTimestamp()} - ❌ Unified server - Unhandled rejection at:`, promise, "reason:", reason);
  console.error(
    `${getCurrentTimestamp()} - 🛑 Unified server - Server will continue running, but this should be investigated`
  );
});
