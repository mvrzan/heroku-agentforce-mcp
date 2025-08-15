import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "fs";
import { AlertFeature, AlertsResponse, PointsResponse, ForecastPeriod, ForecastResponse } from "./types.js";
import { getCurrentTimestamp } from "./loggingUtil.js";
import path from "path";
import { fileURLToPath } from "url";
import { file } from "zod/v4";

const USER_AGENT = process.env.WEATHER_USER_AGENT!;
const NWS_API_BASE = process.env.USA_WEATHER_API!;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!USER_AGENT) {
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPServer - USER_AGENT is not set!`);
}

if (!NWS_API_BASE) {
  throw new Error(`${getCurrentTimestamp()} - ❌ MCPServer - NWS_API_BASE is not set!`);
}

// Weather API types

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

// Create the weather MCP server (each transport needs its own instance)
function createWeatherServer(transportType: string) {
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

**Canadian Weather (via MSC GeoMet):**
1. Current weather observations from Canadian stations
2. Climate normals and historical data (1981-2010)
3. Weather station locations and information
4. Real-time surface weather observations (SWOB)

**General Climate Data:**
- Historical climate information from the server data file
- Climate trends and patterns
- Long-term climate projections

When responding to users:
- For Canadian locations, use the Canadian weather tools (get-canada-current-weather, get-canada-climate-summary, get-canada-weather-stations)
- For historical climate data, reference the weather-data resource
- Use a friendly, conversational tone
- Always specify temperature units (°C for Canada)
- Format alerts and warnings prominently
- If location is ambiguous, ask for clarification about region

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
          // First, try to get real-time weather station data
          let searchParams = new URLSearchParams({
            f: "json",
            limit: "20",
          });

          // If it looks like coordinates, search by location
          if (location.includes(",")) {
            const [lat, lon] = location.split(",").map((s) => parseFloat(s.trim()));
            if (!isNaN(lat) && !isNaN(lon)) {
              // Search within a small bounding box around the coordinates
              const buffer = 0.1; // ~10km radius
              searchParams.append("bbox", `${lon - buffer},${lat - buffer},${lon + buffer},${lat + buffer}`);
            }
          } else {
            // Search by location name
            if (province) {
              searchParams.append("STN_PROV", province.toUpperCase());
            }
          }

          // Try SWOB real-time data first
          const swobUrl = `https://api.weather.gc.ca/collections/swob-realtime/items?${searchParams}`;
          console.error(
            `${getCurrentTimestamp()} - 🌡️ ${transportType} server - Fetching Canadian weather from: ${swobUrl}`
          );

          const swobResponse = await fetch(swobUrl, {
            headers: { Accept: "application/json" },
          });

          let weatherData = null;
          if (swobResponse.ok) {
            const swobData = await swobResponse.json();
            if (swobData.features && swobData.features.length > 0) {
              weatherData = swobData.features[0];
            }
          }

          // If no real-time data, try climate daily data
          if (!weatherData) {
            const climateUrl = `https://api.weather.gc.ca/collections/climate-daily/items?${searchParams}`;
            console.error(
              `${getCurrentTimestamp()} - 🌡️ ${transportType} server - Trying climate data from: ${climateUrl}`
            );

            const climateResponse = await fetch(climateUrl, {
              headers: { Accept: "application/json" },
            });

            if (climateResponse.ok) {
              const climateData = await climateResponse.json();
              if (climateData.features && climateData.features.length > 0) {
                weatherData = climateData.features[0];
              }
            }
          }

          if (!weatherData) {
            return {
              content: [
                {
                  type: "text",
                  text: `No current weather data found for "${location}"${
                    province ? ` in ${province}` : ""
                  }. This may be because:
1. The location is not recognized
2. No active weather stations are nearby
3. The location is outside Canada

Try providing a major Canadian city name or coordinates in the format "latitude,longitude".`,
                },
              ],
            };
          }

          const props = weatherData.properties;
          const geometry = weatherData.geometry;

          // Extract relevant weather information
          const stationName = props.STN_NAM || props.STATION_NAME || "Unknown Station";
          const province_abbr = props.STN_PROV || props.PROV || "";
          const coords = geometry?.coordinates
            ? `${geometry.coordinates[1]}, ${geometry.coordinates[0]}`
            : "Not available";

          // Temperature data
          const temp = props.TEMP_AIR || props.MAX_TEMP || props.MIN_TEMP;
          const tempUnit = props.TEMP_AIR ? "°C" : "";

          // Precipitation
          const precip = props.PCPN_AMT || props.TOTAL_PRECIP;

          // Wind data
          const windSpeed = props.WIND_SPD || props.WSPD_AVG;
          const windDir = props.WIND_DIR || props.WDIR_AVG;

          // Humidity
          const humidity = props.REL_HUM;

          // Observation time
          const obsTime = props.DATE_TM || props.LOCAL_DATE;

          let weatherText = `Current Weather for ${stationName}`;
          if (province_abbr) weatherText += `, ${province_abbr}`;
          weatherText += `\n\nLocation: ${coords}\n`;

          if (obsTime) {
            weatherText += `Observation Time: ${obsTime}\n`;
          }

          if (temp !== undefined && temp !== null) {
            weatherText += `Temperature: ${temp}${tempUnit}\n`;
          }

          if (humidity !== undefined && humidity !== null) {
            weatherText += `Humidity: ${humidity}%\n`;
          }

          if (windSpeed !== undefined && windSpeed !== null) {
            weatherText += `Wind Speed: ${windSpeed} km/h`;
            if (windDir !== undefined && windDir !== null) {
              weatherText += ` from ${windDir}°`;
            }
            weatherText += `\n`;
          }

          if (precip !== undefined && precip !== null) {
            weatherText += `Precipitation: ${precip} mm\n`;
          }

          // Add any additional available data
          const additionalData: string[] = [];
          Object.keys(props).forEach((key) => {
            if (
              ![
                "STN_NAM",
                "STATION_NAME",
                "STN_PROV",
                "PROV",
                "DATE_TM",
                "LOCAL_DATE",
                "TEMP_AIR",
                "MAX_TEMP",
                "MIN_TEMP",
                "PCPN_AMT",
                "TOTAL_PRECIP",
                "WIND_SPD",
                "WSPD_AVG",
                "WIND_DIR",
                "WDIR_AVG",
                "REL_HUM",
              ].includes(key) &&
              props[key] !== null &&
              props[key] !== undefined
            ) {
              additionalData.push(`${key}: ${props[key]}`);
            }
          });

          if (additionalData.length > 0) {
            weatherText += `\nAdditional Information:\n${additionalData.join("\n")}`;
          }

          weatherText += `\n\nData provided by Environment and Climate Change Canada`;

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
      "get-canada-climate-summary",
      "Get climate summary and normals for a Canadian location",
      {
        location: z.string().describe("Canadian city name"),
        province: z.string().optional().describe("Province abbreviation (BC, ON, etc.)"),
      },
      async ({ location, province }) => {
        try {
          let searchParams = new URLSearchParams({
            f: "json",
            limit: "10",
          });

          if (province) {
            searchParams.append("PROVINCE", province.toUpperCase());
          }

          // Try to get climate normals data
          const normalsUrl = `https://api.weather.gc.ca/collections/climate-normals/items?${searchParams}`;
          console.error(
            `${getCurrentTimestamp()} - 📊 ${transportType} server - Fetching Canadian climate normals from: ${normalsUrl}`
          );

          const response = await fetch(normalsUrl, {
            headers: { Accept: "application/json" },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          if (!data.features || data.features.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No climate normals data found for "${location}"${
                    province ? ` in ${province}` : ""
                  }. Try a major Canadian city name.`,
                },
              ],
            };
          }

          // Find the best match for the location
          let bestMatch = data.features[0];
          if (data.features.length > 1) {
            // Try to find exact city match
            const locationLower = location.toLowerCase();
            for (const feature of data.features) {
              const stationName = (feature.properties.STATION_NAME || "").toLowerCase();
              if (stationName.includes(locationLower)) {
                bestMatch = feature;
                break;
              }
            }
          }

          const props = bestMatch.properties;
          const geometry = bestMatch.geometry;

          const stationName = props.STATION_NAME || "Unknown Station";
          const province_name = props.PROVINCE || province || "";
          const coords = geometry?.coordinates
            ? `${geometry.coordinates[1]}, ${geometry.coordinates[0]}`
            : "Not available";

          let climateText = `Climate Normals (1981-2010) for ${stationName}`;
          if (province_name) climateText += `, ${province_name}`;
          climateText += `\n\nLocation: ${coords}\n`;

          // Temperature data
          if (props.JAN_MEAN !== undefined) {
            climateText += `\nMonthly Temperature Averages (°C):\n`;
            const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            for (let i = 0; i < months.length; i++) {
              const temp = props[`${months[i]}_MEAN`];
              if (temp !== undefined && temp !== null) {
                climateText += `${monthNames[i]}: ${temp}°C  `;
                if ((i + 1) % 4 === 0) climateText += `\n`;
              }
            }
          }

          // Precipitation data
          if (props.JAN_PRECIP !== undefined) {
            climateText += `\n\nMonthly Precipitation Averages (mm):\n`;
            const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            for (let i = 0; i < months.length; i++) {
              const precip = props[`${months[i]}_PRECIP`];
              if (precip !== undefined && precip !== null) {
                climateText += `${monthNames[i]}: ${precip}mm  `;
                if ((i + 1) % 4 === 0) climateText += `\n`;
              }
            }
          }

          // Annual summaries
          if (props.ANN_MEAN_TEMP !== undefined) {
            climateText += `\n\nAnnual Summary:\n`;
            climateText += `Mean Temperature: ${props.ANN_MEAN_TEMP}°C\n`;
          }
          if (props.ANN_TOTAL_PRECIP !== undefined) {
            climateText += `Total Precipitation: ${props.ANN_TOTAL_PRECIP}mm\n`;
          }

          climateText += `\n\nData period: 1981-2010 Climate Normals`;
          climateText += `\nData provided by Environment and Climate Change Canada`;

          return {
            content: [
              {
                type: "text",
                text: climateText,
              },
            ],
          };
        } catch (error) {
          console.error(
            `${getCurrentTimestamp()} - ❌ ${transportType} server - Error fetching Canadian climate data:`,
            error
          );
          return {
            content: [
              {
                type: "text",
                text: `Failed to retrieve Canadian climate normals for "${location}". Please try again with a specific Canadian city name.`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "get-canada-weather-stations",
      "Find weather stations near a Canadian location",
      {
        latitude: z.number().describe("Latitude coordinate in Canada"),
        longitude: z.number().describe("Longitude coordinate in Canada"),
        radius_km: z.number().optional().default(50).describe("Search radius in kilometers (default: 50km)"),
      },
      async ({ latitude, longitude, radius_km }) => {
        try {
          // Create bounding box for search
          const latBuffer = radius_km / 111; // Roughly 1 degree = 111 km
          const lonBuffer = radius_km / (111 * Math.cos((latitude * Math.PI) / 180));

          const searchParams = new URLSearchParams({
            f: "json",
            limit: "20",
            bbox: `${longitude - lonBuffer},${latitude - latBuffer},${longitude + lonBuffer},${latitude + latBuffer}`,
          });

          // Search for weather stations
          const stationsUrl = `https://api.weather.gc.ca/collections/swob-stations/items?${searchParams}`;
          console.error(
            `${getCurrentTimestamp()} - 🌡️ ${transportType} server - Searching Canadian weather stations: ${stationsUrl}`
          );

          const response = await fetch(stationsUrl, {
            headers: { Accept: "application/json" },
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          if (!data.features || data.features.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No weather stations found within ${radius_km}km of coordinates ${latitude}, ${longitude}. The location may be outside Canada or in a remote area with no active weather stations.`,
                },
              ],
            };
          }

          let stationsText = `Weather Stations within ${radius_km}km of ${latitude}, ${longitude}\n\n`;
          stationsText += `Found ${data.features.length} stations:\n\n`;

          for (let i = 0; i < data.features.length; i++) {
            const station = data.features[i];
            const props = station.properties;
            const coords = station.geometry?.coordinates;

            const name = props.STN_NAM || props.STATION_NAME || `Station ${i + 1}`;
            const province = props.STN_PROV || props.PROVINCE || "";
            const id = props.STN_ID || props.STATION_ID || "";

            stationsText += `${i + 1}. ${name}`;
            if (province) stationsText += ` (${province})`;
            stationsText += `\n`;

            if (coords && coords.length >= 2) {
              stationsText += `   Location: ${coords[1]}, ${coords[0]}\n`;

              // Calculate distance
              const distance = Math.sqrt(
                Math.pow((coords[1] - latitude) * 111, 2) +
                  Math.pow((coords[0] - longitude) * 111 * Math.cos((latitude * Math.PI) / 180), 2)
              );
              stationsText += `   Distance: ${distance.toFixed(1)} km\n`;
            }

            if (id) stationsText += `   Station ID: ${id}\n`;
            stationsText += `\n`;
          }

          stationsText += `Data provided by Environment and Climate Change Canada`;

          return {
            content: [
              {
                type: "text",
                text: stationsText,
              },
            ],
          };
        } catch (error) {
          console.error(
            `${getCurrentTimestamp()} - ❌ ${transportType} server - Error fetching Canadian weather stations:`,
            error
          );
          return {
            content: [
              {
                type: "text",
                text: `Failed to find weather stations near ${latitude}, ${longitude}. Please verify the coordinates are within Canada.`,
              },
            ],
          };
        }
      }
    );
  }

  return server;
}

export default createWeatherServer;
