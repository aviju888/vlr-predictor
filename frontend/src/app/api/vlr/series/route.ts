import { respond, seriesHandler } from "@/modern/lib/vlr/api";
import { loadVlrData } from "@/modern/lib/vlr/load";

/* GET /api/vlr/series?teamA=T1&teamB=G2&bestOf=3|5[&model=blend|elo|lr][&calib=platt|raw][&date=YYYY-MM-DD] */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return respond(() => seriesHandler(loadVlrData(), new URL(req.url).searchParams));
}
