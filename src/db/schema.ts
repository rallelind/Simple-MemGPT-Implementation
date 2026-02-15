import { pgTable, text, uuid, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

// ─── Agent Configuration ─────────────────────────────────────────────
// The "boot config" — who is this agent, what are its instructions?

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  persona: text("persona").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Core Memory (Working Memory) ────────────────────────────────────
// Small read/write scratchpad that is ALWAYS in the context window.
// The agent edits this via core_memory_append / core_memory_replace.
// Divided into sections like "human" (facts about user) and "persona"
// (agent's self-description).

export const coreMemory = pgTable("core_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .references(() => agents.id)
    .notNull(),
  section: text("section").notNull(),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Messages (FIFO Buffer + Recall Storage) ─────────────────────────
// Dual-purpose table:
//   isVisible = 1  →  currently in the context window ("RAM")
//   isVisible = 0  →  evicted, but searchable via embedding ("disk")
//
// When the message buffer exceeds the token budget, oldest messages
// get flipped to isVisible = 0. They can be retrieved later with
// conversation_search (vector similarity on the embedding column).

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    role: text("role").notNull(), // "user" | "assistant" | "system" | "tool"
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls"), // assistant's function calls
    toolCallId: text("tool_call_id"), // links tool response → call
    name: text("name"), // function name for tool messages
    isVisible: boolean("is_visible").notNull().default(true),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("messages_agent_idx").on(table.agentId),
    index("messages_visible_idx").on(table.agentId, table.isVisible),
    index("messages_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

// ─── Archival Memory (Long-Term Storage) ─────────────────────────────
// Unbounded store for information the agent intentionally saves.
// Unlike recall (automatic eviction), archival is deliberate —
// the agent calls archival_memory_insert to store something here.
// Think of recall as "browser history" and archival as "bookmarks".

export const archivalMemory = pgTable(
  "archival_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .references(() => agents.id)
      .notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("archival_agent_idx").on(table.agentId),
    index("archival_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);
