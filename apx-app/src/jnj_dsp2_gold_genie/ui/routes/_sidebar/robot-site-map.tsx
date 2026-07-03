import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, MapPinned } from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

type RobotSiteRobot = {
  robot_id: string;
  case_count: number;
  avg_risk_score: number;
  service_needed_rate_pct: number;
  top_risk_component?: string | null;
  risk_summary: string;
};

type RobotMapPoint = {
  site_id: string;
  site_name: string;
  latitude: number;
  longitude: number;
  region?: string | null;
  robot_count: number;
  case_count: number;
  avg_risk_score: number;
  robots: RobotSiteRobot[];
};

type RobotMapResponse = {
  points: RobotMapPoint[];
};

export const Route = createFileRoute("/_sidebar/robot-site-map")({
  component: () => <RobotSiteMapPage />,
});

function FitToSites({ points }: { points: RobotMapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 7);
      return;
    }
    const bounds: LatLngBoundsExpression = points.map((point) => [
      point.latitude,
      point.longitude,
    ]);
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [map, points]);

  return null;
}

function RobotSiteMapPage() {
  const [data, setData] = useState<RobotMapResponse | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/robot-map");
        if (!response.ok) {
          throw new Error(`Failed to load site map (${response.status})`);
        }
        const payload = (await response.json()) as RobotMapResponse;
        if (cancelled) return;
        setData(payload);
        setSelectedSiteId(payload.points[0]?.site_id ?? null);
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

  const selectedSite = useMemo(
    () => data?.points.find((site) => site.site_id === selectedSiteId) ?? null,
    [data, selectedSiteId],
  );
  const center = useMemo<LatLngExpression>(() => {
    const first = data?.points[0];
    if (!first) return [39.8283, -98.5795];
    return [first.latitude, first.longitude];
  }, [data]);

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card className="min-h-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinned className="h-4 w-4" />
            Robot Site Map
          </CardTitle>
        </CardHeader>
        <CardContent className="min-h-0">
          {loading ? (
            <Skeleton className="h-[58vh] w-full" />
          ) : error ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : !data?.points.length ? (
            <p className="text-sm text-muted-foreground">
              No site location points found. Run the workflow after loading location CSV data.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="h-[58vh] overflow-hidden rounded-lg border">
                <MapContainer
                  center={center}
                  zoom={4}
                  scrollWheelZoom
                  className="h-full w-full"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <FitToSites points={data.points} />
                  {data.points.map((point) => {
                    const selected = point.site_id === selectedSiteId;
                    return (
                      <CircleMarker
                        key={point.site_id}
                        center={[point.latitude, point.longitude]}
                        radius={selected ? 12 : 9}
                        pathOptions={{
                          color: selected ? "#b91c1c" : "#0284c7",
                          fillColor: selected ? "#ef4444" : "#38bdf8",
                          fillOpacity: 0.85,
                          weight: selected ? 3 : 2,
                        }}
                        eventHandlers={{
                          click: () => setSelectedSiteId(point.site_id),
                        }}
                      >
                        <Popup>
                          <div className="space-y-1 text-xs">
                            <p className="text-sm font-semibold">{point.site_name}</p>
                            <p>Robots: {point.robot_count}</p>
                            <p>Cases: {point.case_count}</p>
                            <p>Avg ML risk: {point.avg_risk_score.toFixed(1)}%</p>
                            <p>Click marker to load site details panel.</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}
                </MapContainer>
              </div>
              <p className="text-xs text-muted-foreground">
                OpenStreetMap view: click a site marker to view robots, case volume, and risk summary.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-h-0">
        <CardHeader>
          <CardTitle>Site Details</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 space-y-3">
          {!selectedSite ? (
            <p className="text-sm text-muted-foreground">Select a site on the map.</p>
          ) : (
            <>
              <div className="space-y-1 rounded-md border p-3">
                <p className="text-sm font-semibold">{selectedSite.site_name}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Site: {selectedSite.site_id}</Badge>
                  <Badge variant="outline">Region: {selectedSite.region ?? "N/A"}</Badge>
                  <Badge variant="outline">Robots: {selectedSite.robot_count}</Badge>
                  <Badge variant="outline">Cases: {selectedSite.case_count}</Badge>
                  <Badge variant="outline">Avg ML Risk: {selectedSite.avg_risk_score.toFixed(1)}%</Badge>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  {selectedSite.avg_risk_score >= 70
                    ? "Quick risk summary: this site is in an elevated maintenance posture."
                    : selectedSite.avg_risk_score >= 55
                      ? "Quick risk summary: this site should be prioritized in upcoming maintenance reviews."
                      : "Quick risk summary: this site is currently within expected operating range."}
                </p>
              </div>

              <div className="max-h-[44vh] overflow-auto rounded border">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Robot</th>
                      <th className="px-3 py-2 text-left">Cases</th>
                      <th className="px-3 py-2 text-left">Avg ML Risk</th>
                      <th className="px-3 py-2 text-left">Service Need</th>
                      <th className="px-3 py-2 text-left">Primary Driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSite.robots.map((robot) => (
                      <tr key={robot.robot_id} className="border-t align-top">
                        <td className="px-3 py-2 font-medium">{robot.robot_id}</td>
                        <td className="px-3 py-2">{robot.case_count.toLocaleString()}</td>
                        <td className="px-3 py-2">{robot.avg_risk_score.toFixed(1)}%</td>
                        <td className="px-3 py-2">{robot.service_needed_rate_pct.toFixed(1)}%</td>
                        <td className="px-3 py-2">
                          {robot.top_risk_component ?? "component trend"} - {robot.risk_summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
