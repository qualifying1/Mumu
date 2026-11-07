import { useRef, useState } from "react";
import { Link } from "react-router";
import { extractPages } from "../import/extract.ts";
import { loadPackageWithPages, type LoadedPackage } from "../import/loadPackage.ts";
import { titleFromFileName } from "../import/pages.ts";

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string }
  | { kind: "done"; loaded: LoadedPackage };

export default function Dev() {
  const jsonInput = useRef<HTMLInputElement>(null);
  const pagesInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function run(load: () => Promise<LoadedPackage>) {
    setStatus({ kind: "working" });
    try {
      setStatus({ kind: "done", loaded: await load() });
    } catch (e) {
      console.error("Dev load failed", e);
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function loadPicked() {
    const jsonFile = jsonInput.current?.files?.[0];
    const pageFiles = [...(pagesInput.current?.files ?? [])];
    if (!jsonFile) throw new Error("Pick a package .json first.");
    const json: unknown = JSON.parse(await jsonFile.text());
    return loadPackageWithPages(json, await extractPages(pageFiles), `Dev: ${titleFromFileName(jsonFile.name)}`);
  }

  return (
    <main className="mx-auto max-w-xl p-6 pb-24">
      <h1 className="text-2xl font-bold">Dev</h1>
      <p className="text-sm opacity-70">Developer tools. Not part of the app.</p>

      <h2 className="mt-6 text-lg font-bold">Load a chapter package</h2>
      <p className="text-sm opacity-70">
        A package JSON (<code>fixtures/sample.json</code> or <code>fixtures/out/ch1.json</code>) plus the page images or CBZ it was made from. Goes
        through the same <code>storePackage</code> as the processing flow.
      </p>

      <label className="mt-3 block text-sm font-bold" htmlFor="pkg">
        Package .json
      </label>
      <input id="pkg" ref={jsonInput} type="file" accept=".json,application/json" className="mt-1 block min-h-[44px] w-full" />

      <label className="mt-3 block text-sm font-bold" htmlFor="pgs">
        Pages (images or .cbz/.zip)
      </label>
      <input id="pgs" ref={pagesInput} type="file" multiple accept=".cbz,.zip,image/*" className="mt-1 block min-h-[44px] w-full" />

      <button
        type="button"
        disabled={status.kind === "working"}
        onClick={() => void run(loadPicked)}
        className="mt-4 min-h-[44px] w-full border-2 border-current px-4 font-bold disabled:opacity-40"
      >
        Load package
      </button>

      {import.meta.env.DEV && (
        <button
          type="button"
          data-testid="load-sample"
          disabled={status.kind === "working"}
          onClick={() =>
            void run(async () => {
              const { loadBuiltInSample } = await import("./devFixtures.ts");
              return loadBuiltInSample();
            })
          }
          className="mt-2 min-h-[44px] w-full border-2 border-current px-4 font-bold disabled:opacity-40"
        >
          Load built-in sample (dev server only)
        </button>
      )}

      {status.kind === "working" && <p className="mt-3 text-sm">Loading…</p>}
      {status.kind === "error" && (
        <p role="alert" className="mt-3 text-sm font-bold">
          {status.message}
        </p>
      )}
      {status.kind === "done" && (
        <p role="status" data-testid="dev-done" className="mt-3 text-sm">
          Stored {status.loaded.pageCount} pages and the package.{" "}
          <Link to={`/read/${status.loaded.chapterId}`} className="font-bold underline">
            Open in the reader
          </Link>
        </p>
      )}

      <h2 className="mt-8 text-lg font-bold">Other</h2>
      <ul className="mt-2 list-disc pl-6">
        <li>
          <Link to="/dev/mumu" className="underline">
            MumuLab
          </Link>
        </li>
      </ul>
    </main>
  );
}
