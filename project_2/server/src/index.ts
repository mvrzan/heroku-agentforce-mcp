import fs from "fs";
import path from "path";
import { z } from "zod";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getCurrentTimestamp } from "./utils/loggingUtil.js";

const USER_AGENT = "weather-app/1.0";
const NWS_API_BASE = "https://api.weather.gov";

// Get current directory for relative path resolution
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

// Create server instance
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

// Register weather prompt
console.error(`${getCurrentTimestamp()} - 📝 server index - Registering prompts...`);

server.prompt("weather-assistant", "Weather assistant that provides forecasts, alerts, and climate data", async () => {
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
});

console.error(`${getCurrentTimestamp()} - ✅ server index - Tool registration completed!`);

console.error(`${getCurrentTimestamp()} - ✅ server index - Prompt registration completed!`);

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
