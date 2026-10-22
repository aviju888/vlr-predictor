import { predictHandler, respond } from "@/modern/lib/vlr/api";
import { loadVlrData } from "@/modern/lib/vlr/load";

/* GET /api/vlr/predict?teamA=Paper%20Rex&teamB=Fnatic&map=Ascent[&model=blend|elo|lr][&calib=platt|raw][&date=YYYY-MM-DD] */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return respond(() => predictHandler(loadVlrData(), new URL(req.url).searchParams));
}
