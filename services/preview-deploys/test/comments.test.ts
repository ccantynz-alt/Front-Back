import { describe, expect, test } from "bun:test";
import {
  COMMENT_MARKER,
  HttpGitHubCommentsClient,
} from "../src/github/comments";
import { renderCommentBody } from "../src/github/render";
import type { PreviewState } from "../src/types";

function fakeFetch(handler: (req: Request) => Response | Promise<Response>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as string, init as RequestInit | undefined);
    return handler(req);
  };
}

describe("HttpGitHubCommentsClient", () => {
  test("constructor rejects empty token", () => {
    expect(() => new HttpGitHubCommentsClient("")).toThrow();
  });

  test("postComment hits the issues comments endpoint", async () => {
    let captured: Request | undefined;
    const ff = fakeFetch(async (req) => {
      captured = req;
      return new Response(JSON.stringify({ id: 7 }), { status: 201 });
    });
    const client = new HttpGitHubCommentsClient(
      "tkn",
      ff as unknown as typeof fetch,
    );
    const result = await client.postComment({
      owner: "crontech",
      repo: "btf",
      number: 9,
      body: "hello",
    });
    expect(result.id).toBe(7);
    expect(captured?.method).toBe("POST");
    expect(captured?.url).toContain(
      "/repos/crontech/btf/issues/9/comments",
    );
    expect(captured?.headers.get("authorization")).toBe("Bearer tkn");
  });

  test("updateComment sends PATCH to /issues/comments/:id", async () => {
    let captured: Request | undefined;
    const ff = fakeFetch(async (req) => {
      captured = req;
      return new Response(null, { status: 200 });
    });
    const client = new HttpGitHubCommentsClient(
      "tkn",
      ff as unknown as typeof fetch,
    );
    await client.updateComment({
      owner: "crontech",
      repo: "btf",
      commentId: 42,
      body: "new",
    });
    expect(captured?.method).toBe("PATCH");
    expect(captured?.url).toContain("/issues/comments/42");
  });

  test("deleteComment tolerates 404", async () => {
    const ff = fakeFetch(async () => new Response(null, { status: 404 }));
    const client = new HttpGitHubCommentsClient(
      "tkn",
      ff as unknown as typeof fetch,
    );
    await client.deleteComment({
      owner: "crontech",
      repo: "btf",
      commentId: 42,
    });
    // No throw == pass.
  });

  test("postComment throws on non-OK response", async () => {
    const ff = fakeFetch(
      async () => new Response("nope", { status: 500 }),
    );
    const client = new HttpGitHubCommentsClient(
      "tkn",
      ff as unknown as typeof fetch,
    );
    await expect(
      client.postComment({
        owner: "crontech",
        repo: "btf",
        number: 9,
        body: "x",
      }),
    ).rejects.toThrow();
  });
});

describe("renderCommentBody", () => {
  const baseState: PreviewState = {
    prId: "crontech/btf#9",
    owner: "crontech",
    repo: "btf",
    number: 9,
    hostname: "crontech-btf-pr9-abcdef1.preview.crontech.dev",
    lastSha: "abcdef1234567890",
    status: "pending",
    createdAt: 1,
    updatedAt: 1,
  };

  test("always begins with the comment marker", () => {
    const body = renderCommentBody(baseState);
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
  });

  test("renders the live URL as a markdown link when status is live", () => {
    const body = renderCommentBody({ ...baseState, status: "live" });
    expect(body).toContain(
      `[https://${baseState.hostname}](https://${baseState.hostname})`,
    );
    expect(body).toContain("Live");
  });

  test("includes failure block when status=failed", () => {
    const body = renderCommentBody({
      ...baseState,
      status: "failed",
      errorMessage: "boom",
    });
    expect(body).toContain("Build failed");
    expect(body).toContain("boom");
  });

  test("includes torn-down note", () => {
    const body = renderCommentBody({ ...baseState, status: "torn-down" });
    expect(body).toContain("torn down");
  });
});
