// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET as predict } from "@/app/api/vlr/predict/route";
import { GET as series } from "@/app/api/vlr/series/route";
import { GET as metrics } from "@/app/api/vlr/metrics/route";

describe("historical HTTP route contracts", () => {
 it("serves computed map predictions and rejects unknown teams", async () => {
  const response=predict(new Request("http://localhost/api/vlr/predict?teamA=T1&teamB=Fnatic&map=Ascent"));
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
  const result=await response.json();expect(result).toHaveProperty("models");
  expect(predict(new Request("http://localhost/api/vlr/predict?teamA=unknown&teamB=T1&map=Ascent")).status).toBe(404);
 });
 it("serves a real series simulation and the labeled held-out dataset", async () => {
  expect(series(new Request("http://localhost/api/vlr/series?teamA=T1&teamB=Fnatic&bestOf=3")).status).toBe(200);
  const result=await metrics().json();expect(result.data_coverage).toMatchObject({from:"2025-02-20",to:"2025-06-22",maps:71,teams:14});
  expect(result.split.map((s:{role:string})=>s.role)).toEqual(["train","held_out"]);
 });
});
