import { Router } from "express";
import { SSEFunction, messages } from "../controllers/SSEFunction.js";
import { HTTPFunction } from "../controllers/HTTPFunction.js";
import middleware from "../middleware/middleware.js";

const MCPServerRoutes = Router();

MCPServerRoutes.get("/sse", middleware, SSEFunction);
MCPServerRoutes.post("/messages", middleware, messages);
MCPServerRoutes.post("/http", middleware, HTTPFunction);

export default MCPServerRoutes;
