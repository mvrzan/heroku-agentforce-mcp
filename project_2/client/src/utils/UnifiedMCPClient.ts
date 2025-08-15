import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { ClientInstance, UnifiedTool, UnifiedResource } from "./types.js";
import { getCurrentTimestamp } from "./loggingUtil.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_CLAUDE_MODEL = process.env.ANTHROPIC_CLAUDE_MODEL;

if (!ANTHROPIC_API_KEY) {
  throw new Error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - ANTHROPIC_API_KEY is not set!`);
}

if (!ANTHROPIC_CLAUDE_MODEL) {
  throw new Error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - ANTHROPIC_CLAUDE_MODEL is not set!`);
}

export class UnifiedMCPClient {
  private clients: ClientInstance[];
  private anthropic: Anthropic;
  private unifiedTools: UnifiedTool[] = [];
  private unifiedResources: UnifiedResource[] = [];

  constructor(clients: ClientInstance[]) {
    this.clients = clients;
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
  }

  async initialize() {
    console.log(`${getCurrentTimestamp()} - 🔄 UnifiedMCPClient - Initializing unified client...`);

    for (const clientInstance of this.clients) {
      try {
        const mcpClient = clientInstance.client.mcpClient;

        if (!mcpClient) break;

        const toolsResult = await mcpClient.listTools();
        const clientTools = toolsResult.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        }));

        clientTools.forEach((tool) => {
          this.unifiedTools.push({
            name: tool.name,
            description: tool.description || "No description",
            input_schema: tool.input_schema,
            source: clientInstance.identifier,
            client: clientInstance.client,
          });
        });

        try {
          const resourcesResult = await mcpClient.listResources();
          const clientResources = resourcesResult.resources || [];

          clientResources.forEach((resource) => {
            this.unifiedResources.push({
              name: resource.name || "Unknown Resource",
              description: resource.description || "No description",
              uri: resource.uri || "",
              source: clientInstance.identifier,
              client: clientInstance.client,
            });
          });

          console.log(`${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Integrated ${clientInstance.identifier}`);
        } catch (error: any) {
          if (error?.code === -32601) {
            console.log(`${getCurrentTimestamp()} - ℹ️ MCPClient - Server does not support resources`);
          } else {
            console.error(`${getCurrentTimestamp()} - ❌ MCPClient - Error listing resources:`, error);
          }
        }
      } catch (error) {
        console.error(
          `${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Failed to integrate ${clientInstance.identifier}:`,
          error
        );
      }
    }

    console.log(
      `${getCurrentTimestamp()} - 🔄 UnifiedMCPClient - Unified client ready with ${
        this.unifiedTools.length
      } tools and ${this.unifiedResources.length} resources`
    );
  }

  async getAllTools(): Promise<UnifiedTool[]> {
    return this.unifiedTools;
  }

  async getAllResources(): Promise<UnifiedResource[]> {
    return this.unifiedResources;
  }

  async processQuery(query: string): Promise<string> {
    const workingMessages: MessageParam[] = [];

    try {
      console.log(`${getCurrentTimestamp()} - 🔍 UnifiedMCPClient - Discovering available prompts...`);

      for (const clientInstance of this.clients) {
        const mcpClient = clientInstance.client.mcpClient;
        const promptsList = await mcpClient.listPrompts();

        if (!promptsList.prompts || !(promptsList.prompts.length > 0)) break;

        const prompt = promptsList.prompts[0];
        const promptResponse = await mcpClient.getPrompt({ name: prompt.name });

        if (!promptResponse || !promptResponse.messages) break;

        for (const promptMessage of promptResponse.messages) {
          workingMessages.push({
            role: promptMessage.role as "user" | "assistant",
            content: promptMessage.content.type === "text" ? promptMessage.content.text : "",
          });
        }
        console.log(`${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Prompt added from ${clientInstance.identifier}!`);
        break;
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ⚠️ UnifiedMCPClient - Failed to discover prompts:`, error);
    }

    workingMessages.push({
      role: "user",
      content: query,
    });

    try {
      console.log(`${getCurrentTimestamp()} - 🔍 UnifiedMCPClient - Checking for available resources...`);

      for (const clientInstance of this.clients) {
        const mcpClient = clientInstance.client.mcpClient;

        try {
          const resources = await mcpClient.listResources();

          if (!resources.resources || !(resources.resources.length > 0)) break;

          const dataResource = resources.resources.find((resource) => resource.uri.toLowerCase().includes("data.json"));

          if (!dataResource) break;

          const content = await mcpClient.readResource({ uri: dataResource.uri });

          if (!content.contents || !(content.contents.length > 0)) break;

          const contentText = typeof content.contents[0].text === "string" ? content.contents[0].text : "";
          const resourceData = JSON.parse(contentText);
          const resourceInfo = `Available data from MCP server (${dataResource.name}) on ${
            clientInstance.identifier
          }:\n${Object.keys(resourceData)
            .map((key) => `- ${key}`)
            .join("\n")}`;

          const messageContent = workingMessages[workingMessages.length - 1].content;
          workingMessages[
            workingMessages.length - 1
          ].content = `${messageContent}\n\n${resourceInfo}\n\nFull data:\n${JSON.stringify(resourceData, null, 2)}`;

          console.log(
            `${getCurrentTimestamp()} - ✅ UnifiedMCPClient - Resource data added from ${clientInstance.identifier}`
          );
          break;
        } catch (error: any) {
          if (error?.code === -32603 || error?.code === -32601) {
            console.log(`${getCurrentTimestamp()} - ℹ️ MCPClient - Server does not support resources`);
          } else {
            console.error(`${getCurrentTimestamp()} - ❌ MCPClient - Error listing resources:`, error);
          }
        }
      }
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Error fetching resources:`, error);
    }

    try {
      const tools: Tool[] = this.unifiedTools.map((tool) => ({
        name: tool.name,
        description: `${tool.description} (from ${tool.source})`,
        input_schema: tool.input_schema,
      }));

      console.log(
        `${getCurrentTimestamp()} - 💬 UnifiedMCPClient - Querying Claude with ${tools.length} available tools...`
      );

      let response = await this.anthropic.messages.create({
        model: ANTHROPIC_CLAUDE_MODEL!,
        max_tokens: 1500,
        messages: workingMessages,
        tools: tools,
      });

      const finalText: string[] = [];
      const toolCalls = [];

      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          toolCalls.push(content);
        }
      }

      if (toolCalls.length > 0) {
        workingMessages.push({
          role: "assistant",
          content: response.content,
        });

        const toolResults = [];

        for (const toolCall of toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.input as { [x: string]: unknown } | undefined;
          const unifiedTool = this.unifiedTools.find((t) => t.name === toolName);

          if (!unifiedTool) {
            console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Tool ${toolName} not found`);
            toolResults.push({
              type: "tool_result" as const,
              tool_use_id: toolCall.id,
              content: `Error: Tool ${toolName} not found`,
            });
            continue;
          }

          console.log(
            `${getCurrentTimestamp()} - 🔧 UnifiedMCPClient - Calling tool ${toolName} on ${unifiedTool.source}`
          );

          try {
            const mcpClient = unifiedTool.client.mcpClient;
            const result = await mcpClient.callTool({
              name: toolName,
              arguments: toolArgs,
            });

            let toolResultText = "";

            if (Array.isArray(result.content)) {
              toolResultText = result.content
                .map((item: any) => (item.type === "text" ? item.text : String(item)))
                .join("\n");
            } else {
              toolResultText = String(result.content);
            }

            toolResults.push({
              type: "tool_result" as const,
              tool_use_id: toolCall.id,
              content: toolResultText,
            });
          } catch (toolError) {
            console.error(
              `${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Error calling tool ${toolName}:`,
              toolError
            );

            toolResults.push({
              type: "tool_result" as const,
              tool_use_id: toolCall.id,
              content: `Error calling tool ${toolName}: ${toolError}`,
            });
          }
        }

        workingMessages.push({
          role: "user",
          content: toolResults,
        });

        console.log(`${getCurrentTimestamp()} - 📝 UnifiedMCPClient - Getting final response from Claude...`);

        response = await this.anthropic.messages.create({
          model: ANTHROPIC_CLAUDE_MODEL!,
          max_tokens: 1000,
          messages: workingMessages,
        });

        for (const finalContent of response.content) {
          if (finalContent.type === "text") {
            finalText.push(finalContent.text);
          }
        }
      }

      return finalText.join("\n");
    } catch (error) {
      console.error(`${getCurrentTimestamp()} - ❌ UnifiedMCPClient - Error processing query:`, error);
      return "Sorry, I encountered an error while processing your query.";
    }
  }
}
