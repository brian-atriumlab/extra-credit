import { getTeamSummary } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

// Next decodes path segments, so `name` arrives already URL-decoded
// (e.g. "West%20Coast" → "West Coast").
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const summary = getTeamSummary(name);
  if (!summary) {
    return jsonResponse({ error: "team_not_found", name }, 404);
  }
  return jsonResponse(summary);
}
