import fs from "fs";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import { getCurrentTimestamp } from "./loggingUtil.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AlertsResponse, PointsResponse, ForecastPeriod, ForecastResponse, WeatherAPIResponse } from "./types.js";
import { makeNWSRequest, makeWeatherAPIRequest, formatAlert } from "./helpers.js";

const WEATHERAPI_KEY = process.env.WEATHERAPI_KEY!;
const WEATHERAPI_URL = process.env.WEATHERAPI_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!WEATHERAPI_KEY) {
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPServer - WEATHERAPI_KEY is not set!`);
}

if (!WEATHERAPI_URL) {
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPServer - WEATHERAPI_URL is not set!`);
}

function unifiedMCPServer(transportType: string) {
  const server = new McpServer({
    name: "weather",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  });

  // US Weather Tools - only available on SSE transport
  if (transportType === "SSE") {
    server.tool(
      "get-alerts",
      "Get weather alerts for a state",
      {
        state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
      },
      async ({ state }) => {
        const stateCode = state.toUpperCase();
        const alertsUrl = `alerts?area=${stateCode}`;
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
        const pointsUrl = `points/${latitude},${longitude}`;
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
  }

  // Register resources - only available on HTTP transport
  if (transportType === "HTTP") {
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
          const filePath = path.resolve(__dirname, "..", "data", "data.json");

          console.error(
            `${getCurrentTimestamp()} - 🔍 ${transportType} server - Looking for data file at: ${filePath}`
          );

          if (!fs.existsSync(filePath)) {
            console.error(`${getCurrentTimestamp()} - ❌ ${transportType} server - File not found: ${filePath}`);
            throw new Error(`Resource not found: ${uri.href}`);
          }

          const content = fs.readFileSync(filePath, "utf-8");
          console.error(
            `${getCurrentTimestamp()} - ✅ ${transportType} server - Successfully read JSON data (${
              content.length
            } bytes)`
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
          console.error(`${getCurrentTimestamp()} - ❌ ${transportType} server - Error reading resource: ${error}`);
          throw new Error(`Failed to read resource: ${uri.href}`);
        }
      }
    );
  }

  // Register prompts
  server.prompt(
    "weather-assistant",
    transportType === "HTTP"
      ? "Weather assistant that provides climate data and Canadian weather information"
      : "Weather assistant that provides US weather forecasts and alerts",
    async () => {
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text:
                transportType === "HTTP"
                  ? `You are a helpful weather assistant that can provide information about:

**Canadian Weather (via WeatherAPI.com):**
1. Current weather conditions for Canadian cities and locations
2. Weather forecasts (1-3 days) for Canadian locations
3. Location search to find Canadian cities and coordinates
4. Real-time weather data with comprehensive details

**General Climate Data:**
- Historical climate information from the server data file
- Climate trends and patterns
- Long-term climate projections

When responding to users:
- For Canadian locations, use the Canadian weather tools (get-canada-current-weather, get-canada-forecast, search-canada-locations)
- For historical climate data, reference the weather-data resource
- Use a friendly, conversational tone
- Always specify temperature units (°C for Canada)
- Format alerts and warnings prominently
- If location is ambiguous, ask for clarification or use search-canada-locations

Available Canadian weather tools:
- get-canada-current-weather: Current conditions for any Canadian city
- get-canada-forecast: 1-3 day forecasts for Canadian locations
- search-canada-locations: Find Canadian cities and their coordinates

Note: US weather data (NWS) is only available via SSE transport.

Remember to format your responses clearly with appropriate sections for readability.`
                  : `You are a helpful weather assistant that can provide information about:

**United States Weather (via NWS):**
1. Weather forecasts for specific coordinates
2. Weather alerts for US states
3. Current conditions and detailed forecasts

When responding to users:
- For US locations, use the NWS weather tools (get-alerts, get-forecast)
- Use a friendly, conversational tone
- Always include relevant temperature units (°F)
- Format alerts and warnings prominently
- If location is ambiguous, ask for clarification

Note: Canadian weather data and historical climate data resources are only available via HTTP transport.

Remember to format your responses clearly with appropriate sections for readability.`,
            },
          },
        ],
      };
    }
  );

  // Canadian Weather Tools - only available on HTTP transport
  if (transportType === "HTTP") {
    server.tool(
      "get-canada-current-weather",
      "Get current weather observations for a Canadian location",
      {
        location: z.string().describe("Canadian city name or coordinates (lat,lon)"),
        province: z.string().optional().describe("Province abbreviation (BC, ON, etc.) to help locate the city"),
      },
      async ({ location, province }) => {
        try {
          // Build the WeatherAPI query
          let query = location;
          if (province && !location.includes(",")) {
            // If it's not coordinates and province is specified, add it to the query
            query = `${location},${province},Canada`;
          } else if (!location.includes(",")) {
            // If it's not coordinates, ensure we specify Canada
            query = `${location},Canada`;
          }

          const weatherUrl = `${
            process.env.WEATHERAPI_URL
          }/v1/current.json?key=${WEATHERAPI_KEY}&q=${encodeURIComponent(query)}`;

          console.error(
            `${getCurrentTimestamp()} - 🌡️ ${transportType} server - Fetching Canadian weather from WeatherAPI: ${query}`
          );

          const weatherData = await makeWeatherAPIRequest<WeatherAPIResponse>(weatherUrl);

          if (!weatherData) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to retrieve weather data for "${location}"${
                    province ? ` in ${province}` : ""
                  }. Please check the location name and try again.`,
                },
              ],
            };
          }

          const { location: loc, current } = weatherData;

          let weatherText = `Current Weather for ${loc.name}, ${loc.region}, ${loc.country}\n\n`;
          weatherText += `Location: ${loc.lat}, ${loc.lon}\n`;
          weatherText += `Local Time: ${loc.localtime}\n`;
          weatherText += `Time Zone: ${loc.tz_id}\n\n`;

          weatherText += `Temperature: ${current.temp_c}°C (feels like ${current.feelslike_c}°C)\n`;
          weatherText += `Condition: ${current.condition.text}\n`;
          weatherText += `Humidity: ${current.humidity}%\n`;
          weatherText += `Wind: ${current.wind_kph} km/h ${current.wind_dir}\n`;
          weatherText += `Pressure: ${current.pressure_mb} mb\n`;
          weatherText += `Visibility: ${current.vis_km} km\n`;
          weatherText += `UV Index: ${current.uv}\n`;

          weatherText += `\nData provided by WeatherAPI.com`;

          return {
            content: [
              {
                type: "text",
                text: weatherText,
              },
            ],
          };
        } catch (error) {
          console.error(
            `${getCurrentTimestamp()} - ❌ ${transportType} server - Error fetching Canadian weather:`,
            error
          );
          return {
            content: [
              {
                type: "text",
                text: `Failed to retrieve Canadian weather data for "${location}". Please try again with a specific Canadian city name or coordinates.`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "get-canada-forecast",
      "Get weather forecast for a Canadian location",
      {
        location: z.string().describe("Canadian city name or coordinates (lat,lon)"),
        province: z.string().optional().describe("Province abbreviation (BC, ON, etc.) to help locate the city"),
        days: z.number().optional().default(3).describe("Number of forecast days (1-3)"),
      },
      async ({ location, province, days }) => {
        try {
          // Build the WeatherAPI query
          let query = location;
          if (province && !location.includes(",")) {
            query = `${location},${province},Canada`;
          } else if (!location.includes(",")) {
            query = `${location},Canada`;
          }

          const forecastDays = Math.min(Math.max(days, 1), 3); // Clamp between 1-3
          const forecastUrl = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${encodeURIComponent(
            query
          )}&days=${forecastDays}`;

          console.error(
            `${getCurrentTimestamp()} - 📊 ${transportType} server - Fetching Canadian forecast from WeatherAPI: ${query} (${forecastDays} days)`
          );

          const forecastData = await makeWeatherAPIRequest<WeatherAPIResponse>(forecastUrl);

          if (!forecastData || !forecastData.forecast) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to retrieve forecast data for "${location}"${
                    province ? ` in ${province}` : ""
                  }. Please check the location name and try again.`,
                },
              ],
            };
          }

          const { location: loc, forecast } = forecastData;

          let forecastText = `${forecastDays}-Day Weather Forecast for ${loc.name}, ${loc.region}, ${loc.country}\n\n`;
          forecastText += `Location: ${loc.lat}, ${loc.lon}\n`;
          forecastText += `Time Zone: ${loc.tz_id}\n\n`;

          forecast.forecastday.forEach((day, index) => {
            const dayData = day.day;
            forecastText += `Day ${index + 1} - ${day.date}\n`;
            forecastText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            forecastText += `High: ${dayData.maxtemp_c}°C | Low: ${dayData.mintemp_c}°C | Avg: ${dayData.avgtemp_c}°C\n`;
            forecastText += `Condition: ${dayData.condition.text}\n`;
            forecastText += `Max Wind: ${dayData.maxwind_kph} km/h\n`;
            forecastText += `Precipitation: ${dayData.totalprecip_mm} mm\n`;
            forecastText += `Avg Humidity: ${dayData.avghumidity}%\n`;
            forecastText += `UV Index: ${dayData.uv}\n\n`;
          });

          forecastText += `Data provided by WeatherAPI.com`;

          return {
            content: [
              {
                type: "text",
                text: forecastText,
              },
            ],
          };
        } catch (error) {
          console.error(
            `${getCurrentTimestamp()} - ❌ ${transportType} server - Error fetching Canadian forecast:`,
            error
          );
          return {
            content: [
              {
                type: "text",
                text: `Failed to retrieve Canadian forecast for "${location}". Please try again with a specific Canadian city name or coordinates.`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "search-canada-locations",
      "Search for Canadian locations to get weather data",
      {
        query: z.string().describe("Location name to search for in Canada"),
      },
      async ({ query }) => {
        try {
          // Use WeatherAPI's search endpoint to find matching locations
          const searchUrl = `https://api.weatherapi.com/v1/search.json?key=${WEATHERAPI_KEY}&q=${encodeURIComponent(
            query
          )}`;

          console.error(
            `${getCurrentTimestamp()} - 🔍 ${transportType} server - Searching Canadian locations: ${query}`
          );

          const searchData = await makeWeatherAPIRequest<
            Array<{
              id: number;
              name: string;
              region: string;
              country: string;
              lat: number;
              lon: number;
              url: string;
            }>
          >(searchUrl);

          if (!searchData || searchData.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No locations found matching "${query}". Please try a different search term or check the spelling.`,
                },
              ],
            };
          }

          // Filter for Canadian locations
          const canadianLocations = searchData.filter((loc) => loc.country.toLowerCase().includes("canada"));

          if (canadianLocations.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No Canadian locations found matching "${query}". Found ${searchData.length} location(s) but none in Canada.`,
                },
              ],
            };
          }

          let locationsText = `Found ${canadianLocations.length} Canadian location(s) matching "${query}":\n\n`;

          canadianLocations.forEach((loc, index) => {
            locationsText += `${index + 1}. ${loc.name}, ${loc.region}\n`;
            locationsText += `   Country: ${loc.country}\n`;
            locationsText += `   Coordinates: ${loc.lat}, ${loc.lon}\n`;
            locationsText += `   Location ID: ${loc.id}\n\n`;
          });

          locationsText += `You can use any of these location names with the get-canada-current-weather or get-canada-forecast tools.`;

          return {
            content: [
              {
                type: "text",
                text: locationsText,
              },
            ],
          };
        } catch (error) {
          console.error(
            `${getCurrentTimestamp()} - ❌ ${transportType} server - Error searching Canadian locations:`,
            error
          );
          return {
            content: [
              {
                type: "text",
                text: `Failed to search for locations matching "${query}". Please try again.`,
              },
            ],
          };
        }
      }
    );
  }

  return server;
}

export default unifiedMCPServer;
