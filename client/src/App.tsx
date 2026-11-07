import { useEffect, useState } from "react";

type Health = { status: "loading" } | { status: "ok" } | { status: "error"; message: string };

export default function App() {
  const [health, setHealth] = useState<Health>({ status: "loading" });

  useEffect(() => {
    const url = import.meta.env.VITE_API_URL;
    if (!url) {
      setHealth({ status: "error", message: "VITE_API_URL is not set (copy client/.env.example to client/.env)" });
      return;
    }
    fetch(`${url}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: { ok?: boolean }) =>
        setHealth(body.ok ? { status: "ok" } : { status: "error", message: "unexpected /health body" }),
      )
      .catch((e: unknown) => setHealth({ status: "error", message: String(e) }));
  }, []);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Mumu</h1>
      <p data-testid="health">
        /health: {health.status === "error" ? `error — ${health.message}` : health.status}
      </p>
    </main>
  );
}
