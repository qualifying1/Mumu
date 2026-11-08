// Home / Search tab (F5): bookshelf on top, coffee desk with a preview-card carousel below.
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import PixelCover from "../components/PixelCover.tsx";
import { db } from "../db/db.ts";
import { buildShelf, filterShelf, indexFromScroll, type ShelfEntry } from "../home/homeModel.ts";

/** Gap between desk cards in px; the carousel stride is card width + this. */
const CARD_GAP = 16;
/** After a tap on a book, ignore scroll events from the smooth scroll this long so the highlight doesn't flicker. */
const PROGRAMMATIC_SCROLL_MS = 600;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="pixel-frame relative mx-auto mt-6 w-fit max-w-[80%] bg-paper px-4 py-2 text-center text-ink">
      {children}
      <span aria-hidden className="absolute -bottom-3 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-ink" />
    </p>
  );
}

function DeskProps() {
  // Tiny pixel mug and lamp, drawn as crisp SVG rects in palette colors.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-1 flex items-end justify-between px-6">
      <svg width="36" height="36" viewBox="0 0 12 12" shapeRendering="crispEdges">
        <rect x="2" y="5" width="6" height="6" className="fill-paper" />
        <rect x="8" y="6" width="2" height="3" className="fill-paper" />
        <rect x="3" y="6" width="4" height="1" className="fill-wood-dark" />
        <rect x="3" y="2" width="1" height="2" className="fill-ink-muted" />
        <rect x="5" y="1" width="1" height="3" className="fill-ink-muted" />
      </svg>
      <svg width="36" height="54" viewBox="0 0 12 18" shapeRendering="crispEdges">
        <rect x="2" y="1" width="8" height="5" className="fill-glow" />
        <rect x="5" y="6" width="2" height="9" className="fill-wood-dark" />
        <rect x="2" y="15" width="8" height="2" className="fill-wood-dark" />
      </svg>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const cells = 10;
  const filled = Math.round(value * cells);
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className="flex gap-0.5">
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={`h-2 flex-1 ${i < filled ? "bg-accent" : "bg-ink-muted/30"}`} />
      ))}
    </div>
  );
}

export default function Home() {
  const series = useLiveQuery(() => db.series.toArray(), []);
  const chapters = useLiveQuery(() => db.chapters.toArray(), []);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const shelf = useMemo(() => (series && chapters ? buildShelf(series, chapters) : []), [series, chapters]);
  const visible = useMemo(() => filterShelf(shelf, query), [shelf, query]);

  // Cover blobs for the visible series (first page of the chapter that was imported first).
  const coverIds = visible.map((e) => e.series.coverPageId).filter((id): id is string => id !== null);
  const covers = useLiveQuery(
    async () => {
      const rows = await db.pages.bulkGet(coverIds);
      return new Map(rows.flatMap((r) => (r ? [[r.id, r.blob] as const] : [])));
    },
    [coverIds.join("|")],
  );

  const bigScreen = useMediaQuery("(min-width: 768px) and (min-height: 800px)");
  const deskScale = bigScreen ? 3 : 2;

  const shelfRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const programmaticUntil = useRef(0);

  const activeIndex = Math.max(0, visible.findIndex((e) => e.series.id === activeId));
  const activeSeriesId = visible[activeIndex]?.series.id ?? null;

  const stride = useCallback((): number => {
    const first = carouselRef.current?.children[0] as HTMLElement | undefined;
    return first ? first.offsetWidth + CARD_GAP : 0;
  }, []);

  /** Scroll the shelf so the given book is centred (horizontal only, never the page). */
  const centreBook = useCallback((seriesId: string) => {
    const box = shelfRef.current;
    const book = box?.querySelector<HTMLElement>(`[data-book="${CSS.escape(seriesId)}"]`);
    if (!box || !book) return;
    box.scrollTo({ left: book.offsetLeft - (box.clientWidth - book.offsetWidth) / 2, behavior: "smooth" });
  }, []);

  // Tap a book → carousel scrolls to its card.
  function onPickBook(index: number, entry: ShelfEntry) {
    setActiveId(entry.series.id);
    programmaticUntil.current = performance.now() + PROGRAMMATIC_SCROLL_MS;
    carouselRef.current?.scrollTo({ left: index * stride(), behavior: "smooth" });
  }

  // Swipe the desk → highlight (and scroll to) the matching book.
  const onCarouselScroll = useCallback(() => {
    if (performance.now() < programmaticUntil.current) return;
    const box = carouselRef.current;
    if (!box) return;
    const entry = visible[indexFromScroll(box.scrollLeft, stride(), visible.length)];
    if (entry && entry.series.id !== activeId) {
      setActiveId(entry.series.id);
      centreBook(entry.series.id);
    }
  }, [visible, activeId, stride, centreBook]);

  // Search changed the list: if the highlighted series dropped out, snap back to the first card.
  useEffect(() => {
    if (activeId !== null && activeSeriesId !== activeId) {
      setActiveId(activeSeriesId);
      carouselRef.current?.scrollTo({ left: 0 });
    }
  }, [activeId, activeSeriesId]);

  const loading = series === undefined || chapters === undefined;
  const noStories = !loading && shelf.length === 0;
  const noMatch = !loading && shelf.length > 0 && visible.length === 0;

  return (
    <main className="flex h-dvh flex-col pb-16">
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-3">
        <label htmlFor="search" className="sr-only">
          Search your stories
        </label>
        <input
          id="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your stories…"
          className="pixel-frame mx-1 block min-h-11 w-[calc(100%-0.5rem)] bg-paper px-3 text-ink placeholder:text-ink-muted"
        />
      </div>

      {/* Bookshelf: ~45% */}
      <section aria-label="Bookshelf" data-testid="shelf" className="flex min-h-0 flex-[45] flex-col bg-wall-dark">
        <div ref={shelfRef} className="flex min-h-0 flex-1 items-end gap-4 overflow-x-auto px-6 pt-3 pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visible.map((entry, i) => {
            const active = entry.series.id === activeSeriesId;
            return (
              <button
                key={entry.series.id}
                type="button"
                data-book={entry.series.id}
                data-active={active}
                aria-label={`${entry.series.title}${active ? " (selected)" : ""}`}
                aria-pressed={active}
                onClick={() => onPickBook(i, entry)}
                className={`pixel-frame relative shrink-0 cursor-pointer ${active ? "-translate-y-1 [--frame:var(--color-accent)]" : ""}`}
              >
                <PixelCover blob={covers?.get(entry.series.coverPageId ?? "") ?? null} scale={2} label={`${entry.series.title} cover`} />
              </button>
            );
          })}
        </div>
        {/* The plank Mumu can hang from (bottom edge). */}
        <div data-mumu-ledge className="h-5 shrink-0 border-t-4 border-wood-dark bg-wood-light" aria-hidden />
      </section>

      {/* Coffee desk: ~55% */}
      <section aria-label="Coffee desk" data-testid="desk" className="relative flex min-h-0 flex-[55] flex-col bg-wood-dark">
        <div data-mumu-floor className="relative h-16 shrink-0 border-t-4 border-wood-dark bg-wood-light" aria-hidden>
          <DeskProps />
        </div>

        {noStories && <Bubble>Add your first story!</Bubble>}
        {noMatch && (
          <Bubble>
            Nothing matches “{query.trim()}” <span aria-hidden>❓</span>
          </Bubble>
        )}

        <div
          ref={carouselRef}
          onScroll={onCarouselScroll}
          data-testid="carousel"
          className="flex min-h-0 flex-1 snap-x snap-mandatory items-center overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [--card-w:min(86vw,22rem)] md:[--card-w:34rem]"
          style={{ gap: CARD_GAP, paddingInline: "calc(50% - var(--card-w) / 2)" }}
        >
          {visible.map((entry) => (
            <article
              key={entry.series.id}
              data-testid="desk-card"
              data-series={entry.series.id}
              className="pixel-frame flex shrink-0 snap-center gap-4 bg-paper p-3 text-ink"
              style={{ width: "var(--card-w)" }}
            >
              <PixelCover
                blob={covers?.get(entry.series.coverPageId ?? "") ?? null}
                scale={deskScale}
                label={`${entry.series.title} cover`}
                className="shrink-0"
              />
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <h2 className="font-title text-xs leading-relaxed break-words">{entry.series.title}</h2>
                  {entry.chapter ? (
                    <p className="mt-2 text-ink-muted">
                      Ch. {entry.chapter.number} · {entry.minutesLeft} min left
                    </p>
                  ) : (
                    <p className="mt-2 text-ink-muted">No chapters yet</p>
                  )}
                  {entry.chapter && <div className="mt-2"><ProgressBar value={entry.progress} /></div>}
                  {entry.chapter?.status === "ready" && (
                    <span className="mt-2 inline-block bg-accent px-2 text-on-accent">♪ Audio ready</span>
                  )}
                </div>
                {entry.chapter ? (
                  <Link
                    to={`/read/${entry.chapter.id}`}
                    className="pixel-frame mx-1 mt-2 flex min-h-11 items-center justify-center bg-accent px-3 font-bold text-on-accent [--frame:var(--color-ink)]"
                  >
                    Read
                  </Link>
                ) : (
                  <Link to="/add" className="pixel-frame mx-1 mt-2 flex min-h-11 items-center justify-center bg-paper px-3 font-bold">
                    Add a chapter
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
