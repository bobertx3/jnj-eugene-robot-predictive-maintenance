import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Activity, Bot, ShieldAlert, Wrench } from "lucide-react";

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
          driver: "Elevated operating temperature",
          recommendation: "Schedule thermal inspection and cooling-system check in next cycle.",
        };
      }
      if (top === vibSignal) {
        return {
          driver: "Abnormal vibration trend",
          recommendation: "Perform mechanical alignment and component wear assessment.",
        };
      }
      if (top === utilSignal) {
        return {
          driver: "High recent utilization",
          recommendation: "Plan preventive maintenance window before next heavy usage block.",
        };
      }
      return {
        driver: "Rising error-event pattern",
        recommendation: "Prioritize diagnostics and preventive service in upcoming maintenance window.",
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          title="Robots Covered"
          value={overview ? overview.total_robots.toLocaleString() : "--"}
          subtitle="Robots monitored in current health view"
          icon={<Activity className="h-4 w-4" />}
          loading={loadingOverview}
        />
        <MetricTile
          title="Avg Risk Score"
          value={overview ? overview.avg_risk_score.toFixed(2) : "--"}
          subtitle="Mean predictive maintenance risk score"
          icon={<ShieldAlert className="h-4 w-4" />}
          loading={loadingOverview}
        />
        <MetricTile
          title="Service Needed"
          value={
            overview
              ? `${overview.service_needed_count.toLocaleString()} (${overview.service_needed_rate_pct.toFixed(1)}%)`
              : "--"
          }
          subtitle="Entities currently flagged for near-term service"
          icon={<Wrench className="h-4 w-4" />}
          loading={loadingOverview}
        />
        <MetricTile
          title="Avg ML Risk"
          value={overview ? `${(overview.avg_ml_risk_probability * 100).toFixed(1)}%` : "--"}
          subtitle={
            overview
              ? `${overview.high_ml_risk_count.toLocaleString()} high-risk ML rows`
              : "High-risk population by model"
          }
          icon={<Bot className="h-4 w-4" />}
          loading={loadingOverview}
        />
      </div>

      <Card className="min-h-0">
        <CardHeader>
          <CardTitle>Executive Health Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOverview ? (
            <div className="space-y-2">
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
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">Current posture:</span>{" "}
                {overview.service_needed_rate_pct.toFixed(1)}% of monitored entities are predicted
                to require maintenance soon.
              </p>
              <p>
                <span className="font-semibold">Fleet coverage:</span>{" "}
                {overview.total_robots.toLocaleString()} robots across{" "}
                {overview.total_components.toLocaleString()} components are included in this run.
              </p>
              <p>
                <span className="font-semibold">Risk concentration:</span>{" "}
                {overview.high_ml_risk_count.toLocaleString()} observations are in the high-risk ML
                segment (average ML risk {(overview.avg_ml_risk_probability * 100).toFixed(1)}%).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>Maintenance Watchlist (Upcoming Focus)</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0">
          {loadingInsights ? (
            <Skeleton className="h-32 w-full" />
          ) : watchlist.length > 0 ? (
            <div className="max-h-[42vh] overflow-auto rounded border">
              <table className="w-full text-xs md:text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Robot</th>
                    <th className="px-3 py-2 text-left">Avg Risk Score</th>
                    <th className="px-3 py-2 text-left">Service Likelihood</th>
                    <th className="px-3 py-2 text-left">Primary Driver</th>
                    <th className="px-3 py-2 text-left">Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((robot) => (
                    <tr key={robot.robotId} className="border-t">
                      <td className="px-3 py-2 font-medium">{robot.robotId}</td>
                      <td className="px-3 py-2">{robot.avgRiskScore.toFixed(2)}</td>
                      <td className="px-3 py-2">{robot.serviceLikelihoodPct.toFixed(1)}%</td>
                      <td className="px-3 py-2">{robot.driver}</td>
                      <td className="px-3 py-2">{robot.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No risk watchlist items available yet. Run the workflow to generate the latest
              predictive maintenance metrics.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricTile({
  title,
  value,
  subtitle,
  icon,
  loading,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-7 w-28 mb-2" />
            <Skeleton className="h-4 w-full" />
          </>
        ) : (
          <>
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
