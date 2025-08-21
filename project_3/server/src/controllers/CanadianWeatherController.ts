import { Request, Response } from "express";
import { getCurrentTimestamp } from "../utils/loggingUtil.js";
import { HTTPMCPClient } from "../utils/HTTPMCPClient.js";
import { createWeatherMCPServer } from "../utils/WeatherMCPServer.js";
import { getCurrentWeatherCanada, getForecastCanada } from "../utils/weatherHelpers.js";

export const canadaCurrentWeather = async (req: Request, res: Response) => {
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

    // Simulate MCP Client-Server Pattern:
    // 1. Controller acts as MCP Client
    // 2. Weather helper functions act as MCP Server tools
    const mcpServer = createWeatherMCPServer();
    const client = new HTTPMCPClient();

    try {
      console.log(
        `${getCurrentTimestamp()} - 🔄 MCP Client - Calling get-canada-current-weather tool through MCP Server`
      );

      const weatherData = await getCurrentWeatherCanada(location, province as string);

      if (!weatherData) {
        console.log(
          `${getCurrentTimestamp()} - ⚠️ MCP Server - No weather data found for: ${location}, ${province || "Canada"}`
        );
        return res.json({
          success: true,
          data: {
            location: `${location}${province ? `, ${province}` : ""}, Canada`,
            weather: `Failed to retrieve weather data for: ${location}${province ? `, ${province}` : ""}, Canada`,
            timestamp: new Date().toISOString(),
          },
        });
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

      console.log(
        `${getCurrentTimestamp()} - ✅ MCP Server - Successfully processed current weather for: ${location}, ${
          province || "Canada"
        }`
      );

      return res.json({
        success: true,
        data: {
          location: `${locationInfo.name}, ${locationInfo.region}, ${locationInfo.country}`,
          weather: weatherText,
          timestamp: new Date().toISOString(),
          mcpInfo: {
            serverName: "weather-api-server",
            toolUsed: "get-canada-current-weather",
          },
        },
      });
    } catch (mcpError) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Server - Tool execution error:`, mcpError);
      throw mcpError;
    }
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ CanadianWeatherController - Error in getCurrentWeather:`, error);

    return res.status(500).json({
      error: "Failed to retrieve Canadian current weather",
      details: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
  }
};

export const canadaWeatherForecast = async (req: Request, res: Response) => {
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

    // Simulate MCP Client-Server Pattern
    const mcpServer = createWeatherMCPServer();
    const client = new HTTPMCPClient();

    try {
      console.log(
        `${getCurrentTimestamp()} - 🔄 MCP Client - Calling get-canada-weather-forecast tool through MCP Server`
      );

      const forecastData = await getForecastCanada(location, province as string, forecastDays);

      if (!forecastData) {
        console.log(
          `${getCurrentTimestamp()} - ⚠️ MCP Server - No forecast data found for: ${location}, ${province || "Canada"}`
        );
        return res.json({
          success: true,
          data: {
            location: `${location}${province ? `, ${province}` : ""}, Canada`,
            forecast: `Failed to retrieve forecast data for: ${location}${province ? `, ${province}` : ""}, Canada`,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const locationInfo = forecastData.location;
      const forecastDaysData = forecastData.forecast?.forecastday || [];

      let forecastText: string;
      if (forecastDaysData.length === 0) {
        forecastText = `No forecast data available for: ${location}${province ? `, ${province}` : ""}, Canada`;
      } else {
        const dailyForecasts = forecastDaysData
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

        forecastText = `Weather Forecast for ${locationInfo.name}, ${locationInfo.region}, ${locationInfo.country}:\n\n${dailyForecasts}`;
      }

      console.log(
        `${getCurrentTimestamp()} - ✅ MCP Server - Successfully processed forecast for: ${location}, ${
          province || "Canada"
        }`
      );

      return res.json({
        success: true,
        data: {
          location: `${locationInfo.name}, ${locationInfo.region}, ${locationInfo.country}`,
          forecast: forecastText,
          days: forecastDays,
          timestamp: new Date().toISOString(),
          mcpInfo: {
            serverName: "weather-api-server",
            toolUsed: "get-canada-weather-forecast",
          },
        },
      });
    } catch (mcpError) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Server - Tool execution error:`, mcpError);
      throw mcpError;
    }
  } catch (error) {
    console.error(`${getCurrentTimestamp()} - ❌ CanadianWeatherController - Error in getWeatherForecast:`, error);

    return res.status(500).json({
      error: "Failed to retrieve Canadian weather forecast",
      details: error instanceof Error ? error.message : "Unknown error",
      success: false,
    });
  }
};
