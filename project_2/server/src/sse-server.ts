import express from "express";
import cors from "cors";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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
        console.error(`${getCurrentTimestamp()} - 🔍 SSE server - Looking for data file at: ${filePath}`);

        if (!fs.existsSync(filePath)) {
          console.error(`${getCurrentTimestamp()} - ❌ SSE server - File not found: ${filePath}`);
          throw new Error(`Resource not found: ${uri.href}`);
        }

        const content = fs.readFileSync(filePath, "utf-8");
        console.error(
          `${getCurrentTimestamp()} - ✅ SSE server - Successfully read JSON data (${content.length} bytes)`
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
        console.error(`${getCurrentTimestamp()} - ❌ SSE server - Error reading resource: ${error}`);
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
app.use(cors());
app.use(express.json());

const transports = new Map();

// SSE endpoint for establishing the stream
app.get("/sse", async (req, res) => {
  console.error(`${getCurrentTimestamp()} - 🔗 SSE server - Received GET request to /sse (establishing SSE stream)`);

  try {
    // Create a new SSE transport for the client
    const transport = new SSEServerTransport("/messages", res);

    // Store the transport by session ID
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    // Set up onclose handler to clean up transport when closed
    transport.onclose = () => {
      console.error(`${getCurrentTimestamp()} - 🔐 SSE server - SSE transport closed for session ${sessionId}`);
      transports.delete(sessionId);
    };

    // Connect the transport to the MCP server
    const server = createWeatherServer();
    await server.connect(transport);

    console.error(`${getCurrentTimestamp()} - ✅ SSE server - Established SSE stream with session ID: ${sessionId}`);
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ SSE server - Error establishing SSE stream:`, error);
    if (!res.headersSent) {
      res.status(500).send("Error establishing SSE stream");
    }
  }
});

// Messages endpoint for receiving client JSON-RPC requests
app.post("/messages", async (req, res) => {
  console.error(`${getCurrentTimestamp()} - 📨 SSE server - Received POST request to /messages`);

  // Extract session ID from URL query parameter
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    console.error(`${getCurrentTimestamp()} - ❌ SSE server - No session ID provided in request URL`);
    return res.status(400).json({ error: "Session ID is required" });
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    console.error(`${getCurrentTimestamp()} - ❌ SSE server - No transport found for session ID: ${sessionId}`);
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    // Use the handlePostMessage method which is the correct way for SSE transport
    console.error(
      `${getCurrentTimestamp()} - 📤 SSE server - Handling message via transport for session: ${sessionId}`
    );

    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ SSE server - Error handling request:`, error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    server: "Weather MCP SSE Server",
    version: "1.0.0",
    transport: "SSE",
    endpoints: {
      sse: "/sse",
      messages: "/messages",
    },
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.error(`${getCurrentTimestamp()} - 🏃 SSE server - Weather MCP Server with SSE transport running on:`);
  console.error(`  - SSE Stream: http://localhost:${PORT}/sse`);
  console.error(`  - Messages:   http://localhost:${PORT}/messages`);
  console.error(`  - Health:     http://localhost:${PORT}/`);
});
