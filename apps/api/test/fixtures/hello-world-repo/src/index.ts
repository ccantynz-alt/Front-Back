// BLK-009 fixture — the smallest TypeScript program that can be
// produced by `bun build` so the integration test has a real, honest
// install + build artefact to prove the pipeline.
export function greet(name: string): string {
  return `hello, ${name}`;
}

// Log once on execution so stdout capture in the real build-runner has
// at least one line to record.
// biome-ignore lint/suspicious/noConsole: fixture entrypoint
console.log(greet("crontech"));
