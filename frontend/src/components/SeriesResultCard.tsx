import { Card } from "@/components/ui/card";
import type { SeriesPredictResponse } from "@/lib/api";

export default function SeriesResultCard({
  data,
}: {
  data: SeriesPredictResponse;
}) {
  const h = data.headline;
  return (
    <Card className="p-4 space-y-3">
      <div className="text-xl font-semibold">
        {data.teamA} {(h.prob_teamA * 100).toFixed(0)}% over {data.teamB} ({data.format})
      </div>
      <div className="text-sm text-muted-foreground">
        Most likely maps: {h.maps.join(" • ")}
      </div>
      <div className="text-sm">
        Breakdown: 2–0: {(Math.max(0, Math.pow(h.prob_teamA, 2)) * 100).toFixed(0)}% · 2–1: {((h.prob_teamA - Math.pow(h.prob_teamA, 2)) * 100).toFixed(0)}%
      </div>

      {data.alternatives?.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm font-medium mt-2">Other plausible combos</div>
          {data.alternatives.slice(0, 3).map((c, i) => (
            <div key={i} className="text-sm">
              {(c.prob_teamA * 100).toFixed(0)}% — {c.maps.join(" • ")}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


