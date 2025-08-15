import { Router } from "express";
import { SSEFunction, messages } from "../controllers/SSEFunction.js";
import { HTTPFunction } from "../controllers/HTTPFunction.js";

const MCPServerRoutes = Router();

MCPServerRoutes.get("/sse", SSEFunction);
MCPServerRoutes.post("/messages", messages);
MCPServerRoutes.post("/http", HTTPFunction);

export default MCPServerRoutes;
