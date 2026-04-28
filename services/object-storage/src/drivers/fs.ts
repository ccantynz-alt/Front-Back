// ── Object Storage — filesystem driver ────────────────────────────────
// Backs the StorageDriver contract with a local directory. Used in tests
// and local dev. Each object's bytes live at `<root>/<bucket>/objects/
// <hashed-key>` and metadata at `<root>/<bucket>/meta/<hashed-key>.json`.
//
// Multipart parts live under `<root>/<bucket>/uploads/<uploadId>/<n>`.
// Bucket existence is represented by the directory's existence on disk.
//
// Why hash the key on disk: object keys can contain slashes ("a/b/c.txt"),
// so we hash to a flat filename to avoid collisions with our own
// "objects"/"meta"/"uploads" directories and to keep the layout flat.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  MultipartCompletion,
  MultipartInit,
  ObjectMetadata,
  PutOptions,
  StorageDriver,
  UploadedPart,
  GetResult,
} from "./types";

interface PersistedMetadata {
  key: string;
  bucket: string;
  size: number;
  etag: string;
  contentType: string | undefined;
  lastModifiedISO: string;
}

export class StorageError extends Error {
  readonly code: "not_found" | "invalid_part" | "invalid_upload" | "io_error";
  constructor(code: StorageError["code"], message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

export class FilesystemDriver implements StorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  // ── Path helpers ────────────────────────────────────────────────────

  private hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  private bucketDir(bucket: string): string {
    return join(this.root, bucket);
  }

  private objectPath(bucket: string, key: string): string {
    return join(this.bucketDir(bucket), "objects", this.hashKey(key));
  }

  private metaPath(bucket: string, key: string): string {
    return join(this.bucketDir(bucket), "meta", `${this.hashKey(key)}.json`);
  }

  private uploadDir(bucket: string, uploadId: string): string {
    return join(this.bucketDir(bucket), "uploads", uploadId);
  }

  private partPath(bucket: string, uploadId: string, partNumber: number): string {
    return join(this.uploadDir(bucket, uploadId), `${partNumber}`);
  }

  private uploadKeyPointer(bucket: string, uploadId: string): string {
    return join(this.uploadDir(bucket, uploadId), ".key");
  }

  private uploadOptionsPointer(bucket: string, uploadId: string): string {
    return join(this.uploadDir(bucket, uploadId), ".options.json");
  }

  // ── Driver interface ────────────────────────────────────────────────

  async ensureBucket(bucket: string): Promise<void> {
    await mkdir(join(this.bucketDir(bucket), "objects"), { recursive: true });
    await mkdir(join(this.bucketDir(bucket), "meta"), { recursive: true });
    await mkdir(join(this.bucketDir(bucket), "uploads"), { recursive: true });
  }

  async putObject(
    bucket: string,
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options?: PutOptions,
  ): Promise<ObjectMetadata> {
    await this.ensureBucket(bucket);
    const objPath = this.objectPath(bucket, key);
    const metaPath = this.metaPath(bucket, key);
    await mkdir(dirname(objPath), { recursive: true });
    await mkdir(dirname(metaPath), { recursive: true });

    const bytes = body instanceof Uint8Array ? body : await streamToBuffer(body);
    const hash = createHash("sha256").update(bytes).digest("hex");

    await writeFile(objPath, bytes);
    const meta: PersistedMetadata = {
      key,
      bucket,
      size: bytes.byteLength,
      etag: hash,
      contentType: options?.contentType,
      lastModifiedISO: new Date().toISOString(),
    };
    await writeFile(metaPath, JSON.stringify(meta));
    return persistedToObject(meta);
  }

  async getObject(bucket: string, key: string): Promise<GetResult> {
    const meta = await this.headObject(bucket, key);
    if (meta === null) {
      throw new StorageError("not_found", `object not found: ${bucket}/${key}`);
    }
    const bytes = await readFile(this.objectPath(bucket, key));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    });
    return { metadata: meta, body };
  }

  async headObject(bucket: string, key: string): Promise<ObjectMetadata | null> {
    try {
      const raw = await readFile(this.metaPath(bucket, key), "utf8");
      const parsed = JSON.parse(raw) as PersistedMetadata;
      return persistedToObject(parsed);
    } catch (err: unknown) {
      if (isFsNotFound(err)) return null;
      throw err;
    }
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    try {
      await rm(this.objectPath(bucket, key), { force: true });
      await rm(this.metaPath(bucket, key), { force: true });
    } catch (err: unknown) {
      if (isFsNotFound(err)) return;
      throw err;
    }
  }

  async initMultipart(
    bucket: string,
    key: string,
    options?: PutOptions,
  ): Promise<MultipartInit> {
    await this.ensureBucket(bucket);
    const uploadId = randomUUID();
    await mkdir(this.uploadDir(bucket, uploadId), { recursive: true });
    await writeFile(this.uploadKeyPointer(bucket, uploadId), key);
    if (options?.contentType !== undefined) {
      await writeFile(
        this.uploadOptionsPointer(bucket, uploadId),
        JSON.stringify({ contentType: options.contentType }),
      );
    }
    return { uploadId };
  }

  async uploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    body: ReadableStream<Uint8Array> | Uint8Array,
  ): Promise<UploadedPart> {
    if (!Number.isInteger(partNumber) || partNumber <= 0) {
      throw new StorageError("invalid_part", `partNumber must be a positive integer`);
    }
    const dir = this.uploadDir(bucket, uploadId);
    if (!(await exists(dir))) {
      throw new StorageError("invalid_upload", `unknown uploadId: ${uploadId}`);
    }
    const recordedKey = (await readFile(this.uploadKeyPointer(bucket, uploadId), "utf8")).trim();
    if (recordedKey !== key) {
      throw new StorageError(
        "invalid_upload",
        `uploadId ${uploadId} is bound to a different key`,
      );
    }
    const bytes = body instanceof Uint8Array ? body : await streamToBuffer(body);
    const partHash = createHash("sha256").update(bytes).digest("hex");
    await writeFile(this.partPath(bucket, uploadId, partNumber), bytes);
    return { partNumber, etag: partHash, size: bytes.byteLength };
  }

  async completeMultipart(
    bucket: string,
    key: string,
    uploadId: string,
    parts: ReadonlyArray<{ partNumber: number; etag: string }>,
  ): Promise<MultipartCompletion> {
    const dir = this.uploadDir(bucket, uploadId);
    if (!(await exists(dir))) {
      throw new StorageError("invalid_upload", `unknown uploadId: ${uploadId}`);
    }
    const recordedKey = (await readFile(this.uploadKeyPointer(bucket, uploadId), "utf8")).trim();
    if (recordedKey !== key) {
      throw new StorageError(
        "invalid_upload",
        `uploadId ${uploadId} is bound to a different key`,
      );
    }
    // Sort by partNumber so concatenation is deterministic.
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    const chunks: Buffer[] = [];
    for (const part of sorted) {
      const partBytes = await readFile(this.partPath(bucket, uploadId, part.partNumber));
      const observedHash = createHash("sha256").update(partBytes).digest("hex");
      if (observedHash !== part.etag) {
        throw new StorageError(
          "invalid_part",
          `part ${part.partNumber} etag mismatch (got ${observedHash}, want ${part.etag})`,
        );
      }
      chunks.push(partBytes);
    }
    const combined = Buffer.concat(chunks);

    let contentType: string | undefined;
    try {
      const optsRaw = await readFile(this.uploadOptionsPointer(bucket, uploadId), "utf8");
      const parsed = JSON.parse(optsRaw) as { contentType?: string };
      contentType = parsed.contentType;
    } catch (err: unknown) {
      if (!isFsNotFound(err)) throw err;
    }

    const metadata = await this.putObject(
      bucket,
      key,
      new Uint8Array(combined),
      contentType !== undefined ? { contentType } : undefined,
    );
    await rm(dir, { recursive: true, force: true });
    return { metadata };
  }

  async abortMultipart(bucket: string, _key: string, uploadId: string): Promise<void> {
    await rm(this.uploadDir(bucket, uploadId), { recursive: true, force: true });
  }

  /** Test helper — list every object stored in a bucket, oldest first. */
  async listObjects(bucket: string): Promise<ObjectMetadata[]> {
    const metaDir = join(this.bucketDir(bucket), "meta");
    let entries: string[];
    try {
      entries = await readdir(metaDir);
    } catch (err: unknown) {
      if (isFsNotFound(err)) return [];
      throw err;
    }
    const out: ObjectMetadata[] = [];
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      const raw = await readFile(join(metaDir, name), "utf8");
      out.push(persistedToObject(JSON.parse(raw) as PersistedMetadata));
    }
    out.sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
    return out;
  }
}

// ── Internal helpers ────────────────────────────────────────────────────

function persistedToObject(p: PersistedMetadata): ObjectMetadata {
  return {
    key: p.key,
    bucket: p.bucket,
    size: p.size,
    etag: p.etag,
    contentType: p.contentType,
    lastModified: new Date(p.lastModifiedISO),
  };
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  // biome-ignore lint/correctness/noConstantCondition: drain loop
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err: unknown) {
    if (isFsNotFound(err)) return false;
    throw err;
  }
}

function isFsNotFound(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const errno = (err as { code?: unknown }).code;
  return errno === "ENOENT";
}
