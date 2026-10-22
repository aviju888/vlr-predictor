import { beforeEach, describe, expect, it } from "vitest";
import { clearHistory, deletePrediction, exportHistory, getHistory, savePrediction } from "./prediction-history";

const fixture = { id: "owned-classic-fixture", timestamp: 1760000000000, teamA: "T1", teamB: "Fnatic", map: "Ascent", probA: .6, probB: .4, winner: "T1", confidence: .6, model: "owned-test" };
beforeEach(() => localStorage.clear());
describe("Classic saved history compatibility", () => {
 it("reads existing browser history and preserves it when a new prediction is saved", () => {
  localStorage.setItem("vlr-prediction-history", JSON.stringify([fixture]));
  localStorage.setItem("vlr-modern:theme", "dark");
  const saved = savePrediction(fixture);
  expect(getHistory()).toEqual([saved, fixture]);
  expect(JSON.parse(exportHistory())).toEqual([saved,fixture]);
  expect(localStorage.getItem("vlr-modern:theme")).toBe("dark");
  deletePrediction(saved.id);
  expect(getHistory()).toEqual([fixture]);
  clearHistory();expect(getHistory()).toEqual([]);
 });
 it("keeps the existing 100-prediction bound", () => {
  localStorage.setItem("vlr-prediction-history", JSON.stringify(Array.from({length:100}, (_,i)=>({...fixture,id:`owned-${i}`}))));
  savePrediction(fixture);expect(getHistory()).toHaveLength(100);expect(getHistory().at(-1)?.id).toBe("owned-98");
 });
});
