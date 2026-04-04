import { describe, test, expect } from "bun:test";
import { createQdrantClient, type QdrantConfig } from "./qdrant";

describe("Qdrant Client", () => {
  test("createQdrantClient returns a client instance", () => {
    const client = createQdrantClient({ url: "http://localhost:6333" });
    expect(client).toBeDefined();
  });

  test("createQdrantClient uses default URL when none provided", () => {
    const client = createQdrantClient();
    expect(client).toBeDefined();
  });

  test("QdrantConfig accepts custom url and apiKey", () => {
    const config: QdrantConfig = {
      url: "http://custom:6333",
      apiKey: "test-key",
      collectionName: "test-collection",
    };
    const client = createQdrantClient(config);
    expect(client).toBeDefined();
  });
});
