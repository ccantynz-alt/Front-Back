// ── MinIO driver unit tests ─────────────────────────────────────────
// Stubs `fetch` to assert the wire-format choices the MinIO driver
// makes (Sig V4 headers, S3-style query strings, XML body shape). We
// don't spin up a real MinIO here — that lives in the docker-compose
// integration suite — but the wire-format must be exactly right for
// MinIO to accept the requests in production.

import { describe, expect, test } from "bun:test";
import { MinioDriver } from "../src/drivers/minio";

function stubFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    return Promise.resolve(handler(req));
  }) as typeof fetch;
}

function buildDriver(handler: (req: Request) => Response | Promise<Response>): MinioDriver {
  return new MinioDriver({
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    accessKeyId: "minio",
    secretAccessKey: "miniosecret",
    fetchImpl: stubFetch(handler),
  });
}

describe("MinioDriver wire format", () => {
  test("putObject signs request with AWS4-HMAC-SHA256 header", async () => {
    let captured: Request | null = null;
    const driver = buildDriver((req) => {
      captured = req;
      return new Response(null, { status: 200 });
    });
    await driver.putObject("alpha", "k.txt", new TextEncoder().encode("hi"), {
      contentType: "text/plain",
    });
    expect(captured).not.toBeNull();
    const captured2 = captured as unknown as Request;
    expect(captured2.method).toBe("PUT");
    expect(captured2.url).toBe("http://localhost:9000/alpha/k.txt");
    const auth = captured2.headers.get("authorization");
    expect(auth).toBeTruthy();
    expect(auth).toMatch(/^AWS4-HMAC-SHA256 Credential=minio\//);
    expect(auth).toContain("Signature=");
    expect(captured2.headers.get("x-amz-date")).toBeTruthy();
    expect(captured2.headers.get("x-amz-content-sha256")).toBeTruthy();
  });

  test("encodes nested keys with slashes", async () => {
    let url: string = "";
    const driver = buildDriver((req) => {
      url = req.url;
      return new Response(null, { status: 200 });
    });
    await driver.deleteObject("alpha", "deeply/nested/path/file.txt");
    expect(url).toBe("http://localhost:9000/alpha/deeply/nested/path/file.txt");
  });

  test("encodes keys with spaces and special characters", async () => {
    let url: string = "";
    const driver = buildDriver((req) => {
      url = req.url;
      return new Response(null, { status: 200 });
    });
    await driver.deleteObject("alpha", "name with spaces.txt");
    expect(url).toBe("http://localhost:9000/alpha/name%20with%20spaces.txt");
  });

  test("initMultipart parses UploadId from XML body", async () => {
    const driver = buildDriver(
      () =>
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><Bucket>alpha</Bucket><Key>x</Key><UploadId>abc-123</UploadId></InitiateMultipartUploadResult>`,
          { status: 200 },
        ),
    );
    const init = await driver.initMultipart("alpha", "x");
    expect(init.uploadId).toBe("abc-123");
  });

  test("uploadPart includes partNumber + uploadId in query string", async () => {
    let url: string = "";
    const driver = buildDriver((req) => {
      url = req.url;
      return new Response(null, { status: 200 });
    });
    await driver.uploadPart("alpha", "x", "u-1", 3, new Uint8Array([1, 2, 3]));
    expect(url).toContain("partNumber=3");
    expect(url).toContain("uploadId=u-1");
  });

  test("completeMultipart sends well-formed XML body", async () => {
    let body = "";
    const driver = buildDriver(async (req) => {
      if (req.method === "POST") {
        body = await req.text();
        return new Response(null, { status: 200 });
      }
      // headObject after complete.
      return new Response(null, {
        status: 200,
        headers: {
          "content-length": "10",
          "x-amz-meta-sha256-etag": "deadbeef",
          "last-modified": new Date().toUTCString(),
        },
      });
    });
    await driver.completeMultipart("alpha", "x", "u-1", [
      { partNumber: 1, etag: "aaa" },
      { partNumber: 2, etag: "bbb" },
    ]);
    expect(body).toContain("<PartNumber>1</PartNumber>");
    expect(body).toContain('<ETag>"aaa"</ETag>');
    expect(body).toContain("<PartNumber>2</PartNumber>");
  });

  test("getObject 404 throws", async () => {
    const driver = buildDriver(() => new Response(null, { status: 404 }));
    await expect(driver.getObject("alpha", "missing")).rejects.toThrow();
  });

  test("headObject 404 returns null", async () => {
    const driver = buildDriver(() => new Response(null, { status: 404 }));
    const result = await driver.headObject("alpha", "missing");
    expect(result).toBeNull();
  });
});
