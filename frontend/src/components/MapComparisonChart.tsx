"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
  ReferenceLine,
} from "recharts";

interface MapPrediction {
  map: string;
  probA: number;
  probB: number;
}

interface MapComparisonChartProps {
  teamA: string;
  teamB: string;
  predictions: MapPrediction[];
  className?: string;
}

export default function MapComparisonChart({
  teamA,
  teamB,
  predictions,
  className = "",
}: MapComparisonChartProps) {
  // Transform data for horizontal bar chart
  // Positive values = Team A favored, Negative = Team B favored
  const data = predictions.map((p) => ({
    map: p.map,
    value: (p.probA - 0.5) * 100, // -50 to +50 scale
    probA: p.probA,
    probB: p.probB,
    favored: p.probA > p.probB ? teamA : teamB,
    favoredProb: Math.max(p.probA, p.probB),
  }));

  // Sort by most one-sided to least
  data.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Legend */}
      <div className="flex justify-center items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>{teamA} favored</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-500" />
          <span>{teamB} favored</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 60, bottom: 10 }}
          >
            <XAxis
              type="number"
              domain={[-50, 50]}
              tickFormatter={(v) => `${Math.abs(v)}%`}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="map"
              tick={{ fontSize: 12 }}
              width={50}
            />
            <ReferenceLine x={0} stroke="hsl(var(--border))" strokeWidth={2} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                    <div className="font-semibold mb-1">{d.map}</div>
                    <div className="space-y-1 text-muted-foreground">
                      <div>
                        {teamA}: {Math.round(d.probA * 100)}%
                      </div>
                      <div>
                        {teamB}: {Math.round(d.probB * 100)}%
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t">
                      <span className="font-medium">{d.favored}</span> favored (
                      {Math.round(d.favoredProb * 100)}%)
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 4, 4]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.value > 0 ? "#3b82f6" : "#a855f7"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 text-center text-sm">
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <div className="font-semibold text-blue-600 dark:text-blue-400">
            {data.filter((d) => d.value > 0).length} maps
          </div>
          <div className="text-muted-foreground">{teamA} favored</div>
        </div>
        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
          <div className="font-semibold text-purple-600 dark:text-purple-400">
            {data.filter((d) => d.value < 0).length} maps
          </div>
          <div className="text-muted-foreground">{teamB} favored</div>
        </div>
      </div>
    </div>
  );
}

// Compact horizontal bars without recharts (for simpler use)
export function MapComparisonBars({
  teamA,
  teamB,
  predictions,
  className = "",
}: MapComparisonChartProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {predictions.map((p) => {
        const percentA = Math.round(p.probA * 100);
        const percentB = Math.round(p.probB * 100);
        const aFavored = p.probA > p.probB;

        return (
          <div key={p.map} className="flex items-center gap-2">
            <span className="w-16 text-xs font-medium truncate">{p.map}</span>
            <div className="flex-1 h-5 rounded overflow-hidden bg-muted flex relative">
              <div
                className={`h-full transition-all duration-300 ${
                  aFavored ? "bg-blue-500" : "bg-blue-300 dark:bg-blue-800"
                }`}
                style={{ width: `${percentA}%` }}
              />
              <div
                className={`h-full transition-all duration-300 ${
                  !aFavored ? "bg-purple-500" : "bg-purple-300 dark:bg-purple-800"
                }`}
                style={{ width: `${percentB}%` }}
              />
              {/* Percentage labels */}
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white mix-blend-difference">
                {percentA}%
              </span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white mix-blend-difference">
                {percentB}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
