import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Call Claude with a system prompt (cached) and user content.
 * Uses prompt caching on the system prompt to reduce costs when processing multiple papers.
 */
export async function callClaude(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error(`Unexpected content block type: ${block.type}`);
  }

  return block.text;
}
