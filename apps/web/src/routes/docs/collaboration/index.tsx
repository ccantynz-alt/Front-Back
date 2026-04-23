// ── /docs/collaboration — Category overview ─────────────────────────
//
// Landing article for the Collaboration category. Maps the real-time
// primitives shipped today — Yjs shared docs over WebSocket, the
// in-process RoomManager, SSE observers — and points users at the
// two deep-dive articles. Honest about the single-node in-memory
// model and the Durable Object persistence that is planned
// (BLK-011 🔵 PLANNED).

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function CollaborationOverviewArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Collaboration"
        description="Real-time multi-user primitives on Crontech: Yjs CRDT documents, presence, cursors, and the SSE read-only stream. An honest map of what's shipped and what's planned."
        path="/docs/collaboration"
      />

      <DocsArticle
        eyebrow="Collaboration"
        title="Collaboration"
        subtitle="Crontech ships three real-time primitives: Yjs shared documents over WebSocket, a presence + cursor room manager, and an SSE stream for read-only observers. This is the map of what each one does and when to reach for it."
        readTime="2 min"
        updated="April 2026"
        nextStep={{
          label: "Yjs CRDT documents",
          href: "/docs/collaboration/yjs-crdts",
          description:
            "How shared Yjs documents are synced over WebSocket, how initial state is sent, and what 'persistence' means on the platform today.",
        }}
      >
        <p>
          Collaboration on Crontech is built on three subsystems in{" "}
          <code>apps/api/src/realtime/</code>. They share no code —
          they are three separate bets on different use cases — and
          you pick the one that matches the shape of the problem you
          are solving.
        </p>

        <Callout tone="info">
          All three primitives run in-process on a single-node Bun
          server today. This works for dev and for real single-server
          deployments. The Durable Object-backed multi-region
          variant is BLK-011 🔵 PLANNED — not shipped. The overview
          below names the gap explicitly where it matters.
        </Callout>

        <h2>The three primitives</h2>

        <KeyList
          items={[
            {
              term: "Yjs shared documents",
              description:
                "A WebSocket endpoint at /api/yjs/:roomId that syncs a Y.Doc across every client in the room. Implemented in apps/api/src/realtime/yjs-server.ts. Use this when you want conflict-free collaborative editing over a structured document.",
            },
            {
              term: "Presence + cursors + broadcast",
              description:
                "A general-purpose room manager at /ws that exchanges JSON messages for user presence, cursor positions, and arbitrary broadcasts. Implemented in apps/api/src/realtime/websocket.ts + rooms.ts. Use this when you want live cursors, typing indicators, or 'who's viewing this page' badges without the full CRDT machinery.",
            },
            {
              term: "SSE read-only stream",
              description:
                "A Server-Sent Events endpoint at /realtime/events/:roomId that pushes every server-originated message for a room without requiring the client to authenticate as a room member. Implemented in apps/api/src/realtime/sse.ts. Use this for dashboards, read-only observers, or anywhere WebSockets can't be used.",
            },
          ]}
        />

        <h2>What's in this category</h2>

        <KeyList
          items={[
            {
              term: "Yjs CRDT documents",
              description:
                "Deep dive on the shared-document endpoint. How initial state is encoded via Y.encodeStateAsUpdate, how updates are applied and rebroadcast, and what happens when a room goes idle.",
            },
            {
              term: "Presence and cursors",
              description:
                "Deep dive on the room manager. Message schemas (validated by Zod), the heartbeat timeout that evicts dead connections, the 100-user-per-room cap, and how SSE subscribers receive the same stream.",
            },
          ]}
        />

        <h2>Guarantees the platform makes</h2>

        <KeyList
          items={[
            {
              term: "Every message is validated",
              description:
                "Both the room manager and the Yjs endpoint validate inbound payloads before applying them. The room manager uses a discriminated ClientMessage Zod schema in apps/api/src/realtime/types.ts. The Yjs endpoint rejects anything that isn't an ArrayBuffer or Uint8Array.",
            },
            {
              term: "Dead connections are evicted",
              description:
                "The room manager runs a heartbeat loop every 10 seconds and drops any user whose last ping was more than 30 seconds ago. A client that vanishes from the network does not linger as a ghost cursor.",
            },
            {
              term: "Bounded rooms",
              description:
                "The room manager caps rooms at 100 concurrent users. Attempts to exceed the cap return a room_not_found error with the message 'Room is full'.",
            },
            {
              term: "Graceful shutdown",
              description:
                "On server shutdown, every WebSocket is closed with code 1001 and every SSE stream is aborted. No connections are orphaned into the next process.",
            },
          ]}
        />

        <Callout tone="note">
          Durable Object-backed rooms are on the roadmap. Today, if
          you scale to more than one Bun server, the rooms are
          process-local — two users on different nodes won't see each
          other. For single-server deployments this is a non-issue.
          The Collaboration section will get a third article once
          Durable Object persistence lands.
        </Callout>

        <h2>Where to start</h2>
        <p>
          If you're building a collaborative editor, start with{" "}
          <a href="/docs/collaboration/yjs-crdts">Yjs CRDT documents</a>
          . If you're adding live cursors to a dashboard or
          implementing a "who's here" badge, start with{" "}
          <a href="/docs/collaboration/presence-and-cursors">
            Presence and cursors
          </a>
          .
        </p>
      </DocsArticle>
    </>
  );
}
