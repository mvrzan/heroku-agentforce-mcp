import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";
import { getCurrentTimestamp } from "./loggingUtil.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WeatherMCPClient {
  private client: Client;
  private transport: StdioClientTransport;
  private connected: boolean = false;

  constructor() {
    this.client = new Client(
      {
        name: "weather-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    const serverPath = path.join(__dirname, "..", "..", "build", "utils", "standaloneMCPServer.js");
    console.log(`${getCurrentTimestamp()} - 🔗 MCP Client - Spawning MCP server at: ${serverPath}`);

    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      console.log(`${getCurrentTimestamp()} - 🔗 MCP Client - Already connected to server`);

      return;
    }

    try {
      console.log(`${getCurrentTimestamp()} - 🔗 MCP Client - Connecting to MCP server...`);

      await this.client.connect(this.transport);
      this.connected = true;

      console.log(`${getCurrentTimestamp()} - ✅ MCP Client - Successfully connected to MCP server`);
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Client - Failed to connect to MCP server:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
      this.connected = false;
      console.log(`${getCurrentTimestamp()} - 🔗 MCP Client - Disconnected from MCP server`);
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Client - Error disconnecting:`, error);
    }
  }

  async listTools(): Promise<any> {
    if (!this.connected) {
      throw new Error("MCP client not connected. Call connect() first.");
    }

    try {
      console.log(`${getCurrentTimestamp()} - 🔧 MCP Client - Requesting tools list from server`);

      const response = await this.client.listTools();

      console.log(
        `${getCurrentTimestamp()} - ✅ MCP Client - Received tools list:`,
        response.tools?.length || 0,
        "tools"
      );
      return response;
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Client - Error listing tools:`, error);
      throw error;
    }
  }

  async callTool(toolName: string, args: any): Promise<any> {
    if (!this.connected) {
      throw new Error("MCP client not connected. Call connect() first.");
    }

    try {
      console.log(`${getCurrentTimestamp()} - 🎯 MCP Client - Calling tool: ${toolName} with args:`, args);

      const response = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      console.log(`${getCurrentTimestamp()} - ✅ MCP Client - Tool ${toolName} executed successfully`);
      return response;
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ MCP Client - Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  async getUSWeatherAlerts(state: string): Promise<any> {
    return await this.callTool("get-us-weather-alerts", { state: state.toUpperCase() });
  }

  async getUSWeatherForecast(latitude: number, longitude: number): Promise<any> {
    return await this.callTool("get-us-weather-forecast", { latitude, longitude });
  }

  async getCanadaCurrentWeather(location: string, province?: string): Promise<any> {
    return await this.callTool("get-canada-current-weather", { location, province });
  }

  async getCanadaWeatherForecast(location: string, province?: string, days: number = 3): Promise<any> {
    return await this.callTool("get-canada-weather-forecast", { location, province, days });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
