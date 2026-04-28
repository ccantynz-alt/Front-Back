import { describe, expect, test } from "bun:test";
import type { SendMessageInput } from "../types.ts";
import { buildMime } from "./mime-builder.ts";

const baseInput = (overrides: Partial<SendMessageInput> = {}): SendMessageInput => ({
  from: "sender@sender.example",
  to: ["target@recipient.example"],
  subject: "Hello",
  text: "Plain body",
  tenantId: "tenant-a",
  ...overrides,
});

describe("buildMime", () => {
  test("includes core headers", () => {
    const out = buildMime(baseInput(), "target@recipient.example");
    expect(out.raw).toContain("From: sender@sender.example");
    expect(out.raw).toContain("To: target@recipient.example");
    expect(out.raw).toContain("Subject: Hello");
    expect(out.raw).toContain("MIME-Version: 1.0");
    expect(out.headers["Message-ID"]).toBeDefined();
  });

  test("multipart/alternative when html and text present", () => {
    const out = buildMime(baseInput({ html: "<p>Hi</p>", text: "Hi" }), "target@recipient.example");
    expect(out.raw).toContain("multipart/alternative");
    expect(out.raw).toContain("text/plain");
    expect(out.raw).toContain("text/html");
  });

  test("multipart/mixed when attachments present", () => {
    const out = buildMime(
      baseInput({
        attachments: [
          {
            filename: "a.txt",
            contentBase64: Buffer.from("hello").toString("base64"),
            contentType: "text/plain",
          },
        ],
      }),
      "target@recipient.example",
    );
    expect(out.raw).toContain("multipart/mixed");
    expect(out.raw).toContain('filename="a.txt"');
  });

  test("encodes non-ASCII subject as encoded-word", () => {
    const out = buildMime(baseInput({ subject: "Héllo" }), "target@recipient.example");
    expect(out.raw).toContain("=?UTF-8?B?");
  });
});
