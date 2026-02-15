import { ContextManager } from "../memory/context";
import { ToolExecutor } from "./tools";
import { openai } from "../llm/client";
import { db } from "../db";
import { messages } from "../db/schema";
import { tools } from "./tools";

const MAX_ITERATIONS = 10;

interface SaveMessageParams {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
}

export class AgentLoop {
  private agentId: string;
  private contextManager: ContextManager;
  private toolExecutor: ToolExecutor;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.contextManager = new ContextManager(agentId, 8000);
    this.toolExecutor = new ToolExecutor(agentId);
  }

  async saveMessage(params: SaveMessageParams) {
    await db.insert(messages).values({
      agentId: this.agentId,
      role: params.role,
      content: params.content,
      toolCalls: params.toolCalls,
      toolCallId: params.toolCallId,
      name: params.name,
      isVisible: true,
    });
  }

  async handleMessage(userMessage: string): Promise<string> {
    // Save the user's message to the FIFO buffer
    await this.saveMessage({
      role: "user",
      content: userMessage,
    });

    let userResponse: string | null = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Assemble prompt (evicts old messages if over token budget)
      const prompt = await this.contextManager.evictAndAssemble();

      // Call the LLM with tools
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: prompt,
        tools,
      });

      const message = response.choices[0]?.message;
      if (!message) break;

      // Save the assistant's response to the FIFO buffer
      await this.saveMessage({
        role: "assistant",
        content: message.content ?? "",
        toolCalls: message.tool_calls,
      });

      // If no tool calls, the agent is done thinking
      if (!message.tool_calls || message.tool_calls.length === 0) break;

      // Execute each tool call and save results
      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue;

        const result = await this.toolExecutor.execute(
          toolCall.function.name,
          toolCall.function.arguments,
        );

        // Save the tool result to the FIFO buffer
        await this.saveMessage({
          role: "tool",
          content: result,
          toolCallId: toolCall.id,
          name: toolCall.function.name,
        });

        // Capture send_message output — this is what the user sees
        if (toolCall.function.name === "send_message") {
          userResponse = result;
        }
      }

      // If the agent sent a message to the user, we're done
      if (userResponse) break;
    }

    return userResponse ?? "No response generated.";
  }
}
