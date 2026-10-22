import { metricsHandler, respond } from "@/modern/lib/vlr/api";
import { loadVlrData } from "@/modern/lib/vlr/load";

/* GET /api/vlr/metrics: the split, held-out metrics per model (raw and Platt), baselines, and the data audit */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return respond(() => metricsHandler(loadVlrData()));
}
