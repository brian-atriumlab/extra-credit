import { getDashboardData, type AgentTrend } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// The whole point is a live number, so re-read on every request — never cache.
export const dynamic = "force-dynamic";

const PERCENT_DECIMALS = 0;

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(PERCENT_DECIMALS)}%`;
}

/** Week-over-week change in percentage points, signed. */
function formatDelta(rateDelta: number): string {
  const points = Math.round(rateDelta * 100);
  const sign = points > 0 ? "+" : "";
  return `${sign}${points} pts`;
}

/** Short, timezone-stable date label from a YYYY-MM-DD key. */
function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Colored ▲/▼ for an agent's week-over-week trend. */
function TrendIndicator({ rateDelta }: { rateDelta: number }) {
  if (rateDelta > 0) {
    return <span className="text-success">▲ {formatDelta(rateDelta)}</span>;
  }
  if (rateDelta < 0) {
    return <span className="text-warning">▼ {formatDelta(rateDelta)}</span>;
  }
  return <span className="text-muted">— flat</span>;
}

export default function Page() {
  const dashboard = getDashboardData();

  // Worst week-over-week movers, but only agents who actually dialed last week.
  const needsAttention = dashboard.agents
    .filter((agent) => agent.rateDelta < 0 && agent.totalLast7 > 0)
    .slice(0, 3);

  const windowLabel = `${formatDay(dashboard.windowStart)} – ${formatDay(dashboard.windowEnd)}`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-content items-center gap-3 px-4 sm:px-6">
          {/* Logo artwork is near-black; `brightness-0 invert` recolors it to
              solid white so it reads on the dark header. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- local asset, keep aspect ratio */}
          <img src="/logo.png" alt="ArmorHQ" className="h-7 w-auto brightness-0 invert" />
          <span className="text-sm text-muted">Sales Performance</span>
        </div>
      </header>

      <main className="mx-auto max-w-content space-y-8 px-4 py-8 sm:px-6">
        {/* Top row: the Monday number, front and center, plus supporting stats. */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-accent/40 bg-accent/5">
            <CardHeader>
              <CardDescription>Calls connected · last 7 days</CardDescription>
              <CardTitle className="font-mono text-5xl tracking-tight">
                {dashboard.connectedLast7.toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">{windowLabel}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Connect rate · last 7 days</CardDescription>
              <CardTitle className="font-mono text-5xl tracking-tight">
                {formatRate(dashboard.connectRateLast7)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">
                {dashboard.totalLast7.toLocaleString()} calls dialed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Talk to on Monday</CardDescription>
              <CardTitle className="text-base font-medium">
                {needsAttention.length === 0 ? (
                  <span className="text-success">Everyone steady or up 👍</span>
                ) : (
                  <ul className="space-y-1">
                    {needsAttention.map((agent) => (
                      <li key={agent.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{agent.name}</span>
                        <span className="shrink-0 font-mono text-sm text-warning">
                          {formatDelta(agent.rateDelta)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">Biggest week-over-week drops</p>
            </CardContent>
          </Card>
        </section>

        {/* Full roster, worst-trending first — Dana's "who's getting worse" view. */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Agents · week over week</CardTitle>
              <CardDescription>
                Connect rate this week vs. the week before. Sorted by who slipped most.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-right">Connected (7d)</TableHead>
                    <TableHead className="text-right">Connect rate</TableHead>
                    <TableHead className="text-right">vs last week</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.agents.map((agent: AgentTrend) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="text-muted">{agent.team}</TableCell>
                      <TableCell className="text-right font-mono">
                        {agent.connectedLast7}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatRate(agent.connectRateLast7)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <TrendIndicator rateDelta={agent.rateDelta} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
