import { Router } from "express";
import middleware from "../middleware/middleware.js";
import { usaWeatherAlerts, usaWeatherForecast } from "../controllers/USWeatherController.js";
import { canadaCurrentWeather, canadaWeatherForecast } from "../controllers/CanadianWeatherController.js";

const MCPServerRoutes = Router();

MCPServerRoutes.get("/api/us-weather/alerts", middleware, usaWeatherAlerts);
MCPServerRoutes.get("/api/us-weather/forecast", middleware, usaWeatherForecast);
MCPServerRoutes.get("/api/canada-weather/current", middleware, canadaCurrentWeather);
MCPServerRoutes.get("/api/canada-weather/forecast", middleware, canadaWeatherForecast);

export default MCPServerRoutes;
