// Typed client for the server API (CONTRACT §4). Every response is validated with the `shared` zod schemas, and
// every failure is thrown as an ApiError carrying the server's `{ error, detail }` text. No silent fallbacks.
import {
  CreateJobResponseSchema,
  ErrorBodySchema,
  JobStatusSchema,
  type ErrorBody,
  type JobMeta,
  type JobStatus,
  type VoiceProfile,
} from "@mumu/shared";

export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached at all. */
  readonly status: number;
  readonly detail: string | undefined;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClient {
  createJob(pages: readonly Blob[], meta: JobMeta, signal?: AbortSignal): Promise<string>;
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobStatus>;
  /** The raw package JSON. It is validated by `storePackage`, the single place that stores it. */
  getPackage(jobId: string, signal?: AbortSignal): Promise<unknown>;
  /** One short clip (audio/mpeg) in the profile's voice, speed and pitch. */
  previewVoice(profile: VoiceProfile, text: string, signal?: AbortSignal): Promise<Blob>;
}

function parseErrorBody(text: string): ErrorBody | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.warn("[api] error body is not JSON", e);
    return null;
  }
  const result = ErrorBodySchema.safeParse(json);
  return result.success ? result.data : null;
}

async function toApiError(res: Response, what: string): Promise<ApiError> {
  let text = "";
  try {
    text = await res.text();
  } catch (e) {
    console.error(`[api] could not read the error body of ${what}`, e);
  }
  const parsed = parseErrorBody(text);
  if (parsed) return new ApiError(parsed.error, res.status, parsed.detail);
  // Not the contract's error shape (e.g. a proxy's HTML page): report the status and a short snippet.
  const snippet = text.slice(0, 200);
  return new ApiError(`${what} failed with HTTP ${res.status}`, res.status, snippet || undefined);
}

export function createApiClient(baseUrl: string, fetchFn: FetchFn = (i, init) => fetch(i, init)): ApiClient {
  if (!baseUrl) throw new Error("VITE_API_URL is not set (copy client/.env.example to client/.env).");
  const base = baseUrl.replace(/\/+$/, "");

  async function request(path: string, what: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(`${base}${path}`, init);
    } catch (e) {
      if (init.signal?.aborted) throw e;
      throw new ApiError(`Can't reach the server at ${base}. Is it running?`, 0, e instanceof Error ? e.message : String(e));
    }
    if (!res.ok) throw await toApiError(res, what);
    return res;
  }

  return {
    async createJob(pages, meta, signal) {
      const form = new FormData();
      pages.forEach((blob, i) => form.append("pages", blob, `page-${String(i + 1).padStart(4, "0")}.jpg`));
      form.append("meta", JSON.stringify(meta));
      const res = await request("/jobs", "Starting the job", { method: "POST", body: form, signal: signal ?? null });
      return CreateJobResponseSchema.parse(await res.json()).jobId;
    },

    async getJobStatus(jobId, signal) {
      const res = await request(`/jobs/${encodeURIComponent(jobId)}`, "Checking the job", { signal: signal ?? null });
      return JobStatusSchema.parse(await res.json());
    },

    async getPackage(jobId, signal) {
      const res = await request(`/jobs/${encodeURIComponent(jobId)}/package`, "Fetching the package", { signal: signal ?? null });
      return (await res.json()) as unknown;
    },

    async previewVoice(profile, text, signal) {
      const res = await request("/preview", "Previewing the voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile, text }),
        signal: signal ?? null,
      });
      const blob = await res.blob();
      if (blob.size === 0) throw new ApiError("The server returned an empty preview clip.", res.status);
      return blob.type === "audio/mpeg" ? blob : new Blob([blob], { type: "audio/mpeg" });
    },
  };
}

let shared: ApiClient | null = null;

/** The app's client, built lazily from `VITE_API_URL` so a missing variable is reported where it is used. */
export function getApi(): ApiClient {
  shared ??= createApiClient(import.meta.env.VITE_API_URL ?? "");
  return shared;
}
