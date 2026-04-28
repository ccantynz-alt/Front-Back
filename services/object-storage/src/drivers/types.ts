/**
 * Storage driver interface — all backends (filesystem for tests, MinIO/S3
 * for production) implement this contract. The HTTP layer never knows which
 * driver is in play.
 */

export interface ObjectMetadata {
  /** Tenant-scoped key (e.g. "tenant-a/path/to/file.txt"). */
  key: string;
  /** Logical bucket name. */
  bucket: string;
  /** Total size in bytes. */
  size: number;
  /** SHA-256 hash of the object body, hex-encoded. Used as the strong ETag. */
  etag: string;
  /** Optional MIME type. Stored verbatim if supplied at upload. */
  contentType: string | undefined;
  /** Wall-clock UTC timestamp of last write. */
  lastModified: Date;
}

export interface PutOptions {
  /** Optional MIME type to persist alongside the object. */
  contentType?: string | undefined;
}

export interface GetResult {
  metadata: ObjectMetadata;
  /** Object body as a binary stream — driver decides how to back it. */
  body: ReadableStream<Uint8Array>;
}

export interface MultipartInit {
  /** Opaque upload ID to thread through subsequent partNumber + complete calls. */
  uploadId: string;
}

export interface UploadedPart {
  partNumber: number;
  /** SHA-256 hex hash of this part's body. */
  etag: string;
  /** Size of this part in bytes. */
  size: number;
}

export interface MultipartCompletion {
  metadata: ObjectMetadata;
}

/**
 * Storage driver contract. All operations are async and may throw if the
 * underlying backend is unreachable or returns a non-recoverable error.
 *
 * Drivers MUST NOT silently swallow errors — the HTTP layer maps thrown
 * errors to 4xx/5xx responses and the caller cannot recover otherwise.
 */
export interface StorageDriver {
  /**
   * Persist an object body. Returns the metadata of the stored object,
   * including the strong SHA-256 ETag computed over the body.
   */
  putObject(
    bucket: string,
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options?: PutOptions,
  ): Promise<ObjectMetadata>;

  /**
   * Fetch an object body + metadata. Throws if the object does not exist.
   */
  getObject(bucket: string, key: string): Promise<GetResult>;

  /**
   * Fetch only the metadata for an object. Returns null if it does not exist.
   */
  headObject(bucket: string, key: string): Promise<ObjectMetadata | null>;

  /**
   * Delete an object. Idempotent — succeeds even if the key is absent.
   */
  deleteObject(bucket: string, key: string): Promise<void>;

  /**
   * Initialize a multipart upload session for a given bucket+key. Returns
   * an opaque upload ID that callers thread through subsequent calls.
   */
  initMultipart(bucket: string, key: string, options?: PutOptions): Promise<MultipartInit>;

  /**
   * Upload a single part of a multipart upload. Returns the part metadata
   * including a SHA-256 hash of just this part.
   */
  uploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    body: ReadableStream<Uint8Array> | Uint8Array,
  ): Promise<UploadedPart>;

  /**
   * Finalize a multipart upload. The driver concatenates parts in
   * partNumber order and computes the final SHA-256 ETag over the
   * concatenated body. Returns the assembled object metadata.
   */
  completeMultipart(
    bucket: string,
    key: string,
    uploadId: string,
    parts: ReadonlyArray<{ partNumber: number; etag: string }>,
  ): Promise<MultipartCompletion>;

  /**
   * Abort a multipart upload, releasing all part data. Idempotent.
   */
  abortMultipart(bucket: string, key: string, uploadId: string): Promise<void>;

  /**
   * Ensure a bucket exists. Idempotent — no-op if it already exists.
   */
  ensureBucket(bucket: string): Promise<void>;
}
