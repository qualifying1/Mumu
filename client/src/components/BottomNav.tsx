import { NavLink } from "react-router";

const TABS = [
  { to: "/", label: "Search", icon: "🔍", end: true },
  { to: "/add", label: "Add", icon: "＋", end: false },
  { to: "/voices", label: "Voices", icon: "🎙", end: false },
  { to: "/profile", label: "Profile", icon: "👤", end: false },
] as const;

/** Bottom nav on every screen except the reader. Carries data-mumu-avoid (CONTRACT §10). 64 px tall: Home sizes itself around it. */
export default function BottomNav() {
  return (
    <nav data-mumu-avoid className="fixed inset-x-0 bottom-0 flex h-16 border-t-4 border-wood-dark bg-paper text-ink">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `flex min-h-11 flex-1 flex-col items-center justify-center text-sm ${isActive ? "pixel-bounce bg-accent font-bold text-on-accent" : ""}`
          }
        >
          <span aria-hidden>{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
