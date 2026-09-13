import Anthropic from "@anthropic-ai/sdk";

/**
 * Model choice is deliberate and split by route:
 *
 * - Live turn analysis runs at `low` effort. The host is mid-sentence; a
 *   suggestion that lands after the moment has passed is worth nothing, so
 *   latency is the binding constraint, not depth.
 * - One-pager synthesis runs at `high`. It happens once, after the meeting,
 *   and it is the artefact the planning team actually uses.
 */
export const MODEL = "claude-opus-5";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}
