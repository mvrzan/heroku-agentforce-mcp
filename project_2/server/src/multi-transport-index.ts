import fs from "fs";
import path from "path";
import { z } from "zod";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";

import {
  AlertsResponse,
  makeNWSRequest,
  formatAlert,
  PointsResponse,
  ForecastResponse,
  ForecastPeriod,
} from "./utils/helpers.js";

const NWS_API_BASE = "https://api.weather.gov";

// Get current directory for relative path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create server instance
function createMCPServer() {
  const server = new McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  });

  console.error(`${getCurrentTimestamp()} - 📝 server index - Registering tools...`);

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

      // Get forecast data
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

      // Format forecast periods
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

  console.error(`${getCurrentTimestamp()} - 📝 server index - Registering resources...`);

  // register local resources/files
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
        console.error(`${getCurrentTimestamp()} - 🔍 server index - Looking for data file at: ${filePath}`);

        if (!fs.existsSync(filePath)) {
          console.error(`${getCurrentTimestamp()} - ❌ server index - File not found: ${filePath}`);
          throw new Error(`Resource not found: ${uri.href}`);
        }

        // Read JSON content
        const content = fs.readFileSync(filePath, "utf-8");
        console.error(
          `${getCurrentTimestamp()} - ✅ server index - Successfully read JSON data (${content.length} bytes)`
        );

        // Return the content properly formatted according to MCP protocol
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
        console.error(`${getCurrentTimestamp()} - ❌ server index - Error reading resource: ${error}`);
        throw new Error(`Failed to read resource: ${uri.href}`);
      }
    }
  );

  // Register weather prompt
  console.error(`${getCurrentTimestamp()} - 📝 server index - Registering prompts...`);

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

  console.error(`${getCurrentTimestamp()} - ✅ server index - All registrations completed!`);

  return server;
}

// Check command line arguments to determine transport mode
function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args[0] || "stdio";
  const port = parseInt(args[1]) || 3000;

  return { mode, port };
}

async function main() {
  const { mode, port } = parseArgs();

  console.error(
    `${getCurrentTimestamp()} - 🚀 server index - Starting weather MCP server in ${mode.toUpperCase()} mode`
  );

  try {
    const server = createMCPServer();

    switch (mode.toLowerCase()) {
      case "stdio":
        await runStdioServer(server);
        break;
      case "sse":
        await runSSEServer(server, port);
        break;
      case "http":
        await runHTTPServer(server, port);
        break;
      case "multi":
        await runMultiServer(server, port);
        break;
      default:
        console.error(`${getCurrentTimestamp()} - ❌ server index - Unknown mode: ${mode}`);
        console.error("Usage: node index.js [stdio|sse|http|multi] [port]");
        process.exit(1);
    }
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ server index - Error occurred when starting MCP Server:`, error);
    process.exit(1);
  }
}

async function runStdioServer(server: McpServer) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${getCurrentTimestamp()} - 🏃 server index - Weather MCP Server running on stdio!`);
}

async function runSSEServer(server: McpServer, port: number) {
  const app = express();
  app.use(cors());

  const transport = new SSEServerTransport("/sse", server);
  app.use(transport.expressHandler);

  app.listen(port, () => {
    console.error(
      `${getCurrentTimestamp()} - 🏃 server index - Weather MCP Server with SSE transport running on http://localhost:${port}/sse`
    );
  });
}

async function runHTTPServer(server: McpServer, port: number) {
  const app = express();
  app.use(cors());

  const transport = new StreamableHTTPServerTransport("/mcp", server);
  app.use(transport.expressHandler);

  app.listen(port, () => {
    console.error(
      `${getCurrentTimestamp()} - 🏃 server index - Weather MCP Server with HTTP transport running on http://localhost:${port}/mcp`
    );
  });
}

async function runMultiServer(server: McpServer, port: number) {
  const app = express();
  app.use(cors());

  // Set up both SSE and HTTP transports on the same server
  const sseTransport = new SSEServerTransport("/sse", server);
  const httpTransport = new StreamableHTTPServerTransport("/mcp", server);

  app.use(sseTransport.expressHandler);
  app.use(httpTransport.expressHandler);

  // Add a simple status endpoint
  app.get("/", (req, res) => {
    res.json({
      server: "Weather MCP Server",
      version: "1.0.0",
      transports: {
        sse: `http://localhost:${port}/sse`,
        http: `http://localhost:${port}/mcp`,
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.listen(port, () => {
    console.error(
      `${getCurrentTimestamp()} - 🏃 server index - Weather MCP Server with multiple transports running on:`
    );
    console.error(`  - SSE:  http://localhost:${port}/sse`);
    console.error(`  - HTTP: http://localhost:${port}/mcp`);
    console.error(`  - Info: http://localhost:${port}/`);
  });
}

main();
