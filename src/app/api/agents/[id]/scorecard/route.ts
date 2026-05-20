import { getAgentScorecard } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

// Next 15 hands route params as a Promise.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scorecard = getAgentScorecard(id);
  if (!scorecard) {
    return jsonResponse({ error: "agent_not_found", id }, 404);
  }
  return jsonResponse(scorecard);
}
