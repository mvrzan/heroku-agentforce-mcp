import { Request, Response } from "express";
import { getCurrentTimestamp } from "../utils/loggingUtil.js";
import { WeatherMCPClient } from "../utils/WeatherMCPClient.js";

export const usaWeatherAlerts = async (req: Request, res: Response) => {
  const mcpClient = new WeatherMCPClient();

  try {
    const { state } = req.query;

    if (!state || typeof state !== "string" || state.length !== 2) {
      return res.status(400).json({
        error: "State parameter is required and must be a 2-letter state code (e.g., CA, NY, TX)",
        success: false,
      });
    }

    console.log(`${getCurrentTimestamp()} - 🚨 USWeatherController - Processing US alerts request for state: ${state}`);

    try {
      console.log(`${getCurrentTimestamp()} - 🔄 MCP Client - Establishing connection to Weather MCP Server`);

      await mcpClient.connect();

      console.log(`${getCurrentTimestamp()} - 🎯 MCP Client - Calling get-us-weather-alerts tool via MCP Server`);

      const alertsResult = await mcpClient.getUSWeatherAlerts(state);
      const weatherText = alertsResult.content?.[0]?.text || "No alert data available";

      console.log(
        `${getCurrentTimestamp()} - ✅ MCP Server Response - Successfully processed alerts for state: ${state}`
      );

      return res.json({
        success: true,
        data: {
          state: state.toUpperCase(),
          alerts: weatherText,
          timestamp: new Date().toISOString(),
          mcpInfo: {
            serverName: "weather-mcp-server",
            toolUsed: "get-us-weather-alerts",
            clientConnected: mcpClient.isConnected(),
          },
        },
      });
    } catch (mcpError) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Client - Error during MCP operation:`, mcpError);
      throw mcpError;
    } finally {
      await mcpClient.disconnect();
    }
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ USWeatherController - Error in usaWeatherAlerts:`, error);

    return res.status(500).json({
      error: "Failed to retrieve US weather alerts via MCP",
      details: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
  }
};

export const usaWeatherForecast = async (req: Request, res: Response) => {
  const mcpClient = new WeatherMCPClient();

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

    try {
      console.log(`${getCurrentTimestamp()} - 🔄 MCP Client - Establishing connection to Weather MCP Server`);

      await mcpClient.connect();

      console.log(`${getCurrentTimestamp()} - 🎯 MCP Client - Calling get-us-weather-forecast tool via MCP Server`);

      const forecastResult = await mcpClient.getUSWeatherForecast(latitude, longitude);
      const weatherText = forecastResult.content?.[0]?.text || "No forecast data available";

      console.log(
        `${getCurrentTimestamp()} - ✅ MCP Server Response - Successfully processed forecast for: ${latitude}, ${longitude}`
      );

      return res.json({
        success: true,
        data: {
          coordinates: { latitude, longitude },
          forecast: weatherText,
          timestamp: new Date().toISOString(),
          mcpInfo: {
            serverName: "weather-mcp-server",
            toolUsed: "get-us-weather-forecast",
            clientConnected: mcpClient.isConnected(),
          },
        },
      });
    } catch (mcpError) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Client - Error during MCP operation:`, mcpError);
      throw mcpError;
    } finally {
      await mcpClient.disconnect();
    }
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ USWeatherController - Error in usaWeatherForecast:`, error);

    return res.status(500).json({
      error: "Failed to retrieve US weather forecast via MCP",
      details: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
  }
};
