import { describe, test, expect } from "bun:test";
import { ContentDocumentSchema, RAGQuerySchema } from "./pipeline";

describe("RAG Pipeline Schemas", () => {
  test("ContentDocumentSchema validates valid document", () => {
    const result = ContentDocumentSchema.safeParse({
      id: "doc-1",
      content: "This is the document content about AI inference.",
      metadata: {
        title: "AI Inference Guide",
        source: "document",
        type: "text/markdown",
        url: "/docs/ai-inference",
        tags: ["ai", "inference"],
      },
    });
    expect(result.success).toBe(true);
  });

  test("ContentDocumentSchema requires id and content", () => {
    const result = ContentDocumentSchema.safeParse({
      metadata: { source: "test", type: "text" },
    });
    expect(result.success).toBe(false);
  });

  test("ContentDocumentSchema requires source and type in metadata", () => {
    const result = ContentDocumentSchema.safeParse({
      id: "doc-1",
      content: "Content",
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  test("RAGQuerySchema validates with defaults", () => {
    const result = RAGQuerySchema.safeParse({ query: "How does inference work?" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxResults).toBe(5);
      expect(result.data.scoreThreshold).toBe(0.7);
    }
  });

  test("RAGQuerySchema rejects empty query", () => {
    const result = RAGQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("RAGQuerySchema validates custom limits", () => {
    const result = RAGQuerySchema.safeParse({
      query: "test",
      maxResults: 20,
      scoreThreshold: 0.5,
    });
    expect(result.success).toBe(true);
  });

  test("RAGQuerySchema rejects out-of-range maxResults", () => {
    const result = RAGQuerySchema.safeParse({
      query: "test",
      maxResults: 100,
    });
    expect(result.success).toBe(false);
  });
});
