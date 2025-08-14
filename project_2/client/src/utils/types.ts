import { SSEMCPClient } from "./SSEMCPClient.js";
import { HTTPMCPClient } from "./HTTPMCPClient.js";

export interface ClientInstance {
  type: "SSE" | "HTTP";
  client: SSEMCPClient | HTTPMCPClient;
  identifier: string;
}

export interface UnifiedTool {
  name: string;
  description: string;
  input_schema: any;
  source: string;
  client: SSEMCPClient | HTTPMCPClient;
}

export interface UnifiedResource {
  name: string;
  description: string;
  uri: string;
  source: string;
  client: SSEMCPClient | HTTPMCPClient;
}
