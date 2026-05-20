// Tiny response helpers so the API routes stay thin and consistent.
// Every reporting endpoint is live-queried, so nothing here is ever cached.

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** JSON response with no-store. Pass a status for error bodies (e.g. 404). */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...NO_STORE },
  });
}

/** CSV file response the customer success team drops into Google Sheets. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...NO_STORE,
    },
  });
}
