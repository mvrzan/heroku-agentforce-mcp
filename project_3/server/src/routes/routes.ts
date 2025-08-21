import { Router } from "express";
import middleware from "../middleware/middleware.js";
import { USWeatherController } from "../controllers/USWeatherController.js";
import { CanadianWeatherController } from "../controllers/CanadianWeatherController.js";

const MCPServerRoutes = Router();

MCPServerRoutes.get("/api/us-weather/alerts", middleware, USWeatherController.getUSWeatherAlerts);
MCPServerRoutes.get("/api/us-weather/forecast", middleware, USWeatherController.getUSWeatherForecast);
MCPServerRoutes.get("/api/canada-weather/current", middleware, CanadianWeatherController.getCurrentWeather);
MCPServerRoutes.get("/api/canada-weather/forecast", middleware, CanadianWeatherController.getWeatherForecast);

export default MCPServerRoutes;
