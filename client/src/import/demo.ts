// Bundled demo: two voiced Pepper&Carrot chapters (built by scripts/build-demo.mjs into public/demo/).
// Loading one goes through the same loadPackageWithPages path as /dev, so it is stored exactly like a processed chapter.
import { extractPages } from "./extract.ts";
import { loadPackageWithPages } from "./loadPackage.ts";

interface DemoIndex {
  seriesTitle: string;
  chapters: { id: string; pages: string[] }[];
}

const base = () => `${import.meta.env.BASE_URL}demo/`;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}`);
  return res;
}

/** Download the demo chapters and store them in the library. Returns the id of the first chapter. */
export async function loadDemo(onProgress?: (message: string) => void): Promise<string> {
  const index = (await (await fetchOk(`${base()}index.json`)).json()) as DemoIndex;
  let first: string | null = null;
  for (const [i, ch] of index.chapters.entries()) {
    onProgress?.(`Mumu is fetching chapter ${i + 1} of ${index.chapters.length}…`);
    const json: unknown = await (await fetchOk(`${base()}${ch.id}.json`)).json();
    const files: File[] = [];
    for (const name of ch.pages) {
      files.push(new File([await (await fetchOk(`${base()}${ch.id}/${name}`)).blob()], name, { type: "image/jpeg" }));
    }
    const loaded = await loadPackageWithPages(json, await extractPages(files), index.seriesTitle);
    first ??= loaded.chapterId;
  }
  if (first === null) throw new Error("The demo has no chapters.");
  return first;
}
