import { Router } from "express";
import middleware from "../middleware/middleware.js";
import RemoteMCPClientController from "../controllers/RemoteMCPClientController.js";
import LocalMCPServerController from "../controllers/LocalMCPServerController.js";

const MCPServerRoutes = Router();

MCPServerRoutes.post("/mcp/remote", middleware, RemoteMCPClientController);
MCPServerRoutes.post("/mcp/local", middleware, LocalMCPServerController);

export default MCPServerRoutes;
