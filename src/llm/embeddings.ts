import { openai } from "./client";

export const embed = async (text: string) => {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  const responseData = response.data[0];

  if (!responseData) {
    throw new Error("Failed to embed text");
  }

  return responseData.embedding;
};
