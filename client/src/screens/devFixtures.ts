// Dev-server only (Dev.tsx imports this behind `import.meta.env.DEV`, so it is dropped from production builds).
// Loads the hand-written fixtures/sample.json and the three ch1 pages it was written for.
import sampleUrl from "../../../fixtures/sample.json?url";
import { extractPages } from "../import/extract.ts";
import { loadPackageWithPages, type LoadedPackage } from "../import/loadPackage.ts";

const pageUrls = import.meta.glob("../../../fixtures/ch1/00[123].jpg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}`);
  return res;
}

export async function loadBuiltInSample(): Promise<LoadedPackage> {
  const entries = Object.entries(pageUrls);
  if (entries.length !== 3) throw new Error(`Expected 3 sample pages (fixtures/ch1/001–003.jpg), found ${entries.length}.`);
  const json: unknown = await (await fetchOk(sampleUrl)).json();
  const files: File[] = [];
  for (const [path, url] of entries) {
    const name = path.split("/").pop()!;
    files.push(new File([await (await fetchOk(url)).blob()], name, { type: "image/jpeg" }));
  }
  return loadPackageWithPages(json, await extractPages(files), "Sample (Pepper&Carrot)");
}
