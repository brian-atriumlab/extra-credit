import { getWeeklyDigest } from "@/lib/db";
import { jsonResponse } from "@/lib/http";

// Numbers are always live — never statically rendered or cached.
export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse(getWeeklyDigest());
}
