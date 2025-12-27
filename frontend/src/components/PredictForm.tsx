"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { predictMap, predictMapLive, fetchTeams, MapPredictResponse, predictSeries, fetchModelInfo, SeriesPredictResponse } from "@/lib/api";
import MapResultCard from "@/components/MapResultCard";
import SeriesResultCard from "@/components/SeriesResultCard";

const MAPS = ["Ascent","Bind","Breeze","Fracture","Haven","Icebox","Lotus","Pearl","Split","Sunset"];

export default function PredictForm() {
  const [teams, setTeams] = useState<string[]>([]);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [mapName, setMapName] = useState<string | undefined>("Ascent");
  const [model, setModel] = useState<"calibrated" | "elo" | "live">("calibrated");
  const [showSugA, setShowSugA] = useState(false);
  const [showSugB, setShowSugB] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MapPredictResponse | null>(null);
  const [seriesResult, setSeriesResult] = useState<SeriesPredictResponse | null>(null);
  const [perMapRows, setPerMapRows] = useState<{ map: string; probA: number; probB: number }[] | null>(null);
  const [modelInfo, setModelInfo] = useState<any | null>(null);

  useEffect(() => {
    fetchTeams().then(setTeams).catch(() => setTeams([]));
  }, []);

  async function onPredict() {
    setLoading(true);
    setError(null);
    setResult(null);
    setSeriesResult(null);
    setPerMapRows(null);
    try {
      const data = await (model === "live" ? predictMapLive({ teamA, teamB, map_name: mapName }) : predictMap({ teamA, teamB, map_name: mapName }));
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  async function onPerMap() {
    setLoading(true);
    setError(null);
    setPerMapRows(null);
    setSeriesResult(null);
    try {
      const rows: { map: string; probA: number; probB: number }[] = [];
      for (const m of MAPS) {
        const d = await (model === "live" ? predictMapLive({ teamA, teamB, map_name: m }) : predictMap({ teamA, teamB, map_name: m }));
        rows.push({ map: m, probA: d.prob_teamA, probB: d.prob_teamB });
      }
      setPerMapRows(rows);
    } catch (e: any) {
      setError(e?.message || "Per-map fetch failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSeries() {
    setLoading(true);
    setError(null);
    setSeriesResult(null);
    setPerMapRows(null);
    try {
      const s = await predictSeries(teamA, teamB, 3);
      setSeriesResult(s);
    } catch (e: any) {
      setError(e?.message || "Series prediction failed");
    } finally {
      setLoading(false);
    }
  }

  async function onCopyJSON() {
    try {
      const payload = {
        teamA,
        teamB,
        map: mapName,
        model,
        map_result: result,
        per_map: perMapRows,
        series_result: seriesResult,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {}
  }

  function onDownloadCSV() {
    const rows = perMapRows || (result && mapName ? [{ map: mapName, probA: result.prob_teamA, probB: result.prob_teamB }] : []);
    if (!rows || rows.length === 0) return;
    const header = "map,prob_teamA,prob_teamB\n";
    const body = rows.map(r => `${r.map},${r.probA},${r.probB}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${teamA}_vs_${teamB}_per_map.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onModelInfo() {
    try {
      const info = await fetchModelInfo();
      setModelInfo(info);
    } catch (e) {
      // ignore
    }
  }

  const probA = result?.prob_teamA ?? null;
  const probB = result?.prob_teamB ?? null;
  const winner = useMemo(() => {
    if (probA == null || probB == null) return null;
    return probA >= probB ? teamA : teamB;
  }, [probA, probB, teamA, teamB]);

  const filteredA = useMemo(() => {
    const q = teamA.trim().toLowerCase();
    const list = q ? teams.filter(t => t.toLowerCase().includes(q)) : teams;
    return list.slice(0, 12);
  }, [teams, teamA]);

  const filteredB = useMemo(() => {
    const q = teamB.trim().toLowerCase();
    const list = q ? teams.filter(t => t.toLowerCase().includes(q)) : teams;
    return list.slice(0, 12);
  }, [teams, teamB]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="relative">
          <Label>Team A</Label>
          <Input
            value={teamA}
            onChange={(e) => { setTeamA(e.target.value); setShowSugA(true); }}
            onFocus={() => setShowSugA(true)}
            onBlur={() => setTimeout(() => setShowSugA(false), 120)}
            placeholder="Type or pick a team"
          />
          {showSugA && filteredA.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-background shadow">
              {filteredA.map((t) => (
                <button
                  type="button"
                  key={t}
                  className="block w-full px-3 py-2 text-left hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setTeamA(t); setShowSugA(false); }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <Label>Team B</Label>
          <Input
            value={teamB}
            onChange={(e) => { setTeamB(e.target.value); setShowSugB(true); }}
            onFocus={() => setShowSugB(true)}
            onBlur={() => setTimeout(() => setShowSugB(false), 120)}
            placeholder="Type or pick a team"
          />
          {showSugB && filteredB.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-background shadow">
              {filteredB.map((t) => (
                <button
                  type="button"
                  key={t}
                  className="block w-full px-3 py-2 text-left hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setTeamB(t); setShowSugB(false); }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label>Map</Label>
          <Select value={mapName} onValueChange={(v) => setMapName(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a map" />
            </SelectTrigger>
            <SelectContent>
              {MAPS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Model</Label>
          <Select value={model} onValueChange={(v: any) => setModel(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calibrated">Calibrated (LR)</SelectItem>
              <SelectItem value="elo">Elo baseline</SelectItem>
              <SelectItem value="live">Live (365d)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!teamA || !teamB || loading} onClick={onPredict}>
          {loading ? "Predicting..." : "Predict Map"}
        </Button>
        <Button variant="secondary" disabled={!teamA || !teamB || loading} onClick={onPerMap}>
          {loading ? "…" : "Per-map table"}
        </Button>
        <Button variant="secondary" disabled={!teamA || !teamB || loading} onClick={onSeries}>
          {loading ? "…" : "Simulate BO3"}
        </Button>
        <Button variant="outline" disabled={loading} onClick={onCopyJSON}>Copy JSON</Button>
        <Button variant="outline" disabled={loading} onClick={onDownloadCSV}>Download CSV</Button>
        <Button variant="ghost" disabled={loading} onClick={onModelInfo}>Model info</Button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {result && <MapResultCard teamA={teamA} teamB={teamB} result={result} />}

      {perMapRows && (
        <div className="rounded-lg border p-3">
          <div className="font-medium mb-2">Per-map probabilities</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-1 pr-3">Map</th>
                  <th className="py-1 pr-3">{teamA} %</th>
                  <th className="py-1 pr-3">{teamB} %</th>
                </tr>
              </thead>
              <tbody>
                {perMapRows.map((r) => (
                  <tr key={r.map} className="border-t">
                    <td className="py-1 pr-3">{r.map}</td>
                    <td className="py-1 pr-3">{(r.probA * 100).toFixed(1)}%</td>
                    <td className="py-1 pr-3">{(r.probB * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {seriesResult && <SeriesResultCard data={seriesResult} />}

      {modelInfo && (
        <div className="rounded-lg border p-3 text-xs">
          <div className="font-medium mb-1">Model info</div>
          <pre className="overflow-x-auto">{JSON.stringify(modelInfo, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
