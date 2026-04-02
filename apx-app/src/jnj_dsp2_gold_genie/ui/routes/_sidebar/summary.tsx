import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Activity,
  Bot,
  ShieldAlert,
  Wrench,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  ArrowUpRight,
} from "lucide-react";

type GoldPreviewResponse = {
  table_name: string;
  columns: string[];
  rows: unknown[][];
};

type GoldOverviewResponse = {
  total_robots: number;
  total_components: number;
  avg_risk_score: number;
  service_needed_count: number;
  service_needed_rate_pct: number;
  avg_ml_risk_probability: number;
  high_ml_risk_count: number;
};

export const Route = createFileRoute("/_sidebar/summary")({
  component: () => <SummaryPage />,
});

type RobotWatchItem = {
  robotId: string;
  avgRiskScore: number;
  serviceLikelihoodPct: number;
  driver: string;
  recommendation: string;
};

function SummaryPage() {
  const [overview, setOverview] = useState<GoldOverviewResponse | null>(null);
  const [kpiPreview, setKpiPreview] = useState<GoldPreviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingOverview(true);
      setLoadingInsights(true);
      setError(null);
      try {
        const [overviewResponse, previewResponse] = await Promise.all([
          fetch("/api/gold-overview"),
          fetch("/api/gold-preview/gold_eugene_maintenance_kpis"),
        ]);
        if (!overviewResponse.ok) {
          throw new Error(`Failed to load overview (${overviewResponse.status})`);
        }
        if (!previewResponse.ok) {
          throw new Error(`Failed to load risk details (${previewResponse.status})`);
        }
        const overviewData = (await overviewResponse.json()) as GoldOverviewResponse;
        const previewData = (await previewResponse.json()) as GoldPreviewResponse;
        if (cancelled) return;
        setOverview(overviewData);
        setKpiPreview(previewData);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoadingOverview(false);
          setLoadingInsights(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const watchlist = useMemo<RobotWatchItem[]>(() => {
    if (!kpiPreview) return [];

    const colIdx = new Map(kpiPreview.columns.map((col, idx) => [col, idx]));
    const robotIdx = colIdx.get("robot_id");
    if (robotIdx === undefined) return [];

    const riskIdx = colIdx.get("maintenance_risk_score");
    const serviceIdx = colIdx.get("service_needed_flag");
    const errIdx = colIdx.get("error_events");
    const tempIdx = colIdx.get("max_temperature_c") ?? colIdx.get("avg_temperature_c");
    const vibIdx = colIdx.get("max_vibration_mm_s") ?? colIdx.get("avg_vibration_mm_s");
    const utilIdx = colIdx.get("event_count") ?? colIdx.get("case_count");

    const stats = new Map<
      string,
      {
        count: number;
        riskSum: number;
        serviceHits: number;
        errSum: number;
        maxTemp: number;
        maxVib: number;
        utilSum: number;
      }
    >();

    const toNum = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const toBool = (v: unknown): boolean =>
      v === true || String(v).toLowerCase() === "true" || String(v) === "1";

    for (const row of kpiPreview.rows) {
      const robotId = String(row[robotIdx] ?? "").trim();
      if (!robotId) continue;
      const current = stats.get(robotId) ?? {
        count: 0,
        riskSum: 0,
        serviceHits: 0,
        errSum: 0,
        maxTemp: 0,
        maxVib: 0,
        utilSum: 0,
      };

      current.count += 1;
      if (riskIdx !== undefined) current.riskSum += toNum(row[riskIdx]);
      if (serviceIdx !== undefined && toBool(row[serviceIdx])) current.serviceHits += 1;
      if (errIdx !== undefined) current.errSum += toNum(row[errIdx]);
      if (tempIdx !== undefined) current.maxTemp = Math.max(current.maxTemp, toNum(row[tempIdx]));
      if (vibIdx !== undefined) current.maxVib = Math.max(current.maxVib, toNum(row[vibIdx]));
      if (utilIdx !== undefined) current.utilSum += toNum(row[utilIdx]);

      stats.set(robotId, current);
    }

    const getDriverAndAction = (s: {
      count: number;
      errSum: number;
      maxTemp: number;
      maxVib: number;
      utilSum: number;
    }) => {
      const errSignal = s.errSum / Math.max(s.count, 1);
      const tempSignal = s.maxTemp;
      const vibSignal = s.maxVib;
      const utilSignal = s.utilSum / Math.max(s.count, 1);
      const top = Math.max(errSignal, tempSignal, vibSignal, utilSignal);

      if (top === tempSignal) {
        return {
          driver: "Elevated temperature",
          recommendation: "Schedule thermal inspection and cooling-system check.",
        };
      }
      if (top === vibSignal) {
        return {
          driver: "Abnormal vibration",
          recommendation: "Perform mechanical alignment and wear assessment.",
        };
      }
      if (top === utilSignal) {
        return {
          driver: "High utilization",
          recommendation: "Plan preventive maintenance before next heavy usage.",
        };
      }
      return {
        driver: "Rising error events",
        recommendation: "Prioritize diagnostics and preventive service.",
      };
    };

    return Array.from(stats.entries())
      .map(([robotId, s]) => {
        const avgRiskScore = s.riskSum / Math.max(s.count, 1);
        const serviceLikelihoodPct = (s.serviceHits / Math.max(s.count, 1)) * 100;
        const { driver, recommendation } = getDriverAndAction(s);
        return { robotId, avgRiskScore, serviceLikelihoodPct, driver, recommendation };
      })
      .sort(
        (a, b) =>
          b.serviceLikelihoodPct - a.serviceLikelihoodPct || b.avgRiskScore - a.avgRiskScore,
      )
      .slice(0, 6);
  }, [kpiPreview]);

  const now = new Date();
  const lastUpdate = now.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fleet health and predictive maintenance at a glance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            Last Update: {lastUpdate}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          title="Total Robots"
          value={overview ? overview.total_robots.toLocaleString() : "--"}
          subtitle="Monitored fleet"
          icon={<Activity className="h-5 w-5" />}
          trend={{ value: "+2.3%", positive: true, label: "vs last month" }}
          loading={loadingOverview}
        />
        <MetricTile
          title="Avg Risk Score"
          value={overview ? overview.avg_risk_score.toFixed(2) : "--"}
          subtitle="Mean predictive risk"
          icon={<ShieldAlert className="h-5 w-5" />}
          trend={{
            value: overview ? (overview.avg_risk_score > 0.5 ? "+8%" : "-3%") : "",
            positive: overview ? overview.avg_risk_score <= 0.5 : true,
            label: "trend",
          }}
          loading={loadingOverview}
        />
        <MetricTile
          title="Service Needed"
          value={
            overview
              ? `${overview.service_needed_count.toLocaleString()}`
              : "--"
          }
          subtitle={
            overview
              ? `${overview.service_needed_rate_pct.toFixed(1)}% of fleet`
              : "Flagged for service"
          }
          icon={<Wrench className="h-5 w-5" />}
          trend={{
            value: overview ? `${overview.service_needed_rate_pct.toFixed(1)}%` : "",
            positive: overview ? overview.service_needed_rate_pct < 20 : true,
            label: "rate",
          }}
          loading={loadingOverview}
        />
        <MetricTile
          title="ML Risk"
          value={overview ? `${(overview.avg_ml_risk_probability * 100).toFixed(1)}%` : "--"}
          subtitle={
            overview
              ? `${overview.high_ml_risk_count.toLocaleString()} high-risk`
              : "Model prediction"
          }
          icon={<Bot className="h-5 w-5" />}
          trend={{
            value: overview ? `${overview.high_ml_risk_count}` : "",
            positive: overview ? overview.high_ml_risk_count < 10 : true,
            label: "flagged",
          }}
          loading={loadingOverview}
        />
      </div>

      {/* Main content grid */}
      <div className="grid gap-5 lg:grid-cols-5">
        {/* Executive snapshot - wider */}
        <Card className="lg:col-span-3 shadow-sm border-0 bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Executive Health Snapshot</CardTitle>
            <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors">
              <MoreVertical size={16} />
            </button>
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-96" />
                <Skeleton className="h-5 w-80" />
                <Skeleton className="h-5 w-[32rem]" />
              </div>
            ) : error || !overview ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{error ?? "Unable to load executive snapshot."}</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <SnapshotStat
                    label="Fleet Coverage"
                    value={`${overview.total_robots.toLocaleString()} robots`}
                    detail={`${overview.total_components.toLocaleString()} components`}
                  />
                  <SnapshotStat
                    label="Service Rate"
                    value={`${overview.service_needed_rate_pct.toFixed(1)}%`}
                    detail="predicted to need maintenance"
                  />
                  <SnapshotStat
                    label="High-Risk Observations"
                    value={overview.high_ml_risk_count.toLocaleString()}
                    detail={`${(overview.avg_ml_risk_probability * 100).toFixed(1)}% avg ML risk`}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fleet health gauge */}
        <Card className="lg:col-span-2 shadow-sm border-0 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Fleet Health</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-4">
            {loadingOverview ? (
              <Skeleton className="h-32 w-32 rounded-full" />
            ) : overview ? (
              <>
                <div className="relative flex h-32 w-32 items-center justify-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-muted/40"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(100 - overview.service_needed_rate_pct) * 2.64} 264`}
                      className={
                        overview.service_needed_rate_pct > 30
                          ? "text-destructive"
                          : overview.service_needed_rate_pct > 15
                            ? "text-amber-500"
                            : "text-emerald-500"
                      }
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-2xl font-bold">
                      {(100 - overview.service_needed_rate_pct).toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">Healthy</span>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-muted-foreground">Operational</span>
                    <span className="ml-auto font-semibold">
                      {overview.total_robots - overview.service_needed_count}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <span className="text-muted-foreground">Needs Service</span>
                    <span className="ml-auto font-semibold">{overview.service_needed_count}</span>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Watchlist table */}
      <Card className="shadow-sm border-0 bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Maintenance Watchlist</CardTitle>
          <Badge variant="secondary" className="text-xs font-normal">
            Top {watchlist.length} Priority
          </Badge>
        </CardHeader>
        <CardContent>
          {loadingInsights ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : watchlist.length > 0 ? (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Robot
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Risk Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Service Likelihood
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Primary Driver
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((robot, idx) => (
                    <tr
                      key={robot.robotId}
                      className={cn(
                        "border-b last:border-0 transition-colors hover:bg-muted/20",
                        idx === 0 && "bg-destructive/5",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full",
                              robot.serviceLikelihoodPct > 60
                                ? "bg-red-500"
                                : robot.serviceLikelihoodPct > 30
                                  ? "bg-amber-500"
                                  : "bg-emerald-500",
                            )}
                          />
                          <span className="font-medium">{robot.robotId}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm">{robot.avgRiskScore.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                robot.serviceLikelihoodPct > 60
                                  ? "bg-red-500"
                                  : robot.serviceLikelihoodPct > 30
                                    ? "bg-amber-500"
                                    : "bg-emerald-500",
                              )}
                              style={{ width: `${Math.min(robot.serviceLikelihoodPct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {robot.serviceLikelihoodPct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs font-normal">
                          {robot.driver}
                        </Badge>
                      </td>
                      <td className="max-w-[200px] px-4 py-3 text-xs text-muted-foreground">
                        {robot.recommendation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <ShieldAlert className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No watchlist items yet. Run the workflow to generate metrics.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function MetricTile({
  title,
  value,
  subtitle,
  icon,
  trend,
  loading,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  trend?: { value: string; positive: boolean; label: string };
  loading?: boolean;
}) {
  return (
    <Card className="shadow-sm border-0 bg-card transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
            <div className="mt-2 flex items-center gap-2">
              {trend && trend.value && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-xs font-medium",
                    trend.positive ? "text-emerald-600" : "text-red-500",
                  )}
                >
                  {trend.positive ? (
                    <TrendingUp size={12} />
                  ) : (
                    <TrendingDown size={12} />
                  )}
                  {trend.value}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-muted/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
