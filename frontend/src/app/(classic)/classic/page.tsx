import PredictForm from "@/components/PredictForm";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Match Predictions</h1>
        <p className="text-sm text-muted-foreground">
          ML-powered predictions for Valorant esports
        </p>
      </div>

      <PredictForm />
    </main>
  );
}
