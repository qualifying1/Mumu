import { NavLink } from "react-router";

const TABS = [
  { to: "/", label: "Search", icon: "🔍", end: true },
  { to: "/add", label: "Add", icon: "＋", end: false },
  { to: "/voices", label: "Voices", icon: "🎙", end: false },
  { to: "/profile", label: "Profile", icon: "👤", end: false },
] as const;

/** Bottom nav on every screen except the reader. Carries data-mumu-avoid (CONTRACT §10). */
export default function BottomNav() {
  return (
    <nav data-mumu-avoid className="fixed inset-x-0 bottom-0 flex border-t-2 border-current bg-white dark:bg-black">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `flex min-h-[44px] flex-1 flex-col items-center justify-center py-1 text-sm ${isActive ? "font-bold underline" : ""}`
          }
        >
          <span aria-hidden>{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
