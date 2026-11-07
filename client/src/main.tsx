import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { seedProfiles } from "./db/seed.ts";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

try {
  await seedProfiles();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (e) {
  console.error("Startup failed while opening the local database", e);
  root.render(
    <main className="p-6">
      <h1 className="text-xl font-bold">Mumu couldn't open its library</h1>
      <p className="mt-2 text-sm">{e instanceof Error ? e.message : String(e)}</p>
    </main>,
  );
}
