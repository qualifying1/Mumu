import type { ReactNode } from "react";

export default function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="p-6 pb-20">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm opacity-70">Placeholder screen (filled in by a later milestone).</p>
      {children}
    </main>
  );
}
