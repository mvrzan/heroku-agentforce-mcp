import fs from "fs";
import path from "path";
import { z } from "zod";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";

import {
  AlertsResponse,
  makeNWSRequest,
  formatAlert,
  PointsResponse,
  ForecastResponse,
  ForecastPeriod,
} from "./helpers.js";

const NWS_API_BASE = "https://api.weather.gov";

// Get current directory for relative path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create server instance
const server = new McpServer({
  name: "weather",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
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
            text: "Failed to retrieve alerts data",
          },
        ],
      };
    }

    const features = alertsData.features || [];
    if (features.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No active alerts for ${stateCode}`,
          },
        ],
      };
    }

    const formattedAlerts = features.map(formatAlert);
    const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;

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
  "Get weather forecast for a location",
  {
    latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
    longitude: z.number().min(-180).max(180).describe("Longitude of the location"),
  },
  async ({ latitude, longitude }) => {
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
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

console.error(`${getCurrentTimestamp()} - ✅ server index - Resource registration completed!`);

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(`${getCurrentTimestamp()} - 🏃 server index - Weather MCP Server running on stdio!`);
  } catch (error) {
    console.error(
      `${getCurrentTimestamp()} - ❌ server index - Error occurred when trying to start the MCP Server!`,
      error
    );
    process.exit(1);
  }
}

main();
