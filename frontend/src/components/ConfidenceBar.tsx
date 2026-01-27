"use client";

interface ConfidenceBarProps {
  teamA: string;
  teamB: string;
  probA: number; // 0-1
  className?: string;
}

export default function ConfidenceBar({
  teamA,
  teamB,
  probA,
  className = "",
}: ConfidenceBarProps) {
  const probB = 1 - probA;
  const percentA = Math.round(probA * 100);
  const percentB = Math.round(probB * 100);

  // Determine confidence level and colors
  const getConfidenceLevel = (prob: number) => {
    if (prob >= 0.7) return { level: "High", color: "text-green-600 dark:text-green-400" };
    if (prob >= 0.6) return { level: "Medium", color: "text-yellow-600 dark:text-yellow-400" };
    return { level: "Low", color: "text-red-600 dark:text-red-400" };
  };

  const winner = probA > probB ? teamA : teamB;
  const winnerProb = Math.max(probA, probB);
  const confidence = getConfidenceLevel(winnerProb);

  // Colors for bars
  const colorA = probA > probB
    ? "bg-blue-500 dark:bg-blue-600"
    : "bg-blue-300 dark:bg-blue-800";
  const colorB = probB > probA
    ? "bg-purple-500 dark:bg-purple-600"
    : "bg-purple-300 dark:bg-purple-800";

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Team labels and percentages */}
      <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${probA > probB ? "text-blue-600 dark:text-blue-400" : ""}`}>
            {teamA}
          </span>
          <span className="text-muted-foreground">{percentA}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{percentB}%</span>
          <span className={`font-semibold ${probB > probA ? "text-purple-600 dark:text-purple-400" : ""}`}>
            {teamB}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-4 rounded-full overflow-hidden bg-muted flex">
        <div
          className={`h-full ${colorA} transition-all duration-500 ease-out`}
          style={{ width: `${percentA}%` }}
        />
        <div
          className={`h-full ${colorB} transition-all duration-500 ease-out`}
          style={{ width: `${percentB}%` }}
        />
        {/* Center divider */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-background/50" />
      </div>

      {/* Confidence indicator */}
      <div className="flex justify-center items-center gap-2 text-sm">
        <span className="text-muted-foreground">Predicted:</span>
        <span className="font-semibold">{winner}</span>
        <span className={`font-medium ${confidence.color}`}>
          ({confidence.level} confidence)
        </span>
      </div>
    </div>
  );
}

// Compact version for lists
export function ConfidenceBarCompact({
  teamA,
  teamB,
  probA,
  className = "",
}: ConfidenceBarProps) {
  const probB = 1 - probA;
  const percentA = Math.round(probA * 100);
  const percentB = Math.round(probB * 100);

  const colorA = probA > probB
    ? "bg-blue-500 dark:bg-blue-600"
    : "bg-blue-300/50 dark:bg-blue-800/50";
  const colorB = probB > probA
    ? "bg-purple-500 dark:bg-purple-600"
    : "bg-purple-300/50 dark:bg-purple-800/50";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs font-medium w-8 text-right">{percentA}%</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted flex">
        <div
          className={`h-full ${colorA} transition-all duration-300`}
          style={{ width: `${percentA}%` }}
        />
        <div
          className={`h-full ${colorB} transition-all duration-300`}
          style={{ width: `${percentB}%` }}
        />
      </div>
      <span className="text-xs font-medium w-8">{percentB}%</span>
    </div>
  );
}
