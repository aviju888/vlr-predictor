import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MapPredictResponse } from "@/lib/api";
import { useState } from "react";

export default function MapResultCard({
  teamA,
  teamB,
  result,
}: {
  teamA: string;
  teamB: string;
  result: MapPredictResponse;
}) {
  const pA = result.prob_teamA;
  const pB = result.prob_teamB;
  const winner = pA >= pB ? teamA : teamB;
  const conf = Math.max(pA, pB);
  const [showDetails, setShowDetails] = useState(false);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">{winner} {(conf * 100).toFixed(0)}%</div>
          <div className="text-sm text-muted-foreground">
            {teamA} {(pA * 100).toFixed(1)}% · {teamB} {(pB * 100).toFixed(1)}%
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result.uncertainty && <Badge variant="secondary">Uncertainty: {result.uncertainty}</Badge>}
          <Badge variant="outline">Model: {result.model_version || "Calibrated"}</Badge>
        </div>
      </div>

      {result.explanation && <p className="text-sm">{result.explanation}</p>}

      {result.features && (
        <ul className="text-sm list-disc list-inside space-y-1">
          {Object.entries(result.features)
            .filter(([k]) => ["winrate_diff", "h2h_shrunk", "sos_mapelo_diff", "overall_winrate_diff", "map_winrate_diff", "h2h_advantage"].includes(k))
            .map(([k, v]) => (
              <li key={k}>
                {k.replace(/_/g, " ")}: {typeof v === "number" ? (v as number).toFixed(3) : String(v)}
              </li>
            ))}
        </ul>
      )}

      <button className="text-sm underline" onClick={() => setShowDetails((s) => !s)}>
        {showDetails ? "Hide details" : "View details"}
      </button>

      {showDetails && (
        <div className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
          <div className="font-medium mb-1">Raw features</div>
          <pre>{JSON.stringify(result.features, null, 2)}</pre>
          <div className="font-medium mt-3 mb-1">Factor contributions</div>
          <pre>{JSON.stringify(result.factor_contrib, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}
