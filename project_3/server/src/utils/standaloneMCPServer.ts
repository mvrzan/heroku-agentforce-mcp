import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getCurrentTimestamp } from "./loggingUtil.js";
import {
  getUSWeatherAlerts,
  getUSWeatherForecast,
  getCurrentWeatherCanada,
  getForecastCanada,
} from "./weatherHelpers.js";

const server = new McpServer({
  name: "weather-mcp-server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
    prompts: {},
  },
});

server.tool(
  "get-us-weather-alerts",
  "Get weather alerts for a US state",
  {
    state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY, TX)"),
  },
  async ({ state }) => {
    console.log(`${getCurrentTimestamp()} - 🚨 MCP Server - Getting US alerts for state: ${state}`);

    const alertsData = await getUSWeatherAlerts(state);

    if (!alertsData) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve weather alerts for state: ${state.toUpperCase()}`,
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
            text: `No active weather alerts for ${state.toUpperCase()}`,
          },
        ],
      };
    }

    const alertMessages = alerts
      .map((alert: any) => {
        const props = alert.properties;
        return `⚠️ ${props.event || "Weather Alert"}\nArea: ${props.areaDesc || "Unknown"}\nSeverity: ${
          props.severity || "Unknown"
        }\nStatus: ${props.status || "Unknown"}\n${props.headline || "No details available"}`;
      })
      .slice(0, 5);

    return {
      content: [
        {
          type: "text",
          text: `Weather Alerts for ${state.toUpperCase()}:\n\n${alertMessages.join("\n\n")}`,
        },
      ],
    };
  }
);

server.tool(
  "get-us-weather-forecast",
  "Get weather forecast for US coordinates",
  {
    latitude: z.number().describe("Latitude coordinate"),
    longitude: z.number().describe("Longitude coordinate"),
  },
  async ({ latitude, longitude }) => {
    console.log(`${getCurrentTimestamp()} - 🌤️ MCP Server - Getting US forecast for: ${latitude}, ${longitude}`);

    const forecastData = await getUSWeatherForecast(latitude, longitude);

    if (!forecastData) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve forecast data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
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
            text: `No forecast data available for coordinates: ${latitude}, ${longitude}`,
          },
        ],
      };
    }

    const forecastText = periods
      .slice(0, 5)
      .map((period: any) => {
        return `📅 ${period.name || "Unknown"}\n🌡️ Temperature: ${period.temperature || "Unknown"}°${
          period.temperatureUnit || "F"
        }\n🌬️ Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}\n☁️ ${
          period.shortForecast || "No forecast available"
        }`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Weather Forecast for ${latitude}, ${longitude}:\n\n${forecastText}`,
        },
      ],
    };
  }
);

server.tool(
  "get-canada-current-weather",
  "Get current weather for a Canadian location",
  {
    location: z.string().describe("City name (e.g., Toronto, Vancouver)"),
    province: z.string().optional().describe("Province code or name (e.g., ON, BC) - optional"),
  },
  async ({ location, province }) => {
    console.log(
      `${getCurrentTimestamp()} - 🌦️ MCP Server - Getting Canadian current weather for: ${location}, ${
        province || "Canada"
      }`
    );

    const weatherData = await getCurrentWeatherCanada(location, province);

    if (!weatherData) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve weather data for: ${location}${province ? `, ${province}` : ""}, Canada`,
          },
        ],
      };
    }

    const current = weatherData.current;
    const locationInfo = weatherData.location;

    const weatherText = `🌍 ${locationInfo.name}, ${locationInfo.region}, ${locationInfo.country}
📍 Coordinates: ${locationInfo.lat}, ${locationInfo.lon}
🕐 Local Time: ${locationInfo.localtime}

Current Weather:
🌡️ Temperature: ${current.temp_c}°C (feels like ${current.feelslike_c}°C)
☁️ Condition: ${current.condition.text}
🌬️ Wind: ${current.wind_kph} km/h ${current.wind_dir}
💧 Humidity: ${current.humidity}%
📊 Pressure: ${current.pressure_mb} mb
👁️ Visibility: ${current.vis_km} km
☀️ UV Index: ${current.uv}`;

    return {
      content: [
        {
          type: "text",
          text: weatherText,
        },
      ],
    };
  }
);

server.tool(
  "get-canada-weather-forecast",
  "Get weather forecast for a Canadian location",
  {
    location: z.string().describe("City name (e.g., Toronto, Vancouver)"),
    province: z.string().optional().describe("Province code or name (e.g., ON, BC) - optional"),
    days: z.number().min(1).max(3).default(3).describe("Number of forecast days (1-3)"),
  },
  async ({ location, province, days = 3 }) => {
    console.log(
      `${getCurrentTimestamp()} - 🌦️ MCP Server - Getting Canadian forecast for: ${location}, ${
        province || "Canada"
      } (${days} days)`
    );

    const forecastData = await getForecastCanada(location, province, days);

    if (!forecastData) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve forecast data for: ${location}${province ? `, ${province}` : ""}, Canada`,
          },
        ],
      };
    }

    const locationInfo = forecastData.location;
    const forecastDays = forecastData.forecast?.forecastday || [];

    if (forecastDays.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No forecast data available for: ${location}${province ? `, ${province}` : ""}, Canada`,
          },
        ],
      };
    }

    const forecastText = forecastDays
      .map((day: any) => {
        const dayData = day.day;
        return `📅 ${day.date}
🌡️ Temperature: ${dayData.mintemp_c}°C to ${dayData.maxtemp_c}°C (avg: ${dayData.avgtemp_c}°C)
☁️ Condition: ${dayData.condition.text}
🌬️ Max Wind: ${dayData.maxwind_kph} km/h
🌧️ Total Precipitation: ${dayData.totalprecip_mm} mm
💧 Avg Humidity: ${dayData.avghumidity}%
☀️ UV Index: ${dayData.uv}`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Weather Forecast for ${locationInfo.name}, ${locationInfo.region}, ${locationInfo.country}:\n\n${forecastText}`,
        },
      ],
    };
  }
);

console.error(`${getCurrentTimestamp()} - 🏭 MCP Server - Starting Weather MCP Server...`);
console.error(`${getCurrentTimestamp()} - 🏭 MCP Server - Server ready to accept connections`);

const transport = new StdioServerTransport();
server.connect(transport);
