/**
 * Object-storage client for call recordings. The real implementation
 * uploads to R2 / S3-compatible storage and returns a signed URL. The
 * mock just echoes a synthetic URL.
 */
export interface RecordingStorage {
  put(key: string, audio: ArrayBuffer | Uint8Array): Promise<string>;
}

export class MockRecordingStorage implements RecordingStorage {
  uploads: Array<{ key: string; size: number }> = [];

  async put(key: string, audio: ArrayBuffer | Uint8Array): Promise<string> {
    const size = audio instanceof ArrayBuffer ? audio.byteLength : audio.byteLength;
    this.uploads.push({ key, size });
    return `mock-storage://recordings/${key}`;
  }
}

export interface TranscriptionClient {
  transcribe(audioUrl: string): Promise<{ text: string; language?: string }>;
}

export class MockTranscriptionClient implements TranscriptionClient {
  calls: string[] = [];

  async transcribe(audioUrl: string): Promise<{ text: string; language: string }> {
    this.calls.push(audioUrl);
    return {
      text: `mock transcription of ${audioUrl}`,
      language: "en-US",
    };
  }
}
