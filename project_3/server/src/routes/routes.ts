import { Router } from "express";
import middleware from "../middleware/middleware.js";
import MCPClient from "../controllers/MCPClient.js";

const MCPServerRoutes = Router();

MCPServerRoutes.get("/mcp", middleware, MCPClient);

export default MCPServerRoutes;
