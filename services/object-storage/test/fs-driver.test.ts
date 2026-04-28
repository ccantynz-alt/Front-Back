// ── Filesystem driver unit tests ────────────────────────────────────
// Drives the FilesystemDriver directly — the server tests cover the
// happy paths through the HTTP layer; these cover edge cases the HTTP
// layer would have a hard time exercising (e.g. idempotent deletes,
// listObjects ordering, multipart-key-mismatch).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemDriver, StorageError } from "../src/drivers/fs";

let root = "";
let driver: FilesystemDriver;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "obj-fs-"));
  driver = new FilesystemDriver(root);
  await driver.ensureBucket("b");
});

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("FilesystemDriver", () => {
  test("putObject computes sha256 etag", async () => {
    const body = new TextEncoder().encode("abc");
    const meta = await driver.putObject("b", "k", body);
    expect(meta.etag).toBe(createHash("sha256").update(body).digest("hex"));
    expect(meta.size).toBe(3);
  });

  test("getObject returns same bytes back", async () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    await driver.putObject("b", "k", body);
    const result = await driver.getObject("b", "k");
    const reader = result.body.getReader();
    const { value } = await reader.read();
    expect(value).toEqual(body);
  });

  test("getObject on missing key throws", async () => {
    await expect(driver.getObject("b", "missing")).rejects.toThrow();
  });

  test("deleteObject is idempotent on missing keys", async () => {
    await expect(driver.deleteObject("b", "missing")).resolves.toBeUndefined();
  });

  test("listObjects returns chronological order", async () => {
    await driver.putObject("b", "first", new Uint8Array([1]));
    await new Promise((r) => setTimeout(r, 5));
    await driver.putObject("b", "second", new Uint8Array([2]));
    const list = await driver.listObjects("b");
    expect(list.map((m) => m.key)).toEqual(["first", "second"]);
  });

  test("multipart with mismatched part etag rejects", async () => {
    const init = await driver.initMultipart("b", "mp", { contentType: "text/plain" });
    const partBytes = new TextEncoder().encode("data");
    await driver.uploadPart("b", "mp", init.uploadId, 1, partBytes);
    await expect(
      driver.completeMultipart("b", "mp", init.uploadId, [
        { partNumber: 1, etag: "0".repeat(64) },
      ]),
    ).rejects.toBeInstanceOf(StorageError);
  });

  test("uploadPart rejects when uploadId is bound to a different key", async () => {
    const init = await driver.initMultipart("b", "real-key");
    await expect(
      driver.uploadPart("b", "wrong-key", init.uploadId, 1, new Uint8Array([1])),
    ).rejects.toBeInstanceOf(StorageError);
  });

  test("multipart preserves contentType", async () => {
    const init = await driver.initMultipart("b", "ct", { contentType: "application/json" });
    const partBytes = new TextEncoder().encode("{}");
    const part = await driver.uploadPart("b", "ct", init.uploadId, 1, partBytes);
    const completed = await driver.completeMultipart("b", "ct", init.uploadId, [
      { partNumber: 1, etag: part.etag },
    ]);
    expect(completed.metadata.contentType).toBe("application/json");
  });

  test("abortMultipart clears state", async () => {
    const init = await driver.initMultipart("b", "ab");
    await driver.abortMultipart("b", "ab", init.uploadId);
    await expect(
      driver.uploadPart("b", "ab", init.uploadId, 1, new Uint8Array([1])),
    ).rejects.toBeInstanceOf(StorageError);
  });

  test("multipart concatenation respects partNumber order", async () => {
    const init = await driver.initMultipart("b", "ordered");
    const part2Bytes = new TextEncoder().encode("two");
    const part1Bytes = new TextEncoder().encode("one");
    // Upload out of order.
    const part2 = await driver.uploadPart("b", "ordered", init.uploadId, 2, part2Bytes);
    const part1 = await driver.uploadPart("b", "ordered", init.uploadId, 1, part1Bytes);

    const completed = await driver.completeMultipart("b", "ordered", init.uploadId, [
      { partNumber: 2, etag: part2.etag },
      { partNumber: 1, etag: part1.etag },
    ]);
    expect(completed.metadata.size).toBe(part1Bytes.byteLength + part2Bytes.byteLength);

    const result = await driver.getObject("b", "ordered");
    const reader = result.body.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe("onetwo");
  });
});
