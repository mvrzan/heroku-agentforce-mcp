import "dotenv/config";
import express from "express";
import cors from "cors";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";
import MCPServerRoutes from "./routes/routes.js";

const app = express();
const PORT = process.env.APP_PORT || process.env.PORT || 3000;

app.use(MCPServerRoutes);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use((req, _res, next) => {
  console.log(`${getCurrentTimestamp()} - 📡 Express Server - ${req.method} ${req.originalUrl}`);

  next();
});

const httpServer = app.listen(PORT, () => {
  console.log(`${getCurrentTimestamp()} - 🚀 Express Server - MCP Client-Server API starting...`);
  console.log(`${getCurrentTimestamp()} - 🌐 Express Server - Server running on http://localhost:${PORT}`);
  console.log(`${getCurrentTimestamp()} - � Express Server - Available endpoints:`);
  console.log(`  - POST /mcp/remote     - Connect to remote MCP server`);
  console.log(`  - POST /mcp/local      - Create local MCP server`);
  console.log(`${getCurrentTimestamp()} - ✅ Express Server - Ready to accept requests`);
});

httpServer.on("error", (error: any) => {
  console.error(`${getCurrentTimestamp()} - ❌ Express Server - Server error:`, error);

  if (error.code === "EADDRINUSE") {
    console.error(`${getCurrentTimestamp()} - ❌ Express Server - Port ${PORT} is already in use`);
    process.exit(1);
  }
});

async function gracefulShutdown(signal: string) {
  console.log(`${getCurrentTimestamp()} - � Express Server - Received ${signal}, shutting down gracefully...`);

  httpServer.close(() => {
    console.log(`${getCurrentTimestamp()} - ✅ Express Server - HTTP server closed successfully`);
    console.log(`${getCurrentTimestamp()} - 👋 Express Server - Goodbye!`);
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error(`${getCurrentTimestamp()} - ⚠️ Express Server - Forced shutdown after timeout`);
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  console.error(`${getCurrentTimestamp()} - ❌ Express Server - Uncaught exception:`, error);
  console.error(`${getCurrentTimestamp()} - 🛑 Express Server - Process will exit`);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(`${getCurrentTimestamp()} - ❌ Express Server - Unhandled rejection at:`, promise);
  console.error(`${getCurrentTimestamp()} - ❌ Express Server - Reason:`, reason);
  console.error(`${getCurrentTimestamp()} - 🛑 Express Server - Process will exit`);
  process.exit(1);
});
