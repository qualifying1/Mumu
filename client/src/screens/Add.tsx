import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import ProcessingPanel from "../components/ProcessingPanel.tsx";
import { db } from "../db/db.ts";
import { extractPages } from "../import/extract.ts";
import { importChapter } from "../import/importChapter.ts";
import { nextChapterNumber, titleFromFileName } from "../import/pages.ts";
import { dismissView, startProcessing, useProcessViews } from "../processing/manager.ts";
import { isBusy } from "../processing/steps.ts";

const NEW_SERIES = "__new__";

type Status = { kind: "idle" } | { kind: "working"; message: string } | { kind: "error"; message: string } | { kind: "done"; message: string };

export default function Add() {
  const series = useLiveQuery(() => db.series.orderBy("createdAt").toArray(), []);
  const chapters = useLiveQuery(() => db.chapters.toArray(), []);

  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [seriesChoice, setSeriesChoice] = useState<string>(NEW_SERIES);
  const [newTitle, setNewTitle] = useState("");
  const [numberOverride, setNumberOverride] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const views = useProcessViews();
  const processingBusy = [...views.values()].some((v) => isBusy(v));

  const defaultNumber = useMemo(() => {
    if (seriesChoice === NEW_SERIES) return 1;
    return nextChapterNumber((chapters ?? []).filter((c) => c.seriesId === seriesChoice).map((c) => c.number));
  }, [chapters, seriesChoice]);
  const chapterNumber = numberOverride ?? String(defaultNumber);

  function pickFiles(picked: FileList | null) {
    const list = picked ? [...picked] : [];
    setFiles(list);
    setStatus({ kind: "idle" });
    const first = list[0];
    if (first && seriesChoice === NEW_SERIES && newTitle === "") setNewTitle(titleFromFileName(first.name));
  }

  async function onImport() {
    try {
      setStatus({ kind: "working", message: "Mumu is unpacking the pages…" });
      const pages = await extractPages(files);
      const imported = await importChapter({
        series: seriesChoice === NEW_SERIES ? { kind: "new", title: newTitle } : { kind: "existing", seriesId: seriesChoice },
        chapterNumber: Number(chapterNumber),
        pages,
      });
      setStatus({ kind: "done", message: `Imported ${pages.length} pages.` });
      setFiles([]);
      setNumberOverride(null);
      if (fileInput.current) fileInput.current.value = "";
      await process(imported.chapterId);
    } catch (e) {
      console.error("Import failed", e);
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Start (or retry) processing. startProcessing reports its own failures in the panel; only "busy" throws. */
  async function process(chapterId: string) {
    try {
      await startProcessing(chapterId);
    } catch (e) {
      console.error("Could not start processing", e);
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const seriesById = new Map((series ?? []).map((s) => [s.id, s]));
  const sortedChapters = [...(chapters ?? [])].sort(
    (a, b) =>
      (seriesById.get(a.seriesId)?.title ?? "").localeCompare(seriesById.get(b.seriesId)?.title ?? "") || a.number - b.number,
  );
  const busy = status.kind === "working";

  return (
    <main className="mx-auto max-w-xl p-6 pb-24">
      <h1 className="text-2xl font-bold">Add a chapter</h1>

      <label className="mt-4 block text-sm font-bold" htmlFor="files">
        Chapter file (.cbz, .zip or images)
      </label>
      <input
        id="files"
        ref={fileInput}
        type="file"
        multiple
        accept=".cbz,.zip,image/*"
        className="mt-1 block min-h-[44px] w-full"
        onChange={(e) => pickFiles(e.target.files)}
      />
      {files.length > 0 && <p className="mt-1 text-sm opacity-70">{files.length === 1 ? files[0]!.name : `${files.length} files selected`}</p>}

      <label className="mt-4 block text-sm font-bold" htmlFor="series">
        Series
      </label>
      <select
        id="series"
        className="mt-1 min-h-[44px] w-full border-2 border-current bg-transparent px-2"
        value={seriesChoice}
        onChange={(e) => {
          setSeriesChoice(e.target.value);
          setNumberOverride(null);
        }}
      >
        <option value={NEW_SERIES}>＋ New series…</option>
        {(series ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      {seriesChoice === NEW_SERIES && (
        <input
          aria-label="New series name"
          placeholder="Series name"
          className="mt-2 min-h-[44px] w-full border-2 border-current bg-transparent px-2"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
      )}

      <label className="mt-4 block text-sm font-bold" htmlFor="number">
        Chapter number
      </label>
      <input
        id="number"
        type="number"
        min={1}
        step={1}
        className="mt-1 min-h-[44px] w-full border-2 border-current bg-transparent px-2"
        value={chapterNumber}
        onChange={(e) => setNumberOverride(e.target.value)}
      />

      <button
        type="button"
        disabled={busy || processingBusy || files.length === 0}
        onClick={onImport}
        className="mt-6 min-h-[44px] w-full border-2 border-current px-4 font-bold disabled:opacity-40"
      >
        {busy ? "Importing…" : "Import & process"}
      </button>

      {status.kind === "working" && <p className="mt-3 text-sm">{status.message}</p>}
      {status.kind === "done" && (
        <p role="status" className="mt-3 text-sm">
          {status.message}
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="mt-3 text-sm font-bold">
          {status.message}
        </p>
      )}

      {[...views.entries()].map(([chapterId, view]) => {
        const chapter = (chapters ?? []).find((c) => c.id === chapterId);
        const title = chapter ? `${seriesById.get(chapter.seriesId)?.title ?? "(unknown series)"} · Ch. ${chapter.number}` : "Chapter";
        return (
          <ProcessingPanel
            key={chapterId}
            title={title}
            view={view}
            readTo={`/read/${chapterId}`}
            retryDisabled={processingBusy}
            onRetry={() => void process(chapterId)}
            onDismiss={() => dismissView(chapterId)}
          />
        );
      })}

      <h2 className="mt-8 text-lg font-bold">Library</h2>
      {sortedChapters.length === 0 ? (
        <p className="mt-1 text-sm opacity-70">Nothing imported yet.</p>
      ) : (
        <ul data-testid="library" className="mt-2 space-y-1">
          {sortedChapters.map((c) => (
            <li key={c.id} data-testid="library-row" className="flex justify-between gap-2 border-b border-current/30 py-1 text-sm">
              <Link to={`/read/${c.id}`} className="underline">
                {seriesById.get(c.seriesId)?.title ?? "(unknown series)"} · Ch. {c.number}
              </Link>
              <span className="flex items-center gap-2 opacity-70">
                {c.pageCount} pages · {c.status}
                {!isBusy(views.get(c.id)) && c.status !== "ready" && (
                  <button
                    type="button"
                    disabled={processingBusy}
                    onClick={() => void process(c.id)}
                    className="pixel-frame min-h-11 bg-paper px-3 font-bold text-ink opacity-100 disabled:opacity-40"
                  >
                    {c.status === "imported" ? "Process" : "Retry"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
