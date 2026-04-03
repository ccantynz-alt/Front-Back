# ADR-003: Three-Tier Compute Model (Client GPU, Edge, Cloud)

## Status: accepted

## Date: 2026-04-03

## Context

AI workloads vary enormously in cost, latency, and compute requirements.
A summarization task on a small model can run in the browser for free. A
fine-tuning job requires H100 GPUs. Treating all AI workloads the same — by
routing everything to a cloud API — wastes money, adds latency, and creates a
single point of failure.

No existing platform unifies client-side GPU compute (WebGPU), edge compute
(Cloudflare Workers), and cloud GPU compute (Modal.com) into a single,
automatically-routed compute fabric. This is our primary architectural
differentiator.

Key requirements:

- Zero-dollar inference for models under 2B parameters via client-side WebGPU.
- Sub-50ms latency for lightweight inference at the edge.
- Full H100 power available on demand for heavy workloads.
- Automatic routing: the developer specifies intent, not infrastructure.
- Graceful fallback: if a tier is unavailable, the next tier picks up the work.

## Decision

We implement a **three-tier compute model** with automatic smart routing:

```
CLIENT GPU (WebGPU) → EDGE (Cloudflare Workers) → CLOUD (Modal.com GPUs)
     $0/token            sub-50ms                    Full H100 power
     sub-10ms            lightweight inference        heavy inference
     models <2B          Workers AI + Hono            training + video
```

**Tier 1 — Client GPU (WebGPU + WebLLM + Transformers.js):**
The user's GPU runs small models (under 2B parameters) at zero cost. WebLLM
provides LLM inference; Transformers.js provides embeddings, classification,
and summarization. Latency is sub-10ms because there is no network hop.

**Tier 2 — Edge (Cloudflare Workers + Workers AI + Hono):**
Mid-range tasks that exceed client GPU capacity run at the nearest edge node
(330+ cities). Sub-5ms cold starts. Turso embedded replicas provide data
co-located with compute. Handles models up to ~7B parameters.

**Tier 3 — Cloud (Modal.com with H100 GPUs):**
Heavy inference, fine-tuning, training, and video processing. Scale-to-zero
means no idle costs. Scale-to-thousands means no capacity ceiling.

**Smart routing** evaluates each request against:

1. Device capability (WebGPU available? Sufficient VRAM?).
2. Model size (under 2B? under 7B? larger?).
3. Latency requirements (real-time UI vs. background job).
4. Cost optimization (always prefer the cheapest tier that meets constraints).

**Fallback chain** ensures zero dropped requests:

- Client GPU unavailable → edge picks it up.
- Edge overloaded → cloud picks it up.
- Cloud overloaded → queue and notify. Never drop.

## Consequences

**Positive:**

- Massive cost reduction. Client-side inference is free. Edge inference is
  fractions of a cent. Cloud GPU is used only when necessary.
- Latency reduction. Most requests never leave the client or the nearest edge
  node.
- Resilience. Three independent tiers mean no single point of failure.
- Competitive moat. No other platform offers this unified compute model.

**Negative:**

- Complexity. Three deployment targets with different capabilities require
  careful abstraction so developers do not need to think about tiers.
  Mitigation: the smart router is an internal system; the developer API is a
  single function call.
- WebGPU browser support is not universal (as of 2026, Chrome, Edge, and
  Firefox support it; Safari support is partial). Mitigation: the fallback
  chain handles this automatically.
- Testing across three tiers requires integration tests at each level.
  Mitigation: CI runs tier-specific test suites.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Cloud-only (e.g., AWS SageMaker / OpenAI API)** | Every token costs money. Every request has network latency. No offline capability. No cost advantage. |
| **Edge-only (Cloudflare Workers AI)** | Cannot handle heavy workloads (large models, fine-tuning, video processing). Limited model selection. |
| **Client-only (WebGPU)** | Not all devices have capable GPUs. Cannot run models larger than ~2B parameters in the browser. |
| **Two-tier (client + cloud)** | Misses the edge layer, which handles the sweet spot of mid-range tasks at low latency and low cost. |
