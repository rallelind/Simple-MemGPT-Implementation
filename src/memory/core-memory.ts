import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { coreMemory } from "../db/schema";

export class CoreMemory {
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  // append adds to the core memory section, not a new row
  async append(section: string, content: string) {
    await db
      .update(coreMemory)
      .set({
        content: sql`${coreMemory.content} || ${content}`,
        updatedAt: new Date(),
      })
      .where(and(eq(coreMemory.agentId, this.agentId), eq(coreMemory.section, section)));
  }

  async replace(section: string, oldContent: string, newContent: string) {
    await db
      .update(coreMemory)
      .set({
        content: sql`replace(${coreMemory.content}, ${oldContent}, ${newContent})`,
        updatedAt: new Date(),
      })
      .where(and(eq(coreMemory.agentId, this.agentId), eq(coreMemory.section, section)));
  }

  async read(section: string) {
    const result = await db
      .select()
      .from(coreMemory)
      .where(and(eq(coreMemory.agentId, this.agentId), eq(coreMemory.section, section)))
      .limit(1);
    return result[0];
  }

  async readAll() {
    return await db.select().from(coreMemory).where(eq(coreMemory.agentId, this.agentId));
  }
}
