export type MapPredictParams = {
  teamA: string;
  teamB: string;
  map_name?: string;
};

export type MapPredictResponse = {
  prob_teamA: number;
  prob_teamB: number;
  features?: Record<string, number>;
  factor_contrib?: Record<string, number>;
  explanation?: string;
  uncertainty?: string;
  model_version?: string;
};

export type SeriesCombo = {
  maps: string[];
  prob_teamA: number;
  prob_teamB: number;
  per_map: { map: string; prob_teamA: number; prob_teamB: number }[];
};

export type SeriesPredictResponse = {
  teamA: string;
  teamB: string;
  format: string;
  headline: SeriesCombo;
  alternatives: SeriesCombo[];
  generated_at: string;
  model_version?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function fetchTeams(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/advanced/available-teams`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load teams");
  const data = await res.json();
  return data.teams || [];
}

export async function predictMap(params: MapPredictParams): Promise<MapPredictResponse> {
  const q = new URLSearchParams();
  q.set("teamA", params.teamA);
  q.set("teamB", params.teamB);
  if (params.map_name) q.set("map_name", params.map_name);
  const res = await fetch(`${API_BASE}/advanced/realistic/map-predict?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Prediction failed");
  return res.json();
}

export async function predictMapLive(params: MapPredictParams): Promise<MapPredictResponse> {
  const q = new URLSearchParams();
  q.set("teamA", params.teamA);
  q.set("teamB", params.teamB);
  if (params.map_name) q.set("map_name", params.map_name);
  const res = await fetch(`${API_BASE}/advanced/live/map-predict?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Live prediction failed");
  return res.json();
}

export async function predictSeries(teamA: string, teamB: string, topN = 3, maps?: string[]): Promise<SeriesPredictResponse> {
  const q = new URLSearchParams();
  q.set("teamA", teamA);
  q.set("teamB", teamB);
  q.set("topN", String(topN));
  if (maps && maps.length > 0) q.set("maps", maps.join(","));
  const res = await fetch(`${API_BASE}/advanced/series-predict?${q.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Series prediction failed");
  return res.json();
}

export async function fetchModelInfo(): Promise<any> {
  const res = await fetch(`${API_BASE}/advanced/model-info`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch model info");
  return res.json();
}

// Dashboard API functions
export async function fetchSystemMetrics(): Promise<any> {
  const res = await fetch(`${API_BASE}/dashboard/metrics/system`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch system metrics");
  return res.json();
}

export async function fetchModelPerformance(): Promise<any> {
  const res = await fetch(`${API_BASE}/dashboard/metrics/models`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch model performance");
  return res.json();
}

export async function fetchTeamAnalytics(topN: number = 10): Promise<any> {
  const res = await fetch(`${API_BASE}/dashboard/metrics/teams?top_n=${topN}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch team analytics");
  return res.json();
}

export async function fetchDataQuality(): Promise<any> {
  const res = await fetch(`${API_BASE}/dashboard/metrics/data-quality`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch data quality");
  return res.json();
}

export async function fetchRecentPredictions(limit: number = 20): Promise<any> {
  const res = await fetch(`${API_BASE}/dashboard/metrics/predictions/recent?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch recent predictions");
  return res.json();
}

export async function fetchLivePerformance(): Promise<any> {
  const res = await fetch(`${API_BASE}/dashboard/metrics/performance/live`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch live performance");
  return res.json();
}
