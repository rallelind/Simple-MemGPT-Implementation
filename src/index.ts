import { db } from "./db";
import { agents, coreMemory } from "./db/schema";
import { AgentLoop } from "./agent/loop";
import { eq } from "drizzle-orm";

const AGENT_NAME = "memgpt";

async function getOrCreateAgent(): Promise<string> {
  // Check if agent already exists
  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.name, AGENT_NAME))
    .limit(1);

  if (existing) return existing.id;

  // Create new agent
  const [agent] = await db
    .insert(agents)
    .values({
      name: AGENT_NAME,
      persona: "I am Sam, a friendly and curious AI assistant. I enjoy learning about the people I talk to and remembering details about them.",
      systemPrompt: `You are MemGPT, an AI assistant with self-managed memory.

You have access to a working memory (core memory) that is always visible to you. Use it to store important facts.

## Rules
- You MUST call send_message() to communicate with the user. Do NOT respond with plain text.
- Use core_memory_append to save important facts about the user or yourself.
- Use core_memory_replace to update facts that have changed.
- Use conversation_search to find past messages that are no longer in your context.
- Use archival_memory_insert to store detailed notes for long-term reference.
- Use archival_memory_search to retrieve long-term notes.
- Think step by step before responding. Save important information first, then respond.
- Be concise but warm.`,
    })
    .returning();

  if (!agent) throw new Error("Failed to create agent");

  // Create initial core memory sections
  await db.insert(coreMemory).values([
    { agentId: agent.id, section: "human", content: "" },
    { agentId: agent.id, section: "persona", content: "I am Sam, a friendly and curious AI assistant." },
  ]);

  console.log("Created new agent:", agent.id);
  return agent.id;
}

async function main() {
  console.log("MemGPT - Starting up...\n");

  const agentId = await getOrCreateAgent();
  const agent = new AgentLoop(agentId);

  console.log("Agent ready. Type a message to chat. Type 'exit' to quit.\n");

  const prompt = "> ";
  process.stdout.write(prompt);

  for await (const line of console) {
    const input = line.trim();

    if (input === "exit" || input === "quit") {
      console.log("Goodbye!");
      process.exit(0);
    }

    if (!input) {
      process.stdout.write(prompt);
      continue;
    }

    try {
      const response = await agent.handleMessage(input);
      console.log(`\nSam: ${response}\n`);
    } catch (error) {
      console.error("Error:", error);
    }

    process.stdout.write(prompt);
  }
}

main();
