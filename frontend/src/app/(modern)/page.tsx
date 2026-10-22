import type { Metadata } from "next";
import { VlrApp } from "@/modern/components/vlr/VlrApp";
import { loadVlrData } from "@/modern/lib/vlr/load";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "VLR Predictor", description: "Explore historical VCT 2025 Masters matchups, three prediction models, series simulation and held-out calibration." };
export default function Page() { return <VlrApp data={loadVlrData()} />; }
