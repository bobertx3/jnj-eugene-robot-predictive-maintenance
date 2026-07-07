import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type RobotWatchlistItem = {
  robot_id: string;
  site_name?: string | null;
  avg_risk_score: number;
  service_needed_rate_pct: number;
  high_risk_component_count: number;
  last_case_ts?: string | null;
  last_case_procedure?: string | null;
  recommendation: string;
};

type RobotWatchlistResponse = {
  robots: RobotWatchlistItem[];
};

type RobotComponentRisk = {
  component_type: string;
  avg_risk_score: number;
  service_needed_rate_pct: number;
  error_events: number;
  latest_event_ts?: string | null;
};

type RobotComponentDetail = {
  robot_id: string;
  site_name?: string | null;
  last_case_ts?: string | null;
  last_case_procedure?: string | null;
  last_case_outcome?: string | null;
  components: RobotComponentRisk[];
};

type MaintenanceAiAnalysisResponse = {
  endpoint_name: string;
  analysis: string;
};

// Hotspot positions are expressed as % of the surgical-robot image so they
// track the instrument cluster / manipulator-arm joints (labeled 530 / J1).
const HOTSPOTS = [
  { key: "vision_module", label: "Camera", x: "46%", y: "34%" },
  { key: "arm_motor", label: "Arm Motor", x: "66%", y: "42%" },
  { key: "energy_unit", label: "Energy Unit", x: "33%", y: "66%" },
] as const;

export const Route = createFileRoute("/_sidebar/maintenance")({
  component: () => <MaintenancePage />,
});

function MaintenancePage() {
  const [watchlist, setWatchlist] = useState<RobotWatchlistItem[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RobotComponentDetail | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiEndpoint, setAiEndpoint] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const watchlistRes = await fetch("/api/robot-watchlist");
        if (!watchlistRes.ok) {
          throw new Error(`Failed to load watchlist (${watchlistRes.status})`);
        }
        const watchlistData = (await watchlistRes.json()) as RobotWatchlistResponse;
        if (cancelled) return;
        setWatchlist(watchlistData.robots);
        setSelectedRobotId((current) => current ?? watchlistData.robots[0]?.robot_id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadRobotDetail = async () => {
      if (!selectedRobotId) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/robot-component-detail/${encodeURIComponent(selectedRobotId)}`);
        if (!response.ok) {
          throw new Error(`Failed to load robot detail (${response.status})`);
        }
        const payload = (await response.json()) as RobotComponentDetail;
        if (cancelled) return;
        setDetail(payload);
        setSelectedComponent(payload.components[0]?.component_type ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };
    void loadRobotDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedRobotId]);

  const componentForHotspot = (componentType: string) => {
    if (!detail) return null;
    return detail.components.find((component) => component.component_type === componentType) ?? null;
  };

  const selectedComponentDetail =
    (detail?.components.find((comp) => comp.component_type === selectedComponent) ??
      detail?.components[0] ??
      null);

  const maintenanceClass = (serviceNeededRatePct: number, riskScore: number) => {
    // Color reflects maintenance urgency from rates/scores (not raw aggregate counts).
    if (serviceNeededRatePct >= 70 || riskScore >= 75) {
      return "bg-red-600 text-white";
    }
    if (serviceNeededRatePct >= 50 || riskScore >= 60) {
      return "bg-orange-500 text-white";
    }
    if (serviceNeededRatePct >= 30 || riskScore >= 45) {
      return "bg-amber-400 text-black";
    }
    return "bg-emerald-500 text-white";
  };

  const cleanAiText = (text: string) =>
    text
      .replace(/\*\*/g, "")
      .replace(/^-\s+/gm, "• ")
      .replace(/^#{1,6}\s*/gm, "")
      .trim();

  const renderAiAnalysis = (text: string) => {
    const lines = text.split("\n");
    return (
      <div className="space-y-1">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          const isHeadline =
            /^(what this means|immediate actions|what to monitor next)\s*$/i.test(trimmed);
          if (!trimmed) {
            return <div key={`spacer-${idx}`} className="h-2" />;
          }
          if (isHeadline) {
            return (
              <p key={`h-${idx}`} className="pt-2 text-base font-semibold">
                {trimmed}
              </p>
            );
          }
          return (
            <p key={`l-${idx}`} className="leading-6">
              {trimmed}
            </p>
          );
        })}
      </div>
    );
  };

  const analyzeWithAi = async () => {
    if (!detail || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiModalOpen(true);
    try {
      const response = await fetch("/api/maintenance-ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robot_id: detail.robot_id,
          component_type: selectedComponent ?? null,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`AI analysis failed (${response.status}): ${body}`);
      }
      const payload = (await response.json()) as MaintenanceAiAnalysisResponse;
      setAiAnalysis(cleanAiText(payload.analysis));
      setAiEndpoint(payload.endpoint_name);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Unknown AI analysis error");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_1.25fr]">
      <div className="min-h-0 space-y-4">
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>Maintenance Watchlist</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0">
            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : !watchlist.length ? (
              <p className="text-sm text-muted-foreground">
                No watchlist data available yet. Run the workflow to generate maintenance metrics.
              </p>
            ) : (
              <div className="max-h-[34vh] overflow-auto rounded border">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Robot</th>
                      <th className="px-3 py-2 text-left">Site</th>
                      <th className="px-3 py-2 text-left">Avg ML Risk</th>
                      <th className="px-3 py-2 text-left">Service Need</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlist.map((robot) => (
                      <tr
                        key={robot.robot_id}
                        className={`cursor-pointer border-t ${
                          selectedRobotId === robot.robot_id ? "bg-primary/10" : ""
                        }`}
                        onClick={() => setSelectedRobotId(robot.robot_id)}
                      >
                        <td className="px-3 py-2 font-medium">{robot.robot_id}</td>
                        <td className="px-3 py-2">{robot.site_name ?? "Unknown"}</td>
                        <td className="px-3 py-2">{robot.avg_risk_score.toFixed(1)}%</td>
                        <td className="px-3 py-2">{robot.service_needed_rate_pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>Selected Robot Component Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : !detail?.components.length ? (
              <p className="text-sm text-muted-foreground">
                Select a robot to view its component heatmap.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {detail.components.map((cell) => (
                  <div
                    key={cell.component_type}
                    className={`rounded-md border p-3 ${maintenanceClass(
                      cell.service_needed_rate_pct,
                      cell.avg_risk_score,
                    )}`}
                  >
                    <p className="text-sm font-semibold capitalize">{cell.component_type}</p>
                    <p className="text-xs">Avg ML risk: {cell.avg_risk_score.toFixed(1)}%</p>
                    <p className="text-xs">Service need: {cell.service_needed_rate_pct.toFixed(1)}%</p>
                    <p className="text-xs">Error events: {cell.error_events.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-0">
        <CardHeader>
          <CardTitle>Maintenance Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}
          {detailLoading ? (
            <Skeleton className="h-[54vh] w-full" />
          ) : !detail ? (
            <p className="text-sm text-muted-foreground">
              Select a robot from the watchlist to load component hotspots.
            </p>
          ) : (
            <>
              <div className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p>
                      <span className="font-semibold">Robot:</span> {detail.robot_id}
                    </p>
                    <p>
                      <span className="font-semibold">Site:</span> {detail.site_name ?? "Unknown"}
                    </p>
                    <p>
                      <span className="font-semibold">Last case:</span>{" "}
                      {detail.last_case_ts ?? "N/A"} ({detail.last_case_procedure ?? "procedure not available"})
                    </p>
                  </div>
                  <Button onClick={() => void analyzeWithAi()} disabled={aiLoading}>
                    {aiLoading ? "Analyzing..." : "Analyze with AI"}
                  </Button>
                </div>
              </div>

              <div className="relative flex h-[46vh] items-center justify-center rounded-lg border bg-slate-50">
                <div className="absolute left-3 top-3 z-10 rounded border bg-white/90 px-2 py-1 text-[11px] text-muted-foreground">
                  Red &gt;= 70%, Orange &gt;= 50%, Amber &gt;= 30% service-needed rate
                </div>
                {/* Wrapper shrinks to the rendered image so hotspot %s track the image itself. */}
                <div className="relative">
                  <img
                    src="/surgical-robot.png"
                    alt="Surgical robot system with manipulator arms"
                    className="max-h-[42vh] max-w-full object-contain"
                  />

                  {HOTSPOTS.map((hotspot) => {
                    const component = componentForHotspot(hotspot.key);
                    if (!component) return null;
                    const selected = selectedComponent === component.component_type;
                    return (
                      <button
                        key={hotspot.key}
                        type="button"
                        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-[11px] font-semibold shadow ${
                          selected ? "ring-2 ring-primary ring-offset-1" : ""
                        }`}
                        data-status-color={maintenanceClass(component.service_needed_rate_pct, component.avg_risk_score)}
                        style={{
                          left: hotspot.x,
                          top: hotspot.y,
                        }}
                        // Keep urgency color even when selected; selection adds a ring only.
                        onClick={() => setSelectedComponent(component.component_type)}
                      >
                        <span
                          className={`rounded-full border-2 border-white px-2 py-1 ${maintenanceClass(
                            component.service_needed_rate_pct,
                            component.avg_risk_score,
                          )}`}
                        >
                          {hotspot.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedComponentDetail && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-semibold capitalize">{selectedComponentDetail.component_type}</p>
                  <p>ML risk: {selectedComponentDetail.avg_risk_score.toFixed(1)}%</p>
                  <p>Service-needed rate: {selectedComponentDetail.service_needed_rate_pct.toFixed(1)}%</p>
                  <p>Error events: {selectedComponentDetail.error_events.toLocaleString()}</p>
                  <p>
                    Maintenance status:{" "}
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${maintenanceClass(
                        selectedComponentDetail.service_needed_rate_pct,
                        selectedComponentDetail.avg_risk_score,
                      )}`}
                    >
                      {selectedComponentDetail.service_needed_rate_pct >= 70
                        ? "Needs maintenance"
                        : selectedComponentDetail.service_needed_rate_pct >= 50
                          ? "Monitor closely"
                          : "Normal range"}
                    </span>
                  </p>
                  <p>Latest signal date: {selectedComponentDetail.latest_event_ts ?? "N/A"}</p>
                  <p className="pt-1 text-muted-foreground">
                    Last case context: {detail.last_case_procedure ?? "N/A"} ({detail.last_case_outcome ?? "N/A"})
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-lg border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="font-semibold">AI Maintenance Analysis</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAiModalOpen(false)}
                disabled={aiLoading}
              >
                Dismiss
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-auto px-4 py-3 text-sm">
              {aiLoading && <p className="text-muted-foreground">Generating analysis...</p>}
              {aiError && <p className="text-destructive">{aiError}</p>}
              {aiAnalysis && renderAiAnalysis(aiAnalysis)}
              {aiEndpoint && (
                <p className="mt-2 text-xs text-muted-foreground">Model endpoint: {aiEndpoint}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
