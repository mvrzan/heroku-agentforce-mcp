import express from "express";
import cors from "cors";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";

const USER_AGENT = "weather-app/1.0";
const NWS_API_BASE = "https://api.weather.gov";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Weather API types
interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

// Helper functions
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || "Unknown"}`,
    `Area: ${props.areaDesc || "Unknown"}`,
    `Severity: ${props.severity || "Unknown"}`,
    `Status: ${props.status || "Unknown"}`,
    `Headline: ${props.headline || "No headline"}`,
    "---",
  ].join("\n");
}

// Create the weather MCP server
function createWeatherServer() {
  const server = new McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  });

  // Register tools
  server.tool(
    "get-alerts",
    "Get weather alerts for a state",
    {
      state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
    },
    async ({ state }) => {
      const stateCode = state.toUpperCase();
      const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
      const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

      if (!alertsData) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve weather alerts for state: ${stateCode}`,
            },
          ],
        };
      }

      const alerts = alertsData.features || [];
      if (alerts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No active weather alerts for ${stateCode}`,
            },
          ],
        };
      }

      const formattedAlerts = alerts.map(formatAlert);
      const alertsText = `Active Weather Alerts for ${stateCode}:\n\n${formattedAlerts.join("\n\n")}`;

      return {
        content: [
          {
            type: "text",
            text: alertsText,
          },
        ],
      };
    }
  );

  server.tool(
    "get-forecast",
    "Get weather forecast for coordinates",
    {
      latitude: z.number().describe("Latitude coordinate"),
      longitude: z.number().describe("Longitude coordinate"),
    },
    async ({ latitude, longitude }) => {
      const pointsUrl = `${NWS_API_BASE}/points/${latitude},${longitude}`;
      const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

      if (!pointsData) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
            },
          ],
        };
      }

      const forecastUrl = pointsData.properties?.forecast;
      if (!forecastUrl) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to get forecast URL from grid point data",
            },
          ],
        };
      }

      const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
      if (!forecastData) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve forecast data",
            },
          ],
        };
      }

      const periods = forecastData.properties?.periods || [];
      if (periods.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No forecast periods available",
            },
          ],
        };
      }

      const formattedForecast = periods.map((period: ForecastPeriod) =>
        [
          `${period.name || "Unknown"}:`,
          `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
          `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
          `${period.shortForecast || "No forecast available"}`,
          "---",
        ].join("\n")
      );

      const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;

      return {
        content: [
          {
            type: "text",
            text: forecastText,
          },
        ],
      };
    }
  );

  // Register resources
  server.registerResource(
    "weather-data",
    "file:///data.json",
    {
      title: "Weather and Climate Data",
      description: "Comprehensive weather and climate change dataset",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const filePath = path.resolve(__dirname, "..", "src", "data", "data.json");
        console.error(`${getCurrentTimestamp()} - 🔍 HTTP server - Looking for data file at: ${filePath}`);

        if (!fs.existsSync(filePath)) {
          console.error(`${getCurrentTimestamp()} - ❌ HTTP server - File not found: ${filePath}`);
          throw new Error(`Resource not found: ${uri.href}`);
        }

        const content = fs.readFileSync(filePath, "utf-8");
        console.error(
          `${getCurrentTimestamp()} - ✅ HTTP server - Successfully read JSON data (${content.length} bytes)`
        );

        return {
          contents: [
            {
              title: "Weather and Climate Data",
              description: "Comprehensive weather and climate change dataset",
              uri: uri.href,
              text: content,
              mimeType: "application/json",
            },
          ],
        };
      } catch (error) {
        console.error(`${getCurrentTimestamp()} - ❌ HTTP server - Error reading resource: ${error}`);
        throw new Error(`Failed to read resource: ${uri.href}`);
      }
    }
  );

  // Register prompts
  server.prompt(
    "weather-assistant",
    "Weather assistant that provides forecasts, alerts, and climate data",
    async () => {
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `You are a helpful weather assistant that can provide information about:

1. Weather forecasts for specific locations
2. Weather alerts for states in the US
3. Climate data and trends from the server data file

When responding to users:
- For current conditions and forecasts, use the weather tools
- For historical climate data, reference the weather-data resource
- Use a friendly, conversational tone
- Always include relevant temperature units (F/C)
- Format alerts and warnings prominently
- If location is ambiguous, ask for clarification

Remember to format your responses clearly with appropriate sections for readability.`,
            },
          },
        ],
      };
    }
  );

  return server;
}

// Express app setup
const app = express();
app.use(express.json());

// Allow CORS with proper headers for MCP
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id"],
  })
);

// Map to store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// MCP POST endpoint handler
const mcpPostHandler = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;

  if (sessionId) {
    console.error(`${getCurrentTimestamp()} - 📨 HTTP server - Received MCP request for session: ${sessionId}`);
  } else {
    console.error(`${getCurrentTimestamp()} - 📨 HTTP server - Received MCP request (no session ID)`);
  }

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
      console.error(`${getCurrentTimestamp()} - 🔄 HTTP server - Reusing existing transport for session: ${sessionId}`);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      console.error(`${getCurrentTimestamp()} - 🆕 HTTP server - Creating new transport for initialization`);

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          console.error(`${getCurrentTimestamp()} - ✅ HTTP server - Session initialized with ID: ${sessionId}`);
          transports[sessionId] = transport;
        },
      });

      // Set up onclose handler to clean up transport when closed
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.error(
            `${getCurrentTimestamp()} - 🔐 HTTP server - Transport closed for session ${sid}, removing from transports map`
          );
          delete transports[sid];
        }
      };

      // Connect the transport to the MCP server BEFORE handling the request
      const server = createWeatherServer();
      try {
        await server.connect(transport);
        console.error(`${getCurrentTimestamp()} - 🔗 HTTP server - MCP server connected to transport successfully`);
      } catch (error) {
        console.error(`${getCurrentTimestamp()} - ❌ HTTP server - Failed to connect MCP server to transport:`, error);
        throw error;
      }

      await transport.handleRequest(req, res, req.body);
      return; // Already handled
    } else {
      // Invalid request - no session ID or not initialization request
      console.error(
        `${getCurrentTimestamp()} - ❌ HTTP server - Invalid request: no session ID and not initialization`
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

    // Handle the request with existing transport
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ HTTP server - Error handling MCP request:`, error);
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

// MCP endpoint
app.post("/mcp", mcpPostHandler);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    server: "Weather MCP HTTP Server",
    version: "1.0.0",
    transport: "Streamable HTTP",
    endpoints: {
      mcp: "/mcp",
    },
    activeSessions: Object.keys(transports).length,
    timestamp: new Date().toISOString(),
  });
});

// Session management endpoint (optional - for debugging)
app.get("/sessions", (req, res) => {
  res.json({
    activeSessions: Object.keys(transports),
    count: Object.keys(transports).length,
  });
});

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.error(`${getCurrentTimestamp()} - 🏃 HTTP server - Weather MCP Server with HTTP transport running on:`);
  console.error(`  - MCP Endpoint: http://localhost:${PORT}/mcp`);
  console.error(`  - Health Check: http://localhost:${PORT}/`);
  console.error(`  - Sessions:     http://localhost:${PORT}/sessions`);
  console.error(`${getCurrentTimestamp()} - 🎯 HTTP server - Server is ready to accept connections`);
});

// Handle server errors
server.on("error", (error) => {
  console.error(`${getCurrentTimestamp()} - ❌ HTTP server - Server error:`, error);
});

// Graceful shutdown handling
process.on("SIGINT", async () => {
  console.error(`${getCurrentTimestamp()} - 🛑 HTTP server - Received SIGINT, shutting down gracefully...`);

  // Close all active transports
  for (const sessionId in transports) {
    try {
      console.error(`${getCurrentTimestamp()} - 🔐 HTTP server - Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(
        `${getCurrentTimestamp()} - ❌ HTTP server - Error closing transport for session ${sessionId}:`,
        error
      );
    }
  }

  // Close the HTTP server
  server.close(() => {
    console.error(`${getCurrentTimestamp()} - ✅ HTTP server - Server closed successfully`);
    process.exit(0);
  });
});

process.on("SIGTERM", async () => {
  console.error(`${getCurrentTimestamp()} - 🛑 HTTP server - Received SIGTERM, shutting down gracefully...`);

  // Close all active transports
  for (const sessionId in transports) {
    try {
      console.error(`${getCurrentTimestamp()} - 🔐 HTTP server - Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(
        `${getCurrentTimestamp()} - ❌ HTTP server - Error closing transport for session ${sessionId}:`,
        error
      );
    }
  }

  // Close the HTTP server
  server.close(() => {
    console.error(`${getCurrentTimestamp()} - ✅ HTTP server - Server closed successfully`);
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error(`${getCurrentTimestamp()} - ❌ HTTP server - Uncaught exception:`, error);
  console.error(
    `${getCurrentTimestamp()} - 🛑 HTTP server - Server will continue running, but this should be investigated`
  );
});

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error(`${getCurrentTimestamp()} - ❌ HTTP server - Unhandled rejection at:`, promise, "reason:", reason);
  console.error(
    `${getCurrentTimestamp()} - 🛑 HTTP server - Server will continue running, but this should be investigated`
  );
});
