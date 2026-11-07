import { DEFAULT_PROFILES } from "@mumu/shared";
import { describe, expect, it } from "vitest";
import { ApiError, createApiClient, type FetchFn } from "./client.ts";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function client(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push(init ? { url, init } : { url });
    return handler(url, init);
  };
  return { api: createApiClient("http://srv:8787/", fetchFn), calls };
}

describe("api client", () => {
  it("refuses to be built without a base URL", () => {
    expect(() => createApiClient("")).toThrow(/VITE_API_URL/);
  });

  it("creates a job with ordered pages and meta in a multipart body", async () => {
    const { api, calls } = client(() => json({ jobId: "job_9" }, 202));
    const meta = { seriesId: "s", chapterId: "c", cast: [], profiles: [...DEFAULT_PROFILES] };
    const jobId = await api.createJob([new Blob(["a"]), new Blob(["b"])], meta);

    expect(jobId).toBe("job_9");
    expect(calls[0]?.url).toBe("http://srv:8787/jobs");
    const form = calls[0]?.init?.body as FormData;
    expect(form.getAll("pages").map((f) => (f as File).name)).toEqual(["page-0001.jpg", "page-0002.jpg"]);
    expect(JSON.parse(form.get("meta") as string)).toMatchObject({ seriesId: "s", chapterId: "c" });
  });

  it("validates the status body", async () => {
    const { api } = client(() => json({ state: "analyzing", progress: 0.4, message: "Analyzing segment 7/19" }));
    expect(await api.getJobStatus("job_1")).toMatchObject({ state: "analyzing", progress: 0.4 });

    const bad = client(() => json({ state: "mystery", progress: 2, message: "" }));
    await expect(bad.api.getJobStatus("job_1")).rejects.toThrow();
  });

  it("turns the contract error body into an ApiError", async () => {
    const { api } = client(() => json({ error: "Bad request", detail: "pages is empty" }, 400));
    const err = await api.createJob([], { seriesId: "s", chapterId: "c", cast: [], profiles: [] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "Bad request", status: 400, detail: "pages is empty" });
  });

  it("names the status when the error body is not the contract shape", async () => {
    const { api } = client(() => new Response("<html>bad gateway</html>", { status: 502 }));
    const err = await api.getJobStatus("job_1").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502 });
    expect((err as ApiError).message).toMatch(/502/);
  });

  it("reports an unreachable server with status 0", async () => {
    const { api } = client(() => {
      throw new TypeError("Failed to fetch");
    });
    const err = await api.getJobStatus("job_1").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0 });
    expect((err as ApiError).message).toMatch(/Can't reach the server/);
  });

  it("returns a package as raw JSON and a preview as an mp3 blob", async () => {
    const pkg = { contractVersion: 1 };
    expect(await client(() => json(pkg)).api.getPackage("job_1")).toEqual(pkg);

    const { api, calls } = client(() => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } }));
    const profile = DEFAULT_PROFILES[0]!;
    const clip = await api.previewVoice(profile, "Hello there");
    expect(clip.type).toBe("audio/mpeg");
    expect(clip.size).toBe(3);
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ profile, text: "Hello there" });
  });

  it("rejects an empty preview", async () => {
    const { api } = client(() => new Response(new Uint8Array(), { headers: { "content-type": "audio/mpeg" } }));
    await expect(api.previewVoice(DEFAULT_PROFILES[0]!, "Hi")).rejects.toThrow(/empty/);
  });
});
