// ── Object-Storage Wrapper ──────────────────────────────────────────────
// Thin HTTP wrapper. The real implementation will talk to R2 / Turso /
// equivalent — for now it's a `fetch`-based shim. Tests inject an
// alternate `ObjectStorage` so we never hit the network.

export interface ObjectStorage {
  /** Download an artefact and persist it to a local path. */
  download(url: string, localPath: string): Promise<void>;
  /** Upload a local file and return its canonical URL. */
  upload(localPath: string, key: string): Promise<string>;
}

export class HttpObjectStorage implements ObjectStorage {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async download(url: string, localPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Storage download failed: ${res.status} ${res.statusText}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    await Bun.write(localPath, bytes);
  }

  async upload(localPath: string, key: string): Promise<string> {
    const file = Bun.file(localPath);
    const target = `${this.baseUrl}/${key}`;
    const res = await fetch(target, {
      method: "PUT",
      body: await file.arrayBuffer(),
    });
    if (!res.ok) {
      throw new Error(`Storage upload failed: ${res.status} ${res.statusText}`);
    }
    return target;
  }
}
