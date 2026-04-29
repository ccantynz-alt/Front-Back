/**
 * The narrow `fetch` shape the HTTP clients depend on. Defining it here
 * keeps us decoupled from environment-specific extensions (Bun adds
 * `preconnect`, browsers do not) — anything that conforms to RFC-style
 * fetch will plug in.
 */
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
