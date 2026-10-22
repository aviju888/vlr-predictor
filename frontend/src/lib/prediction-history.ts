export interface PredictionRecord {
  id: string;
  timestamp: number;
  teamA: string;
  teamB: string;
  map: string;
  probA: number;
  probB: number;
  winner: string;
  confidence: number;
  model: string;
}

const STORAGE_KEY = "vlr-prediction-history";
const MAX_HISTORY = 100;

export function savePrediction(prediction: Omit<PredictionRecord, "id" | "timestamp">): PredictionRecord {
  const record: PredictionRecord = {
    ...prediction,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  const history = getHistory();
  history.unshift(record);

  // Keep only last MAX_HISTORY predictions
  if (history.length > MAX_HISTORY) {
    history.splice(MAX_HISTORY);
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  return record;
}

export function getHistory(): PredictionRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function deletePrediction(id: string): void {
  const history = getHistory().filter((p) => p.id !== id);
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }
}

export function clearHistory(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function exportHistory(): string {
  const history = getHistory();
  return JSON.stringify(history, null, 2);
}

export function exportHistoryCSV(): string {
  const history = getHistory();
  if (history.length === 0) return "";

  const headers = ["Date", "Team A", "Team B", "Map", "Prob A", "Prob B", "Winner", "Confidence", "Model"];
  const rows = history.map((p) => [
    new Date(p.timestamp).toISOString(),
    p.teamA,
    p.teamB,
    p.map,
    (p.probA * 100).toFixed(1) + "%",
    (p.probB * 100).toFixed(1) + "%",
    p.winner,
    (p.confidence * 100).toFixed(1) + "%",
    p.model,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
