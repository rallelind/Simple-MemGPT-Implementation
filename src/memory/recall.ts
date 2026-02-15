import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { messages } from "../db/schema";
import { embed } from "../llm/embeddings";

export class RecallStorage {
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async search(query: string, limit = 10) {
    const queryEmbedding = await embed(query);
    const similarity = sql<number>`1 - ${cosineDistance(messages.embedding, queryEmbedding)}`;

    return db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
        similarity,
      })
      .from(messages)
      .where(and(eq(messages.agentId, this.agentId), eq(messages.isVisible, false)))
      .orderBy(desc(similarity))
      .limit(limit);
  }
}
