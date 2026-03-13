import { useQuery, useSuspenseQuery, useMutation } from "@tanstack/react-query";
import type { UseQueryOptions, UseSuspenseQueryOptions, UseMutationOptions } from "@tanstack/react-query";

export interface ComplexValue {
  display?: string | null;
  primary?: boolean | null;
  ref?: string | null;
  type?: string | null;
  value?: string | null;
}

export interface ComponentHeatmapCellOut {
  avg_risk_score: number;
  component_type: string;
  high_risk_robots: number;
  service_needed_rate_pct: number;
}

export interface ComponentHeatmapOut {
  cells: ComponentHeatmapCellOut[];
}

export interface GenieAskIn {
  conversation_id?: string | null;
  question: string;
}

export interface GenieAskOut {
  conversation_id: string;
  message_id: string;
  query_result?: GenieQueryResultOut | null;
  sql?: string | null;
  status: string;
  suggested_questions?: string[];
  text: string;
}

export interface GenieQueryResultOut {
  columns: string[];
  row_count: number;
  rows: unknown[][];
}

export interface GoldOverviewOut {
  avg_ml_risk_probability: number;
  avg_risk_score: number;
  high_ml_risk_count: number;
  service_needed_count: number;
  service_needed_rate_pct: number;
  total_components: number;
  total_robots: number;
}

export interface GoldPreviewOut {
  columns: string[];
  rows: unknown[][];
  table_name: string;
}

export interface GoldSummaryOut {
  catalog: string;
  schema: string;
  tables: GoldTableOut[];
}

export interface GoldTableOut {
  full_name: string;
  row_count?: number | null;
  table_name: string;
}

export interface HTTPValidationError {
  detail?: ValidationError[];
}

export interface MaintenanceAiAnalysisIn {
  component_type?: string | null;
  robot_id?: string | null;
}

export interface MaintenanceAiAnalysisOut {
  analysis: string;
  endpoint_name: string;
}

export interface Name {
  family_name?: string | null;
  given_name?: string | null;
}

export interface RobotComponentDetailOut {
  components?: RobotComponentRiskOut[];
  last_case_outcome?: string | null;
  last_case_procedure?: string | null;
  last_case_ts?: string | null;
  robot_id: string;
  site_name?: string | null;
}

export interface RobotComponentRiskOut {
  avg_risk_score: number;
  component_type: string;
  error_events: number;
  latest_event_ts?: string | null;
  service_needed_rate_pct: number;
}

export interface RobotMapOut {
  points: RobotMapPointOut[];
}

export interface RobotMapPointOut {
  avg_risk_score: number;
  case_count: number;
  latitude: number;
  longitude: number;
  region?: string | null;
  robot_count: number;
  robots?: RobotSiteRobotOut[];
  site_id: string;
  site_name: string;
}

export interface RobotSiteRobotOut {
  avg_risk_score: number;
  case_count: number;
  risk_summary: string;
  robot_id: string;
  service_needed_rate_pct: number;
  top_risk_component?: string | null;
}

export interface RobotWatchlistItemOut {
  avg_risk_score: number;
  high_risk_component_count: number;
  last_case_procedure?: string | null;
  last_case_ts?: string | null;
  recommendation: string;
  robot_id: string;
  service_needed_rate_pct: number;
  site_name?: string | null;
}

export interface RobotWatchlistOut {
  robots: RobotWatchlistItemOut[];
}

export interface User {
  active?: boolean | null;
  display_name?: string | null;
  emails?: ComplexValue[] | null;
  entitlements?: ComplexValue[] | null;
  external_id?: string | null;
  groups?: ComplexValue[] | null;
  id?: string | null;
  name?: Name | null;
  roles?: ComplexValue[] | null;
  schemas?: UserSchema[] | null;
  user_name?: string | null;
}

export const UserSchema = {
  "urn:ietf:params:scim:schemas:core:2.0:User": "urn:ietf:params:scim:schemas:core:2.0:User",
  "urn:ietf:params:scim:schemas:extension:workspace:2.0:User": "urn:ietf:params:scim:schemas:extension:workspace:2.0:User",
} as const;

export type UserSchema = (typeof UserSchema)[keyof typeof UserSchema];

export interface ValidationError {
  ctx?: Record<string, unknown>;
  input?: unknown;
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface VersionOut {
  version: string;
}

export interface CurrentUserParams {
  "X-Forwarded-Access-Token"?: string | null;
}

export interface GoldPreviewParams {
  table_name: string;
}

export interface RobotComponentDetailParams {
  robot_id: string;
}

export class ApiError extends Error {
  status: number;
  statusText: string;
  body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export const componentHeatmap = async (options?: RequestInit): Promise<{ data: ComponentHeatmapOut }> => {
  const res = await fetch("/api/component-heatmap", { ...options, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const componentHeatmapKey = () => {
  return ["/api/component-heatmap"] as const;
};

export function useComponentHeatmap<TData = { data: ComponentHeatmapOut }>(options?: { query?: Omit<UseQueryOptions<{ data: ComponentHeatmapOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: componentHeatmapKey(), queryFn: () => componentHeatmap(), ...options?.query });
}

export function useComponentHeatmapSuspense<TData = { data: ComponentHeatmapOut }>(options?: { query?: Omit<UseSuspenseQueryOptions<{ data: ComponentHeatmapOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: componentHeatmapKey(), queryFn: () => componentHeatmap(), ...options?.query });
}

export const currentUser = async (params?: CurrentUserParams, options?: RequestInit): Promise<{ data: User }> => {
  const res = await fetch("/api/current-user", { ...options, method: "GET", headers: { ...(params?.["X-Forwarded-Access-Token"] != null && { "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"] }), ...options?.headers } });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const currentUserKey = (params?: CurrentUserParams) => {
  return ["/api/current-user", params] as const;
};

export function useCurrentUser<TData = { data: User }>(options?: { params?: CurrentUserParams; query?: Omit<UseQueryOptions<{ data: User }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: currentUserKey(options?.params), queryFn: () => currentUser(options?.params), ...options?.query });
}

export function useCurrentUserSuspense<TData = { data: User }>(options?: { params?: CurrentUserParams; query?: Omit<UseSuspenseQueryOptions<{ data: User }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: currentUserKey(options?.params), queryFn: () => currentUser(options?.params), ...options?.query });
}

export const genieAsk = async (data: GenieAskIn, options?: RequestInit): Promise<{ data: GenieAskOut }> => {
  const res = await fetch("/api/genie/ask", { ...options, method: "POST", headers: { "Content-Type": "application/json", ...options?.headers }, body: JSON.stringify(data) });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export function useGenieAsk(options?: { mutation?: UseMutationOptions<{ data: GenieAskOut }, ApiError, GenieAskIn> }) {
  return useMutation({ mutationFn: (data) => genieAsk(data), ...options?.mutation });
}

export const goldOverview = async (options?: RequestInit): Promise<{ data: GoldOverviewOut }> => {
  const res = await fetch("/api/gold-overview", { ...options, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const goldOverviewKey = () => {
  return ["/api/gold-overview"] as const;
};

export function useGoldOverview<TData = { data: GoldOverviewOut }>(options?: { query?: Omit<UseQueryOptions<{ data: GoldOverviewOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: goldOverviewKey(), queryFn: () => goldOverview(), ...options?.query });
}

export function useGoldOverviewSuspense<TData = { data: GoldOverviewOut }>(options?: { query?: Omit<UseSuspenseQueryOptions<{ data: GoldOverviewOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: goldOverviewKey(), queryFn: () => goldOverview(), ...options?.query });
}

export const goldPreview = async (params: GoldPreviewParams, options?: RequestInit): Promise<{ data: GoldPreviewOut }> => {
  const res = await fetch(`/api/gold-preview/${params.table_name}`, { ...options, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const goldPreviewKey = (params?: GoldPreviewParams) => {
  return ["/api/gold-preview/{table_name}", params] as const;
};

export function useGoldPreview<TData = { data: GoldPreviewOut }>(options: { params: GoldPreviewParams; query?: Omit<UseQueryOptions<{ data: GoldPreviewOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: goldPreviewKey(options.params), queryFn: () => goldPreview(options.params), ...options?.query });
}

export function useGoldPreviewSuspense<TData = { data: GoldPreviewOut }>(options: { params: GoldPreviewParams; query?: Omit<UseSuspenseQueryOptions<{ data: GoldPreviewOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: goldPreviewKey(options.params), queryFn: () => goldPreview(options.params), ...options?.query });
}

export const goldSummary = async (options?: RequestInit): Promise<{ data: GoldSummaryOut }> => {
  const res = await fetch("/api/gold-summary", { ...options, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const goldSummaryKey = () => {
  return ["/api/gold-summary"] as const;
};

export function useGoldSummary<TData = { data: GoldSummaryOut }>(options?: { query?: Omit<UseQueryOptions<{ data: GoldSummaryOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: goldSummaryKey(), queryFn: () => goldSummary(), ...options?.query });
}

export function useGoldSummarySuspense<TData = { data: GoldSummaryOut }>(options?: { query?: Omit<UseSuspenseQueryOptions<{ data: GoldSummaryOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: goldSummaryKey(), queryFn: () => goldSummary(), ...options?.query });
}

export const maintenanceAiAnalysis = async (data: MaintenanceAiAnalysisIn, options?: RequestInit): Promise<{ data: MaintenanceAiAnalysisOut }> => {
  const res = await fetch("/api/maintenance-ai-analysis", { ...options, method: "POST", headers: { "Content-Type": "application/json", ...options?.headers }, body: JSON.stringify(data) });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export function useMaintenanceAiAnalysis(options?: { mutation?: UseMutationOptions<{ data: MaintenanceAiAnalysisOut }, ApiError, MaintenanceAiAnalysisIn> }) {
  return useMutation({ mutationFn: (data) => maintenanceAiAnalysis(data), ...options?.mutation });
}

export const robotComponentDetail = async (params: RobotComponentDetailParams, options?: RequestInit): Promise<{ data: RobotComponentDetailOut }> => {
  const res = await fetch(`/api/robot-component-detail/${params.robot_id}`, { ...options, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const robotComponentDetailKey = (params?: RobotComponentDetailParams) => {
  return ["/api/robot-component-detail/{robot_id}", params] as const;
};

export function useRobotComponentDetail<TData = { data: RobotComponentDetailOut }>(options: { params: RobotComponentDetailParams; query?: Omit<UseQueryOptions<{ data: RobotComponentDetailOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: robotComponentDetailKey(options.params), queryFn: () => robotComponentDetail(options.params), ...options?.query });
}

export function useRobotComponentDetailSuspense<TData = { data: RobotComponentDetailOut }>(options: { params: RobotComponentDetailParams; query?: Omit<UseSuspenseQueryOptions<{ data: RobotComponentDetailOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: robotComponentDetailKey(options.params), queryFn: () => robotComponentDetail(options.params), ...options?.query });
}

export const robotMap = async (options?: RequestInit): Promise<{ data: RobotMapOut }> => {
  const res = await fetch("/api/robot-map", { ...options, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const robotMapKey = () => {
  return ["/api/robot-map"] as const;
};

export function useRobotMap<TData = { data: RobotMapOut }>(options?: { query?: Omit<UseQueryOptions<{ data: RobotMapOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: robotMapKey(), queryFn: () => robotMap(), ...options?.query });
}

export function useRobotMapSuspense<TData = { data: RobotMapOut }>(options?: { query?: Omit<UseSuspenseQueryOptions<{ data: RobotMapOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: robotMapKey(), queryFn: () => robotMap(), ...options?.query });
}

export const robotWatchlist = async (options?: RequestInit): Promise<{ data: RobotWatchlistOut }> => {
  const res = await fetch("/api/robot-watchlist", { ...options, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const robotWatchlistKey = () => {
  return ["/api/robot-watchlist"] as const;
};

export function useRobotWatchlist<TData = { data: RobotWatchlistOut }>(options?: { query?: Omit<UseQueryOptions<{ data: RobotWatchlistOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: robotWatchlistKey(), queryFn: () => robotWatchlist(), ...options?.query });
}

export function useRobotWatchlistSuspense<TData = { data: RobotWatchlistOut }>(options?: { query?: Omit<UseSuspenseQueryOptions<{ data: RobotWatchlistOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: robotWatchlistKey(), queryFn: () => robotWatchlist(), ...options?.query });
}

export const version = async (options?: RequestInit): Promise<{ data: VersionOut }> => {
  const res = await fetch("/api/version", { ...options, method: "GET" });
  if (!res.ok) {
    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    throw new ApiError(res.status, res.statusText, parsed);
  }
  return { data: await res.json() };
};

export const versionKey = () => {
  return ["/api/version"] as const;
};

export function useVersion<TData = { data: VersionOut }>(options?: { query?: Omit<UseQueryOptions<{ data: VersionOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useQuery({ queryKey: versionKey(), queryFn: () => version(), ...options?.query });
}

export function useVersionSuspense<TData = { data: VersionOut }>(options?: { query?: Omit<UseSuspenseQueryOptions<{ data: VersionOut }, ApiError, TData>, "queryKey" | "queryFn"> }) {
  return useSuspenseQuery({ queryKey: versionKey(), queryFn: () => version(), ...options?.query });
}

