import { Request, Response } from "express";
import { getCurrentTimestamp } from "../utils/loggingUtil.js";
import { WeatherMCPClient } from "../utils/WeatherMCPClient.js";

export const canadaCurrentWeather = async (req: Request, res: Response) => {
  const mcpClient = new WeatherMCPClient();

  try {
    const { location, province } = req.query;

    if (!location || typeof location !== "string") {
      return res.status(400).json({
        error: "Location parameter is required (e.g., Toronto, Vancouver)",
        success: false,
      });
    }

    console.log(
      `${getCurrentTimestamp()} - 🌦️ CanadianWeatherController - Processing current weather request for: ${location}, ${
        province || "Canada"
      }`
    );

    try {
      console.log(`${getCurrentTimestamp()} - 🔄 MCP Client - Establishing connection to Weather MCP Server`);

      await mcpClient.connect();

      console.log(`${getCurrentTimestamp()} - 🎯 MCP Client - Calling get-canada-current-weather tool via MCP Server`);

      const weatherResult = await mcpClient.getCanadaCurrentWeather(location, province as string);
      const weatherText = weatherResult.content?.[0]?.text || "No weather data available";

      console.log(
        `${getCurrentTimestamp()} - ✅ MCP Server Response - Successfully processed current weather for: ${location}, ${
          province || "Canada"
        }`
      );

      return res.json({
        success: true,
        data: {
          location: `${location}${province ? `, ${province}` : ""}, Canada`,
          weather: weatherText,
          timestamp: new Date().toISOString(),
          mcpInfo: {
            serverName: "weather-mcp-server",
            toolUsed: "get-canada-current-weather",
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
    console.error(`${getCurrentTimestamp()} - ❌ CanadianWeatherController - Error in canadaCurrentWeather:`, error);

    return res.status(500).json({
      error: "Failed to retrieve Canadian current weather via MCP",
      details: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
  }
};

export const canadaWeatherForecast = async (req: Request, res: Response) => {
  const mcpClient = new WeatherMCPClient();

  try {
    const { location, province, days } = req.query;

    if (!location || typeof location !== "string") {
      return res.status(400).json({
        error: "Location parameter is required (e.g., Toronto, Vancouver)",
        success: false,
      });
    }

    const forecastDays = days ? parseInt(days as string) : 3;

    if (isNaN(forecastDays) || forecastDays < 1 || forecastDays > 3) {
      return res.status(400).json({
        error: "Days parameter must be a number between 1 and 3",
        success: false,
      });
    }

    console.log(
      `${getCurrentTimestamp()} - 🌦️ CanadianWeatherController - Processing forecast request for: ${location}, ${
        province || "Canada"
      } (${forecastDays} days)`
    );

    try {
      console.log(`${getCurrentTimestamp()} - 🔄 MCP Client - Establishing connection to Weather MCP Server`);

      await mcpClient.connect();

      console.log(`${getCurrentTimestamp()} - 🎯 MCP Client - Calling get-canada-weather-forecast tool via MCP Server`);

      const forecastResult = await mcpClient.getCanadaWeatherForecast(location, province as string, forecastDays);
      const weatherText = forecastResult.content?.[0]?.text || "No forecast data available";

      console.log(
        `${getCurrentTimestamp()} - ✅ MCP Server Response - Successfully processed forecast for: ${location}, ${
          province || "Canada"
        }`
      );

      return res.json({
        success: true,
        data: {
          location: `${location}${province ? `, ${province}` : ""}, Canada`,
          forecast: weatherText,
          days: forecastDays,
          timestamp: new Date().toISOString(),
          mcpInfo: {
            serverName: "weather-mcp-server",
            toolUsed: "get-canada-weather-forecast",
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
    console.error(`${getCurrentTimestamp()} - ❌ CanadianWeatherController - Error in canadaWeatherForecast:`, error);

    return res.status(500).json({
      error: "Failed to retrieve Canadian weather forecast via MCP",
      details: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
  }
};
