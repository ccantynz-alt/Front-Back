// ── Crontech Worker Runtime — Tarball download + sha256 verify ─────
// Default `TarballPreparer` for production use. v1 streams the tarball
// to a tmp directory, validates the digest, and returns the workdir.
//
// v1 leaves extraction as a hook (default: write the bytes to disk and
// expect the customer's command to drive the rest). The deploy-agent
// service is responsible for prepping a final OCI image; this preparer
// handles the on-the-fly artefact case (Render-style "build from
// tarball URL").

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TarballPreparer } from "./supervisor";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const b of view) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

export const defaultPrepareTarball: TarballPreparer = async ({ worker }) => {
  const res = await fetch(worker.tarballUrl);
  if (!res.ok) {
    throw new Error(
      `tarball fetch failed: status=${res.status} url=${worker.tarballUrl}`,
    );
  }
  const body = await res.arrayBuffer();
  const digest = await sha256Hex(body);
  if (digest !== worker.sha256) {
    throw new Error(
      `tarball digest mismatch: expected=${worker.sha256} got=${digest}`,
    );
  }
  const workdir = join(tmpdir(), "crontech-worker", worker.workerId);
  await mkdir(workdir, { recursive: true });
  await writeFile(join(workdir, "artifact.tar.gz"), new Uint8Array(body));
  return { workdir };
};
