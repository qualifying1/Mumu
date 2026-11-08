// Build the bundled demo (client/public/demo/) from fixtures/: downscaled pages, the voiced packages
// (fixtures/out/ch1.json, ch2.json from `npm run fixture`) and importable CBZs.
//   node scripts/build-demo.mjs
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "client", "public", "demo");
const chapters = ["ch1", "ch2"];
const index = { seriesTitle: "Pepper&Carrot", chapters: [] };

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const ch of chapters) {
  const pkgFile = path.join(root, "fixtures", "out", `${ch}.json`);
  const pkg = JSON.parse(await readFile(pkgFile, "utf8"));
  if (pkg.chapterId !== ch) throw new Error(`${pkgFile}: chapterId is ${pkg.chapterId}, expected ${ch}`);
  const srcDir = path.join(root, "fixtures", ch);
  const files = (await readdir(srcDir)).filter((f) => /\.jpe?g$/i.test(f)).sort();
  await mkdir(path.join(out, ch), { recursive: true });
  const zip = new JSZip();
  for (const f of files) {
    const bytes = await sharp(path.join(srcDir, f)).resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    await writeFile(path.join(out, ch, f), bytes);
    zip.file(f, bytes);
  }
  await writeFile(path.join(out, `${ch}.json`), JSON.stringify(pkg));
  await writeFile(path.join(out, `pepper-carrot-${ch}.cbz`), await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }));
  index.chapters.push({ id: ch, pages: files });
  console.log(`${ch}: ${files.length} pages, ${pkg.cues.length} cues, ${pkg.audio.length} clips`);
}
await writeFile(path.join(out, "index.json"), JSON.stringify(index, null, 2));
