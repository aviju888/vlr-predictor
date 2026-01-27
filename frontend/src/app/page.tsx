import PredictForm from "@/components/PredictForm";

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      {/* Hero Section */}
      <div className="text-center pt-4">
        <h1 className="text-3xl font-bold">Match Predictions</h1>
        <p className="text-muted-foreground">Get ML-powered predictions for Valorant esports matches</p>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg border">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">64.3%</div>
          <div className="text-sm text-muted-foreground">Model Accuracy</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">353</div>
          <div className="text-sm text-muted-foreground">Total Predictions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">42</div>
          <div className="text-sm text-muted-foreground">VCT Teams</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">420ms</div>
          <div className="text-sm text-muted-foreground">Avg Response</div>
        </div>
      </div>

      {/* Model Information */}
      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-medium">
            🤖 Symmetric Realistic v1.0
          </div>
          <span className="text-sm text-muted-foreground">Production-ready ML model</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="font-bold text-blue-600">0.713</div>
            <div className="text-muted-foreground">F1 Score</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-green-600">87%</div>
            <div className="text-muted-foreground">Cache Hit</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-purple-600">0.256</div>
            <div className="text-muted-foreground">Brier Score</div>
          </div>
        </div>
      </div>

      {/* Prediction Form */}
      <PredictForm />

      {/* Features */}
      <div className="grid md:grid-cols-3 gap-6 pt-8">
        <div className="text-center p-4">
          <div className="text-2xl mb-2">🎯</div>
          <h3 className="font-semibold mb-2">Industry-Leading Accuracy</h3>
          <p className="text-sm text-muted-foreground">64.3% prediction accuracy with zero data leakage validation</p>
        </div>
        <div className="text-center p-4">
          <div className="text-2xl mb-2">⚡</div>
          <h3 className="font-semibold mb-2">Real-Time Performance</h3>
          <p className="text-sm text-muted-foreground">Sub-500ms response times with 87% cache efficiency</p>
        </div>
        <div className="text-center p-4">
          <div className="text-2xl mb-2">🌍</div>
          <h3 className="font-semibold mb-2">Complete VCT Coverage</h3>
          <p className="text-sm text-muted-foreground">All 42 franchised teams across Americas, EMEA, Pacific, China</p>
        </div>
      </div>
    </main>
  );
}
