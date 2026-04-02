// ── Chrome Built-in AI Integration ──────────────────────────────────
// Tier-0 inference: Even cheaper than WebGPU. No model download needed.
// Chrome 130+ ships built-in AI APIs — Prompt API, Summarizer, Translator.
// These run on-device using Chrome's built-in models at zero cost.

// ── Type Declarations for Chrome AI APIs ────────────────────────────
// These APIs are experimental and not yet in TypeScript's lib.dom.
// We declare minimal interfaces to keep type safety.

interface AILanguageModel {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}

interface AILanguageModelFactory {
  capabilities(): Promise<{ available: "readily" | "after-download" | "no" }>;
  create(options?: {
    systemPrompt?: string;
    temperature?: number;
    topK?: number;
    signal?: AbortSignal;
  }): Promise<AILanguageModel>;
}

interface AISummarizer {
  summarize(text: string, options?: {
    signal?: AbortSignal;
    context?: string;
  }): Promise<string>;
  destroy(): void;
}

interface AISummarizerFactory {
  capabilities(): Promise<{ available: "readily" | "after-download" | "no" }>;
  create(options?: {
    type?: "key-points" | "tl;dr" | "teaser" | "headline";
    format?: "plain-text" | "markdown";
    length?: "short" | "medium" | "long";
    signal?: AbortSignal;
  }): Promise<AISummarizer>;
}

interface AITranslator {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface AITranslatorFactory {
  capabilities(): Promise<{
    available: "readily" | "after-download" | "no";
    languagePairAvailable(
      sourceLanguage: string,
      targetLanguage: string,
    ): "readily" | "after-download" | "no";
  }>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    signal?: AbortSignal;
  }): Promise<AITranslator>;
}

interface AINamespace {
  languageModel?: AILanguageModelFactory;
  summarizer?: AISummarizerFactory;
  translator?: AITranslatorFactory;
}

// ── Availability Detection ──────────────────────────────────────────

function getAI(): AINamespace | null {
  if (typeof globalThis === "undefined") return null;
  const w = globalThis as unknown as { ai?: AINamespace };
  return w.ai ?? null;
}

export interface ChromeAICapabilities {
  available: boolean;
  promptAPI: boolean;
  summarizer: boolean;
  translator: boolean;
}

export async function isChromeAIAvailable(): Promise<ChromeAICapabilities> {
  const ai = getAI();

  if (!ai) {
    return {
      available: false,
      promptAPI: false,
      summarizer: false,
      translator: false,
    };
  }

  const [promptCaps, summarizerCaps, translatorCaps] = await Promise.all([
    ai.languageModel?.capabilities().catch(() => null),
    ai.summarizer?.capabilities().catch(() => null),
    ai.translator?.capabilities().catch(() => null),
  ]);

  const promptAPI = promptCaps?.available === "readily";
  const summarizer = summarizerCaps?.available === "readily";
  const translator = translatorCaps?.available === "readily";

  return {
    available: promptAPI || summarizer || translator,
    promptAPI,
    summarizer,
    translator,
  };
}

// ── Summarization ───────────────────────────────────────────────────

export interface ChromeAISummarizeOptions {
  type?: "key-points" | "tl;dr" | "teaser" | "headline";
  format?: "plain-text" | "markdown";
  length?: "short" | "medium" | "long";
  context?: string;
  signal?: AbortSignal;
}

export async function chromeAISummarize(
  text: string,
  options?: ChromeAISummarizeOptions,
): Promise<string> {
  const ai = getAI();
  if (!ai?.summarizer) {
    throw new Error("Chrome AI Summarizer is not available");
  }

  const caps = await ai.summarizer.capabilities();
  if (caps.available === "no") {
    throw new Error("Chrome AI Summarizer is not supported on this device");
  }

  // Build create options without passing undefined values
  const createOpts: {
    type: "key-points" | "tl;dr" | "teaser" | "headline";
    format: "plain-text" | "markdown";
    length: "short" | "medium" | "long";
    signal?: AbortSignal;
  } = {
    type: options?.type ?? "tl;dr",
    format: options?.format ?? "plain-text",
    length: options?.length ?? "medium",
  };
  if (options?.signal) {
    createOpts.signal = options.signal;
  }

  const summarizer = await ai.summarizer.create(createOpts);

  try {
    // Build summarize options without undefined values
    const summarizeOpts: { signal?: AbortSignal; context?: string } = {};
    if (options?.signal) {
      summarizeOpts.signal = options.signal;
    }
    if (options?.context) {
      summarizeOpts.context = options.context;
    }

    const result = await summarizer.summarize(text, summarizeOpts);
    return result;
  } finally {
    summarizer.destroy();
  }
}

// ── Translation ─────────────────────────────────────────────────────

export interface ChromeAITranslateOptions {
  signal?: AbortSignal;
}

export async function chromeAITranslate(
  text: string,
  from: string,
  to: string,
  options?: ChromeAITranslateOptions,
): Promise<string> {
  const ai = getAI();
  if (!ai?.translator) {
    throw new Error("Chrome AI Translator is not available");
  }

  const caps = await ai.translator.capabilities();
  if (caps.available === "no") {
    throw new Error("Chrome AI Translator is not supported on this device");
  }

  const pairAvailable = caps.languagePairAvailable(from, to);
  if (pairAvailable === "no") {
    throw new Error(`Translation from "${from}" to "${to}" is not supported`);
  }

  // Build create options without passing undefined values
  const createOpts: {
    sourceLanguage: string;
    targetLanguage: string;
    signal?: AbortSignal;
  } = {
    sourceLanguage: from,
    targetLanguage: to,
  };
  if (options?.signal) {
    createOpts.signal = options.signal;
  }

  const translator = await ai.translator.create(createOpts);

  try {
    const translateOpts: { signal?: AbortSignal } = {};
    if (options?.signal) {
      translateOpts.signal = options.signal;
    }

    const result = await translator.translate(text, translateOpts);
    return result;
  } finally {
    translator.destroy();
  }
}

// ── Prompt API (Small Completions) ──────────────────────────────────

export interface ChromeAIPromptOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
}

export async function chromeAIPrompt(
  prompt: string,
  options?: ChromeAIPromptOptions,
): Promise<string> {
  const ai = getAI();
  if (!ai?.languageModel) {
    throw new Error("Chrome AI Prompt API is not available");
  }

  const caps = await ai.languageModel.capabilities();
  if (caps.available === "no") {
    throw new Error("Chrome AI Prompt API is not supported on this device");
  }

  // Build create options without passing undefined values
  const createOpts: {
    systemPrompt?: string;
    temperature?: number;
    topK?: number;
    signal?: AbortSignal;
  } = {};
  if (options?.systemPrompt) {
    createOpts.systemPrompt = options.systemPrompt;
  }
  if (options?.temperature !== undefined) {
    createOpts.temperature = options.temperature;
  }
  if (options?.topK !== undefined) {
    createOpts.topK = options.topK;
  }
  if (options?.signal) {
    createOpts.signal = options.signal;
  }

  const session = await ai.languageModel.create(createOpts);

  try {
    const promptOpts: { signal?: AbortSignal } = {};
    if (options?.signal) {
      promptOpts.signal = options.signal;
    }

    const result = await session.prompt(prompt, promptOpts);
    return result;
  } finally {
    session.destroy();
  }
}

// ── Streaming Prompt API ────────────────────────────────────────────

export async function chromeAIPromptStream(
  prompt: string,
  options?: ChromeAIPromptOptions,
): Promise<ReadableStream<string>> {
  const ai = getAI();
  if (!ai?.languageModel) {
    throw new Error("Chrome AI Prompt API is not available");
  }

  const caps = await ai.languageModel.capabilities();
  if (caps.available === "no") {
    throw new Error("Chrome AI Prompt API is not supported on this device");
  }

  // Build create options without passing undefined values
  const createOpts: {
    systemPrompt?: string;
    temperature?: number;
    topK?: number;
    signal?: AbortSignal;
  } = {};
  if (options?.systemPrompt) {
    createOpts.systemPrompt = options.systemPrompt;
  }
  if (options?.temperature !== undefined) {
    createOpts.temperature = options.temperature;
  }
  if (options?.topK !== undefined) {
    createOpts.topK = options.topK;
  }
  if (options?.signal) {
    createOpts.signal = options.signal;
  }

  const session = await ai.languageModel.create(createOpts);

  // Build prompt options without undefined values
  const promptOpts: { signal?: AbortSignal } = {};
  if (options?.signal) {
    promptOpts.signal = options.signal;
  }

  // Return the stream. Caller is responsible for reading it.
  // Session cleanup happens when the stream is consumed or aborted.
  return session.promptStreaming(prompt, promptOpts);
}
