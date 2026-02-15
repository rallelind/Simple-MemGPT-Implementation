import { CoreMemory } from "./core-memory";
import { db } from "../db";
import { agents, messages } from "../db/schema";
import { and, asc, eq } from "drizzle-orm";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import { encode } from "gpt-tokenizer";
import { embed } from "../llm/embeddings";

export class ContextManager {
  private agentId: string;
  private maxTokens: number;

  constructor(agentId: string, maxTokens: number) {
    this.agentId = agentId;
    this.maxTokens = maxTokens;
  }

  async readAgent() {
    const [agent] = await db.select().from(agents).where(eq(agents.id, this.agentId)).limit(1);
    return agent;
  }

  async readActiveMessages() {
    const activeMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.agentId, this.agentId), eq(messages.isVisible, true)))
      .orderBy(asc(messages.createdAt));
    return activeMessages;
  }

  async assemblePrompt(): Promise<ChatCompletionMessageParam[]> {
    const agent = await this.readAgent();
    if (!agent) {
      throw new Error("Agent not found");
    }

    const coreMemory = new CoreMemory(this.agentId);
    const coreMemorySections = await coreMemory.readAll();

    const formattedCoreMemory = coreMemorySections
      .map((section) => `<${section.section}>${section.content}</${section.section}>`)
      .join("\n");

    const activeMessages = await this.readActiveMessages();

    const prompt = `
    ${agent.systemPrompt}

    ## Persona
    ${agent.persona}

    ## Working Memory

    <core_memory>
    ${formattedCoreMemory}
    </core_memory>
    `;

    const systemPrompt: ChatCompletionMessageParam = {
      role: "system",
      content: prompt,
    };

    const chatMessages: ChatCompletionMessageParam[] = activeMessages.map((message) => {
      if (message.role === "assistant" && message.toolCalls) {
        return {
          role: "assistant",
          content: message.content,
          tool_calls: message.toolCalls as ChatCompletionMessageToolCall[],
        };
      }

      if (message.role === "tool" && message.toolCallId) {
        return {
          role: "tool",
          content: message.content,
          tool_call_id: message.toolCallId,
        };
      }

      return {
        role: message.role as "user" | "system",
        content: message.content,
      };
    });

    return [systemPrompt, ...chatMessages];
  }

  countTokens(text: string) {
    return encode(text).length;
  }

  countMessageTokens(messages: ChatCompletionMessageParam[]) {
    let total = 0;

    for (const message of messages) {
      total += 4;
      if (typeof message.content === "string") {
        total += this.countTokens(message.content);
      }

      if ("tool_calls" in message && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          total += 4;
          if ("function" in toolCall) {
            total += this.countTokens(toolCall.function.name);
            total += this.countTokens(toolCall.function.arguments);
          }
        }
      }
    }

    return total;
  }

  async evictAndAssemble() {
    let prompt = await this.assemblePrompt();
    let tokenCount = this.countMessageTokens(prompt);

    while (tokenCount > this.maxTokens) {
      const [oldest] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.agentId, this.agentId), eq(messages.isVisible, true)))
        .orderBy(asc(messages.createdAt))
        .limit(1);

      if (!oldest) break;

      const embedding = await embed(oldest.content);

      await db
        .update(messages)
        .set({ isVisible: false, embedding })
        .where(eq(messages.id, oldest.id));

      prompt = await this.assemblePrompt();
      tokenCount = await this.countMessageTokens(prompt);
    }

    return prompt;
  }
}
