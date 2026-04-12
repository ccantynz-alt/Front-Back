import { describe, expect, it } from "bun:test";
import {
  GPUWorkerClient,
  GPUInferenceClient,
  VideoProcessingClient,
  FineTuningClient,
  createGPUWorkerClient,
  GPU_MODELS,
  ModalEnvSchema,
} from "./index";

const testEnv = {
  MODAL_TOKEN_ID: "test-token-id",
  MODAL_TOKEN_SECRET: "test-token-secret",
  MODAL_ENDPOINT_URL: "https://api.modal.com",
};

describe("ModalEnvSchema", () => {
  it("parses a valid env object", () => {
    const parsed = ModalEnvSchema.parse(testEnv);
    expect(parsed.MODAL_TOKEN_ID).toBe("test-token-id");
    expect(parsed.MODAL_ENDPOINT_URL).toBe("https://api.modal.com");
  });

  it("rejects an env object missing token id", () => {
    expect(() =>
      ModalEnvSchema.parse({ ...testEnv, MODAL_TOKEN_ID: "" }),
    ).toThrow();
  });
});

describe("GPUWorkerClient", () => {
  it("constructs all three sub-clients from a valid env", () => {
    const client = new GPUWorkerClient(testEnv);
    expect(client.inference).toBeInstanceOf(GPUInferenceClient);
    expect(client.video).toBeInstanceOf(VideoProcessingClient);
    expect(client.training).toBeInstanceOf(FineTuningClient);
  });
});

describe("createGPUWorkerClient", () => {
  it("accepts env overrides without reading process.env", () => {
    const client = createGPUWorkerClient(testEnv);
    expect(client).toBeInstanceOf(GPUWorkerClient);
  });
});

describe("GPU_MODELS catalog", () => {
  it("exposes at least one model definition", () => {
    expect(Object.keys(GPU_MODELS).length).toBeGreaterThan(0);
  });
});
