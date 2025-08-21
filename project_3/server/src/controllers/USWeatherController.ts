import { Request, Response } from "express";
import { getCurrentTimestamp } from "../utils/loggingUtil.js";
import { HTTPMCPClient } from "../utils/HTTPMCPClient.js";
import { createWeatherMCPServer } from "../utils/WeatherMCPServer.js";
import { getUSWeatherAlerts, getUSWeatherForecast } from "../utils/weatherHelpers.js";

export const usaWeatherAlerts = async (req: Request, res: Response) => {
  try {
    const { state } = req.query;

    if (!state || typeof state !== "string" || state.length !== 2) {
      return res.status(400).json({
        error: "State parameter is required and must be a 2-letter state code (e.g., CA, NY, TX)",
        success: false,
      });
    }

    console.log(`${getCurrentTimestamp()} - 🚨 USWeatherController - Processing US alerts request for state: ${state}`);

    // Simulate MCP Client-Server Pattern:
    // 1. Controller acts as MCP Client
    // 2. Weather helper functions act as MCP Server tools
    // 3. Create MCP server instance for logging and structure
    const mcpServer = createWeatherMCPServer();

    // 4. Create MCP client instance for structure
    const client = new HTTPMCPClient();

    try {
      // Simulate MCP tool call by directly calling the weather function
      // In a real MCP setup, this would go through the transport layer
      console.log(`${getCurrentTimestamp()} - 🔄 MCP Client - Calling get-us-weather-alerts tool through MCP Server`);

      const alertsData = await getUSWeatherAlerts(state.toUpperCase());

      if (!alertsData) {
        console.log(`${getCurrentTimestamp()} - ⚠️ MCP Server - No alert data found for state: ${state}`);
        return res.json({
          success: true,
          data: {
            state: state.toUpperCase(),
            alerts: `No active weather alerts for ${state.toUpperCase()}`,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const alerts = alertsData.features || [];

      let alertsText: string;
      if (alerts.length === 0) {
        alertsText = `No active weather alerts for ${state.toUpperCase()}`;
      } else {
        const alertMessages = alerts
          .map((alert: any) => {
            const props = alert.properties;
            return `⚠️ ${props.event || "Weather Alert"}\nArea: ${props.areaDesc || "Unknown"}\nSeverity: ${
              props.severity || "Unknown"
            }\nStatus: ${props.status || "Unknown"}\n${props.headline || "No details available"}`;
          })
          .slice(0, 5);

        alertsText = `Weather Alerts for ${state.toUpperCase()}:\n\n${alertMessages.join("\n\n")}`;
      }

      console.log(`${getCurrentTimestamp()} - ✅ MCP Server - Successfully processed alerts for state: ${state}`);

      return res.json({
        success: true,
        data: {
          state: state.toUpperCase(),
          alerts: alertsText,
          timestamp: new Date().toISOString(),
          mcpInfo: {
            serverName: "weather-api-server",
            toolUsed: "get-us-weather-alerts",
          },
        },
      });
    } catch (mcpError) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Server - Tool execution error:`, mcpError);
      throw mcpError;
    }
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ USWeatherController - Error in getUSWeatherAlerts:`, error);

    return res.status(500).json({
      error: "Failed to retrieve US weather alerts",
      details: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
  }
};

export const usaWeatherForecast = async (req: Request, res: Response) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        error: "Both latitude (lat) and longitude (lon) parameters are required",
        success: false,
      });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lon as string);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        error: "Latitude and longitude must be valid numbers",
        success: false,
      });
    }

    console.log(
      `${getCurrentTimestamp()} - 🌤️ USWeatherController - Processing US forecast request for: ${latitude}, ${longitude}`
    );

    // Simulate MCP Client-Server Pattern:
    // 1. Controller acts as MCP Client
    // 2. Weather helper functions act as MCP Server tools
    const mcpServer = createWeatherMCPServer();
    const client = new HTTPMCPClient();

    try {
      console.log(`${getCurrentTimestamp()} - 🔄 MCP Client - Calling get-us-weather-forecast tool through MCP Server`);

      const forecastData = await getUSWeatherForecast(latitude, longitude);

      if (!forecastData) {
        console.log(
          `${getCurrentTimestamp()} - ⚠️ MCP Server - No forecast data found for coordinates: ${latitude}, ${longitude}`
        );
        return res.json({
          success: true,
          data: {
            coordinates: { latitude, longitude },
            forecast: `Failed to retrieve forecast data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const periods = forecastData.properties?.periods || [];

      let forecastText: string;
      if (periods.length === 0) {
        forecastText = `No forecast data available for coordinates: ${latitude}, ${longitude}`;
      } else {
        forecastText = periods
          .slice(0, 5)
          .map((period: any) => {
            return `📅 ${period.name || "Unknown"}\n🌡️ Temperature: ${period.temperature || "Unknown"}°${
              period.temperatureUnit || "F"
            }\n🌬️ Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}\n☁️ ${
              period.shortForecast || "No forecast available"
            }`;
          })
          .join("\n\n");

        forecastText = `Weather Forecast for ${latitude}, ${longitude}:\n\n${forecastText}`;
      }

      console.log(
        `${getCurrentTimestamp()} - ✅ MCP Server - Successfully processed forecast for: ${latitude}, ${longitude}`
      );

      return res.json({
        success: true,
        data: {
          coordinates: { latitude, longitude },
          forecast: forecastText,
          timestamp: new Date().toISOString(),
          mcpInfo: {
            serverName: "weather-api-server",
            toolUsed: "get-us-weather-forecast",
          },
        },
      });
    } catch (mcpError) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Server - Tool execution error:`, mcpError);
      throw mcpError;
    }
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ USWeatherController - Error in getUSWeatherForecast:`, error);

    return res.status(500).json({
      error: "Failed to retrieve US weather forecast",
      details: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
  }
};
