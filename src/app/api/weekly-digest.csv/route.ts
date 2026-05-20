import { getWeeklyDigestCsv } from "@/lib/db";
import { csvResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET() {
  return csvResponse(getWeeklyDigestCsv(), "weekly-digest.csv");
}
