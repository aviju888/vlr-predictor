"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBarCompact } from "@/components/ConfidenceBar";
import {
  PredictionRecord,
  getHistory,
  deletePrediction,
  clearHistory,
  exportHistoryCSV,
} from "@/lib/prediction-history";

export default function HistoryPage() {
  const [history, setHistory] = useState<PredictionRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setHistory(getHistory());
  }, []);

  const handleDelete = (id: string) => {
    deletePrediction(id);
    setHistory(getHistory());
  };

  const handleClear = () => {
    if (confirm("Are you sure you want to clear all prediction history?")) {
      clearHistory();
      setHistory([]);
    }
  };

  const handleExport = () => {
    const csv = exportHistoryCSV();
    if (!csv) return;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vlr-predictions-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    // Less than 1 hour ago
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    }
    // Less than 24 hours ago
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    // Same year
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return "text-green-600 dark:text-green-400";
    if (confidence >= 0.6) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  if (!mounted) {
    return (
      <main className="mx-auto max-w-4xl p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prediction History</h1>
          <p className="text-muted-foreground">
            {history.length} prediction{history.length !== 1 ? "s" : ""} saved locally
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={history.length === 0}>
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={history.length === 0}
            className="text-destructive hover:text-destructive"
          >
            Clear All
          </Button>
        </div>
      </div>

      {/* History List */}
      {history.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="font-semibold mb-2">No predictions yet</h3>
            <p className="text-muted-foreground text-sm">
              Make a prediction on the home page and it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {history.map((prediction) => (
            <Card key={prediction.id} className="overflow-hidden">
              <div className="flex items-center p-4 gap-4">
                {/* Match info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold truncate">{prediction.teamA}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span className="font-semibold truncate">{prediction.teamB}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="px-2 py-0.5 bg-muted rounded text-xs font-medium">
                      {prediction.map}
                    </span>
                    <span>{formatDate(prediction.timestamp)}</span>
                    <span className="hidden sm:inline">{prediction.model}</span>
                  </div>
                </div>

                {/* Confidence bar */}
                <div className="w-48 hidden md:block">
                  <ConfidenceBarCompact
                    teamA={prediction.teamA}
                    teamB={prediction.teamB}
                    probA={prediction.probA}
                  />
                </div>

                {/* Result */}
                <div className="text-right shrink-0">
                  <div className="font-semibold">{prediction.winner}</div>
                  <div className={`text-sm ${getConfidenceColor(prediction.confidence)}`}>
                    {Math.round(prediction.confidence * 100)}%
                  </div>
                </div>

                {/* Delete button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(prediction.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Stats summary */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {history.length}
                </div>
                <div className="text-sm text-muted-foreground">Total Predictions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {history.filter((p) => p.confidence >= 0.7).length}
                </div>
                <div className="text-sm text-muted-foreground">High Confidence</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {new Set(history.map((p) => p.map)).size}
                </div>
                <div className="text-sm text-muted-foreground">Maps Analyzed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {new Set([...history.map((p) => p.teamA), ...history.map((p) => p.teamB)]).size}
                </div>
                <div className="text-sm text-muted-foreground">Teams Predicted</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
