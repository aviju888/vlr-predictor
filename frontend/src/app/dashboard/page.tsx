"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchSystemMetrics,
  fetchModelPerformance,
  fetchTeamAnalytics,
  fetchDataQuality,
  fetchRecentPredictions,
} from "@/lib/api";

interface SystemMetrics {
  total_predictions: number;
  accuracy_rate: number;
  avg_response_time: number;
  uptime_hours: number;
  cache_hit_rate: number;
}

interface ModelPerformance {
  model_name: string;
  accuracy: number;
  f1_score: number;
  brier_score: number;
  prediction_count: number;
}

interface TeamAnalytic {
  team_name: string;
  total_matches: number;
  win_rate: number;
}

interface DataQuality {
  total_teams: number;
  total_matches: number;
  data_coverage_days: number;
}

interface Prediction {
  teamA: string;
  teamB: string;
  map: string;
  confidence: number;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [modelPerformance, setModelPerformance] = useState<ModelPerformance[]>([]);
  const [teamAnalytics, setTeamAnalytics] = useState<TeamAnalytic[]>([]);
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);
  const [recentPredictions, setRecentPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [systemData, modelData, teamData, qualityData, predictionsData] =
        await Promise.allSettled([
          fetchSystemMetrics(),
          fetchModelPerformance(),
          fetchTeamAnalytics(10),
          fetchDataQuality(),
          fetchRecentPredictions(10),
        ]);

      if (systemData.status === "fulfilled") setSystemMetrics(systemData.value);
      if (modelData.status === "fulfilled") setModelPerformance(modelData.value);
      if (teamData.status === "fulfilled") setTeamAnalytics(teamData.value);
      if (qualityData.status === "fulfilled") setDataQuality(qualityData.value);
      if (predictionsData.status === "fulfilled")
        setRecentPredictions(predictionsData.value.recent_predictions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "models", label: "Models" },
    { id: "teams", label: "Teams" },
    { id: "data", label: "Data" },
  ];

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="text-center py-12">
          <h1 className="text-xl font-semibold text-destructive">Error</h1>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
          <Button onClick={loadData} variant="outline" size="sm" className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">System metrics and analytics</p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {/* Metrics */}
      {systemMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-2xl font-semibold">
              {(systemMetrics.accuracy_rate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Accuracy</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-semibold">
              {systemMetrics.total_predictions}
            </div>
            <div className="text-xs text-muted-foreground">Predictions</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-semibold">
              {(systemMetrics.cache_hit_rate * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">Cache Hit</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-semibold">
              {(systemMetrics.avg_response_time * 1000).toFixed(0)}ms
            </div>
            <div className="text-xs text-muted-foreground">Response</div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="font-medium mb-3">System Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span>Operational</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uptime</span>
                    <span>{systemMetrics?.uptime_hours.toFixed(1)}h</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="font-medium mb-3">Recent Predictions</h3>
                <div className="space-y-2 text-sm">
                  {recentPredictions.slice(0, 4).map((pred, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-muted-foreground truncate max-w-[180px]">
                        {pred.teamA} vs {pred.teamB}
                      </span>
                      <span>{(pred.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeTab === "models" && (
            <div className="space-y-4">
              {modelPerformance.map((model, i) => (
                <Card key={i} className="p-4">
                  <h3 className="font-medium mb-3">{model.model_name}</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Accuracy</div>
                      <div className="font-medium">
                        {(model.accuracy * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">F1 Score</div>
                      <div className="font-medium">{model.f1_score.toFixed(3)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Brier</div>
                      <div className="font-medium">{model.brier_score.toFixed(3)}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {activeTab === "teams" && (
            <Card className="p-4">
              <h3 className="font-medium mb-3">Top Teams</h3>
              <div className="space-y-2">
                {teamAnalytics.slice(0, 10).map((team, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-6">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium">{team.team_name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>{(team.win_rate * 100).toFixed(1)}%</span>
                      <span className="text-muted-foreground">
                        {team.total_matches}m
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === "data" && (
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-2xl font-semibold">
                  {dataQuality?.total_matches}
                </div>
                <div className="text-xs text-muted-foreground">Total Matches</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-semibold">
                  {dataQuality?.total_teams}
                </div>
                <div className="text-xs text-muted-foreground">Teams</div>
              </Card>
              <Card className="p-4">
                <div className="text-2xl font-semibold">
                  {dataQuality?.data_coverage_days}d
                </div>
                <div className="text-xs text-muted-foreground">Coverage</div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
