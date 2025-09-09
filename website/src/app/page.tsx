import PredictForm from "@/components/PredictForm";

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">VLR Predictor</h1>
        <p className="text-sm text-muted-foreground">Valorant Esports Analysis & Match Predictions</p>
      </div>
      <PredictForm />
    </main>
  );
}
