// ── workspace lifecycle ───────────────────────────────────────────────
// Each build gets its own tmpdir. Cleanup runs unconditionally on exit
// (success OR failure). Orchestrator never sees half-cleaned dirs.

import * as path from "node:path";
import * as os from "node:os";
import { mkdir, rm } from "node:fs/promises";

export interface Workspace {
  readonly buildId: string;
  readonly root: string;
  readonly checkoutDir: string;
  readonly artefactsDir: string;
  cleanup(): Promise<void>;
}

export interface WorkspaceFactory {
  create(buildId: string): Promise<Workspace>;
}

export class TmpdirWorkspaceFactory implements WorkspaceFactory {
  constructor(private readonly base: string = path.join(os.tmpdir(), "crontech-build-runner")) {}

  async create(buildId: string): Promise<Workspace> {
    const root = path.join(this.base, buildId);
    const checkoutDir = path.join(root, "checkout");
    const artefactsDir = path.join(root, "artefacts");
    await mkdir(root, { recursive: true });
    await mkdir(artefactsDir, { recursive: true });

    let cleaned = false;
    return {
      buildId,
      root,
      checkoutDir,
      artefactsDir,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await rm(root, { recursive: true, force: true });
      },
    };
  }
}
