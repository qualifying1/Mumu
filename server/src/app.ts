import { CONTRACT_VERSION, JobMetaSchema, PreviewRequestSchema, type ErrorBody, type Health, type Models, type VoiceProfile } from "@mumu/shared";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import sharp from "sharp";
import { startJob, type RunChapter } from "./jobs/runner.js";
import { JobStore } from "./jobs/store.js";

/** Upload limits. The client sends pages at most 800 px wide, so these are generous. */
export const MAX_PAGES = 300;
export const MAX_PAGE_BYTES = 15 * 1024 * 1024;

export interface AppDeps {
  corsOrigins: string[];
  /** Reported by `/health`. */
  models: Models;
  /** The one pipeline (`buildChapter`), already wired to its models, cache and Gemini adapters. */
  runChapter: RunChapter;
  /** One voice-preview clip as MP3 (TTS through the shared cache, then encode with the profile's speed and pitch). */
  previewClip: (profile: VoiceProfile, text: string) => Promise<Buffer>;
  store?: JobStore;
  log?: (line: string) => void;
}

/** An error with the HTTP status and the `{ error, detail? }` body the client will see. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

const body = (error: string, detail?: string): ErrorBody => (detail === undefined ? { error } : { error, detail });

function zodDetail(err: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.length > 0 ? i.path.map(String).join(".") : "(root)"}: ${i.message}`)
    .join("; ");
}

export function createApp(deps: AppDeps) {
  const store = deps.store ?? new JobStore();
  const log = deps.log ?? console.log;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PAGE_BYTES, files: MAX_PAGES } });

  const app = express();
  app.use(cors({ origin: deps.corsOrigins }));

  app.get("/health", (_req, res) => {
    const health: Health = { ok: true, contractVersion: CONTRACT_VERSION, models: deps.models };
    res.json(health);
  });

  app.post("/jobs", upload.array("pages", MAX_PAGES), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new HttpError(400, "No pages uploaded", 'Send the page images as multipart fields named "pages", in reading order.');

    const rawMeta = req.body?.meta;
    if (typeof rawMeta !== "string") throw new HttpError(400, "Missing meta", 'Send a "meta" field with JSON { seriesId, chapterId, cast, profiles }.');
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawMeta);
    } catch (err) {
      throw new HttpError(400, "meta is not valid JSON", (err as Error).message);
    }
    const parsed = JobMetaSchema.safeParse(parsedJson);
    if (!parsed.success) throw new HttpError(400, "meta does not match the contract", zodDetail(parsed.error));

    const pages = [];
    for (const [i, file] of files.entries()) {
      try {
        await sharp(file.buffer).metadata();
      } catch {
        throw new HttpError(400, `Page ${i + 1} is not a readable image`, `${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
      }
      pages.push({ bytes: file.buffer });
    }

    const jobId = store.create();
    void startJob(store, jobId, deps.runChapter, parsed.data, pages, log);
    res.status(202).json({ jobId });
  });

  app.get("/jobs/:id", (req, res) => {
    const status = store.status(req.params.id);
    if (!status) throw new HttpError(404, "Unknown or expired job", req.params.id);
    res.json(status);
  });

  app.get("/jobs/:id/package", (req, res) => {
    const found = store.lookupPackage(req.params.id);
    if (found.kind === "missing") throw new HttpError(404, "Unknown or expired job", req.params.id);
    if (found.kind === "pending") {
      const { state, error } = found.status;
      throw new HttpError(409, "The job is not done", error ? `state: ${state}; ${error}` : `state: ${state}`);
    }
    res.json(found.pkg);
  });

  app.post("/preview", express.json({ limit: "100kb" }), async (req, res) => {
    const parsed = PreviewRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Invalid preview request", zodDetail(parsed.error));
    let mp3: Buffer;
    try {
      mp3 = await deps.previewClip(parsed.data.profile, parsed.data.text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`preview ${parsed.data.profile.id} failed: ${message}`);
      throw new HttpError(502, "Voice preview failed", message);
    }
    res.type("audio/mpeg").send(mp3);
  });

  app.use((req, _res, next) => next(new HttpError(404, "Not found", `${req.method} ${req.path}`)));

  const onError: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json(body(err.message, err.detail));
    } else if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).json(body(`Upload rejected: ${err.message}`, err.field));
    } else if (typeof (err as { status?: unknown })?.status === "number" && (err as { status: number }).status < 500) {
      // body-parser failures (malformed or too-large JSON) carry their own 4xx status
      res.status((err as { status: number }).status).json(body("Bad request", (err as Error).message));
    } else {
      const message = err instanceof Error ? err.message : String(err);
      log(`unhandled error: ${err instanceof Error ? (err.stack ?? message) : message}`);
      res.status(500).json(body("Internal server error", message));
    }
  };
  app.use(onError);

  return app;
}
