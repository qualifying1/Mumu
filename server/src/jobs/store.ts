import type { ChapterPackage, JobState, JobStatus } from "@mumu/shared";
import { randomUUID } from "node:crypto";

/** CONTRACT §4: a finished job (and its package) is kept this long. */
export const JOB_RETENTION_MS = 30 * 60 * 1000;

interface Job {
  status: JobStatus;
  pkg?: ChapterPackage;
  /** When the job reached done or failed; the retention clock starts here. */
  finishedAt?: number;
}

export type PackageLookup =
  | { kind: "ready"; pkg: ChapterPackage }
  | { kind: "pending"; status: JobStatus }
  | { kind: "missing" };

/** Jobs live in memory only (CONTRACT §4). `now` is injectable so tests don't wait 30 minutes. */
export class JobStore {
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = () => `job_${randomUUID()}`,
    private readonly retentionMs: number = JOB_RETENTION_MS,
  ) {}

  create(): string {
    this.sweep();
    const id = this.newId();
    this.jobs.set(id, { status: { state: "queued", progress: 0, message: "Queued" } });
    return id;
  }

  status(id: string): JobStatus | null {
    this.sweep();
    const job = this.jobs.get(id);
    return job ? { ...job.status } : null;
  }

  /** Progress update from a running stage. Ignored once the job has finished. */
  update(id: string, state: Exclude<JobState, "done" | "failed">, progress: number, message: string): void {
    const job = this.require(id);
    if (job.finishedAt !== undefined) return;
    job.status = { state, progress, message };
  }

  complete(id: string, pkg: ChapterPackage): void {
    const job = this.require(id);
    job.pkg = pkg;
    job.finishedAt = this.now();
    job.status = { state: "done", progress: 1, message: "Done" };
  }

  fail(id: string, error: string): void {
    const job = this.require(id);
    job.finishedAt = this.now();
    job.status = { state: "failed", progress: job.status.progress, message: "Failed", error };
  }

  lookupPackage(id: string): PackageLookup {
    this.sweep();
    const job = this.jobs.get(id);
    if (!job) return { kind: "missing" };
    if (job.pkg) return { kind: "ready", pkg: job.pkg };
    return { kind: "pending", status: { ...job.status } };
  }

  private require(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`unknown job ${id}`);
    return job;
  }

  private sweep(): void {
    const cutoff = this.now() - this.retentionMs;
    for (const [id, job] of this.jobs) {
      if (job.finishedAt !== undefined && job.finishedAt <= cutoff) this.jobs.delete(id);
    }
  }
}
