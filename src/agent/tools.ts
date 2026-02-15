import { z } from "zod";
import { zodFunction } from "openai/helpers/zod";
import { ArchivalMemory } from "../memory/archival";
import { RecallStorage } from "../memory/recall";
import { CoreMemory } from "../memory/core-memory";

const SendMessageParams = z.object({
  message: z.string().describe("The message to send to the user"),
});

const CoreMemoryAppendParams = z.object({
  section: z.string().describe("The section to append to, e.g. 'human' or 'persona'"),
  content: z.string().describe("The content to append"),
});

const CoreMemoryReplaceParams = z.object({
  section: z.string().describe("The section to edit"),
  old_content: z.string().describe("The text to find"),
  new_content: z.string().describe("The text to replace it with"),
});

const ConversationSearchParams = z.object({
  query: z.string().describe("The search query"),
});

const ArchivalInsertParams = z.object({
  content: z.string().describe("The content to store"),
});

const ArchivalSearchParams = z.object({
  query: z.string().describe("The search query"),
});

export const tools = [
  zodFunction({
    name: "send_message",
    description: "Send a message to the user",
    parameters: SendMessageParams,
  }),
  zodFunction({
    name: "core_memory_append",
    description: "Append content to a section of core memory",
    parameters: CoreMemoryAppendParams,
  }),
  zodFunction({
    name: "core_memory_replace",
    description: "Replace content in a section of core memory",
    parameters: CoreMemoryReplaceParams,
  }),
  zodFunction({
    name: "conversation_search",
    description: "Search past conversation messages that are no longer in context",
    parameters: ConversationSearchParams,
  }),
  zodFunction({
    name: "archival_memory_insert",
    description: "Store content in long-term archival memory",
    parameters: ArchivalInsertParams,
  }),
  zodFunction({
    name: "archival_memory_search",
    description: "Search long-term archival memory",
    parameters: ArchivalSearchParams,
  }),
];

export class ToolExecutor {
  private coreMemory: CoreMemory;
  private archivalMemory: ArchivalMemory;
  private recallStorage: RecallStorage;

  constructor(agentId: string) {
    this.coreMemory = new CoreMemory(agentId);
    this.archivalMemory = new ArchivalMemory(agentId);
    this.recallStorage = new RecallStorage(agentId);
  }

  async execute(name: string, rawArgs: string): Promise<string> {
    switch (name) {
      case "send_message": {
        const { message } = SendMessageParams.parse(JSON.parse(rawArgs));
        return message;
      }
      case "core_memory_append": {
        const { section, content } = CoreMemoryAppendParams.parse(JSON.parse(rawArgs));
        await this.coreMemory.append(section, content);
        return `OK. Core memory section '${section}' updated.`;
      }
      case "core_memory_replace": {
        const { section, old_content, new_content } = CoreMemoryReplaceParams.parse(
          JSON.parse(rawArgs),
        );
        await this.coreMemory.replace(section, old_content, new_content);
        return `OK. Core memory section '${section}' updated.`;
      }
      case "conversation_search": {
        const { query } = ConversationSearchParams.parse(JSON.parse(rawArgs));
        const results = await this.recallStorage.search(query);
        return JSON.stringify(results);
      }
      case "archival_memory_insert": {
        const { content } = ArchivalInsertParams.parse(JSON.parse(rawArgs));
        await this.archivalMemory.insert(content);
        return "OK. Content saved to archival memory.";
      }
      case "archival_memory_search": {
        const { query } = ArchivalSearchParams.parse(JSON.parse(rawArgs));
        const results = await this.archivalMemory.search(query);
        return JSON.stringify(results);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
