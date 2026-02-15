import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { archivalMemory } from "../db/schema";
import { embed } from "../llm/embeddings";

export class ArchivalMemory {
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async insert(content: string) {
    const embedding = await embed(content);

    await db.insert(archivalMemory).values({
      agentId: this.agentId,
      content,
      embedding,
    });
  }

  async search(query: string, limit = 10) {
    const queryEmbedding = await embed(query);
    const similarity = sql<number>`1 - ${cosineDistance(archivalMemory.embedding, queryEmbedding)}`;

    return db
      .select({
        id: archivalMemory.id,
        content: archivalMemory.content,
        createdAt: archivalMemory.createdAt,
        similarity,
      })
      .from(archivalMemory)
      .where(eq(archivalMemory.agentId, this.agentId))
      .orderBy(desc(similarity))
      .limit(limit);
  }
}
