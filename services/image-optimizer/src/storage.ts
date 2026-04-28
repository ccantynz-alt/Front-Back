/**
 * Thin client wrapper for the object-storage service.
 *
 * We deliberately do NOT import from services/object-storage/ — that
 * service is owned by another agent slice.  Instead we talk to it via
 * a small HTTP-shaped contract that any compatible store can implement
 * (R2, S3, MinIO, an in-memory map for tests).  Tests inject their own
 * implementation.
 */

export interface StoredObject {
	bytes: Uint8Array;
	contentType: string;
}

export interface ObjectStorage {
	get(key: string): Promise<StoredObject | null>;
	put(key: string, value: StoredObject): Promise<void>;
}

/**
 * HTTP-backed implementation that talks to a remote object-storage
 * service.  The actual REST contract is intentionally minimal:
 *
 *   GET    {baseUrl}/{key}  → 200 with bytes + Content-Type, or 404
 *   PUT    {baseUrl}/{key}  → 2xx; body is the bytes, header sets type
 *
 * Any storage backend that exposes these two routes is compatible.
 */
export class HttpObjectStorage implements ObjectStorage {
	private readonly baseUrl: string;
	private readonly fetcher: typeof fetch;
	private readonly authHeader: string | undefined;

	constructor(opts: {
		baseUrl: string;
		fetcher?: typeof fetch;
		authHeader?: string;
	}) {
		this.baseUrl = opts.baseUrl.replace(/\/$/u, "");
		this.fetcher = opts.fetcher ?? fetch;
		this.authHeader = opts.authHeader;
	}

	async get(key: string): Promise<StoredObject | null> {
		const headers: Record<string, string> = {};
		if (this.authHeader) headers.Authorization = this.authHeader;
		const res = await this.fetcher(`${this.baseUrl}/${encodeURIComponent(key)}`, {
			method: "GET",
			headers,
		});
		if (res.status === 404) return null;
		if (!res.ok) throw new Error(`storage GET failed: ${res.status}`);
		const buffer = await res.arrayBuffer();
		return {
			bytes: new Uint8Array(buffer),
			contentType:
				res.headers.get("content-type") ?? "application/octet-stream",
		};
	}

	async put(key: string, value: StoredObject): Promise<void> {
		const headers: Record<string, string> = {
			"content-type": value.contentType,
		};
		if (this.authHeader) headers.Authorization = this.authHeader;
		// Copy into a fresh ArrayBuffer-backed Uint8Array.  TypeScript's
		// ArrayBufferLike vs ArrayBuffer narrowing makes the cross-runtime
		// BodyInit type fail otherwise — copying gives us a guaranteed
		// non-shared ArrayBuffer view.
		const buf = new ArrayBuffer(value.bytes.byteLength);
		new Uint8Array(buf).set(value.bytes);
		const res = await this.fetcher(`${this.baseUrl}/${encodeURIComponent(key)}`, {
			method: "PUT",
			headers,
			body: buf,
		});
		if (!res.ok) throw new Error(`storage PUT failed: ${res.status}`);
	}
}

/** In-memory storage — used by tests and by `bun run dev` without R2. */
export class MemoryObjectStorage implements ObjectStorage {
	private readonly map = new Map<string, StoredObject>();

	get(key: string): Promise<StoredObject | null> {
		const v = this.map.get(key);
		return Promise.resolve(v ? { ...v } : null);
	}

	put(key: string, value: StoredObject): Promise<void> {
		this.map.set(key, { ...value });
		return Promise.resolve();
	}

	get size(): number {
		return this.map.size;
	}

	clear(): void {
		this.map.clear();
	}
}
