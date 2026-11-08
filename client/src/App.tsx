import { useEffect, useState } from "react";
import { BrowserRouter, Outlet, Route, Routes, useLocation } from "react-router";
import BottomNav from "./components/BottomNav.tsx";
import MumuLayer from "./mumu/MumuLayer.tsx";
import MumuLab from "./mumu/MumuLab.tsx";
import Add from "./screens/Add.tsx";
import Dev from "./screens/Dev.tsx";
import Home from "./screens/Home.tsx";
import Profile from "./screens/Profile.tsx";
import Reader from "./screens/Reader.tsx";
import Voices from "./screens/Voices.tsx";

type Health = { status: "loading" } | { status: "ok" } | { status: "error"; message: string };

function useHealth(): Health {
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
  return health;
}

/** Tab screens share the bottom nav; the reader and /dev routes do not. */
function TabLayout() {
  const health = useHealth();
  const { pathname } = useLocation();
  return (
    <>
      <Outlet />
      {/* Home fills the screen exactly, so the M0 health line lives on the Add tab (dev only). */}
      {import.meta.env.DEV && pathname === "/add" && (
        <p data-testid="health" className="px-6 text-xs opacity-60">
          /health: {health.status === "error" ? `error — ${health.message}` : health.status}
        </p>
      )}
      <BottomNav />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<TabLayout />}>
          <Route index element={<Home />} />
          <Route path="add" element={<Add />} />
          <Route path="voices" element={<Voices />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="read/:chapterId" element={<Reader />} />
        <Route path="dev" element={<Dev />} />
        <Route path="dev/mumu" element={<MumuLab />} />
      </Routes>
      {/* Mounted once in the app root (CONTRACT §10). */}
      <MumuLayer />
    </BrowserRouter>
  );
}
