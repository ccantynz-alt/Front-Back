// ── /docs/collaboration/presence-and-cursors ─────────────────────────
//
// Deep dive on the presence + cursor room manager. Grounded in:
//   • apps/api/src/realtime/websocket.ts — the /ws endpoint
//   • apps/api/src/realtime/rooms.ts — the RoomManager class
//   • apps/api/src/realtime/types.ts — the Zod message schemas
//   • apps/api/src/realtime/sse.ts — the read-only SSE relay
// Honest about the in-process single-server design and the 100-user
// room cap.

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function PresenceAndCursorsArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Presence and cursors"
        description="How Crontech exchanges live presence and cursor state over WebSocket and Server-Sent Events. The real message schemas, heartbeat logic, and room caps from the shipped implementation."
        path="/docs/collaboration/presence-and-cursors"
      />

      <DocsArticle
        eyebrow="Collaboration"
        title="Presence and cursors"
        subtitle="Crontech ships a general-purpose room manager separate from the Yjs endpoint. It owns cursor positions, presence (active / idle / away), and arbitrary broadcast messages. This is how it works on the wire."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Collaboration overview",
          href: "/docs/collaboration",
          description:
            "Back to the category landing for a map of all three real-time primitives and when to reach for each.",
        }}
      >
        <p>
          The room manager lives at <code>/ws</code> on the API and is
          implemented across three files:
        </p>

        <KeyList
          items={[
            {
              term: "apps/api/src/realtime/websocket.ts",
              description:
                "The Hono route. Upgrades the HTTP request to a WebSocket, parses every inbound frame as JSON, and validates it against the ClientMessage Zod schema before routing it to the room manager.",
            },
            {
              term: "apps/api/src/realtime/rooms.ts",
              description:
                "The RoomManager class. Holds the in-memory map of roomId → userId → RoomUser, runs the heartbeat eviction loop, and broadcasts every mutation to both WebSocket peers and SSE subscribers.",
            },
            {
              term: "apps/api/src/realtime/types.ts",
              description:
                "The Zod schemas. Every inbound message type (join_room, leave_room, broadcast, cursor_move, presence_update, ping) is a discriminated union member, so a malformed payload is caught at the boundary.",
            },
          ]}
        />

        <h2>The message protocol</h2>

        <p>
          A client joins a room, updates its state, and leaves. Every
          step is a JSON message matching a Zod-defined shape. Here's
          the typical sequence:
        </p>

        <Steps>
          <li>
            Connect to <code>wss://your-api.crontech.app/ws</code>.
            The server responds with a <code>pong</code> frame to
            confirm the socket is alive.
          </li>
          <li>
            Send a <code>join_room</code> message with a{" "}
            <code>roomId</code> (any string up to 255 chars), a{" "}
            <code>userId</code> (must be a UUID), and optional{" "}
            <code>metadata</code> (displayName + color for cursor
            rendering).
          </li>
          <li>
            The server responds with a <code>room_joined</code>{" "}
            message that lists every user currently in the room. Every
            other user gets a <code>user_joined</code> notification at
            the same time.
          </li>
          <li>
            Send <code>cursor_move</code> whenever the local cursor
            moves, <code>presence_update</code> when the user's
            activity state changes, and <code>broadcast</code> for any
            custom payload.
          </li>
          <li>
            Send <code>ping</code> every ~10 seconds. The server
            records the ping against your user and replies with{" "}
            <code>pong</code>. Miss three pings and the server will
            disconnect you as dead.
          </li>
          <li>
            Send <code>leave_room</code> to leave cleanly, or just
            close the socket — both trigger{" "}
            <code>user_left</code> notifications to the rest of the
            room.
          </li>
        </Steps>

        <h2>Guarantees and limits</h2>

        <KeyList
          items={[
            {
              term: "100 users per room",
              description:
                "RoomManager.MAX_USERS_PER_ROOM is a hard cap. The 101st join returns a room_not_found error with the message 'Room is full'. Rooms are named freely, so scale out by partitioning into sub-rooms.",
            },
            {
              term: "30-second heartbeat timeout",
              description:
                "A user whose lastPing is older than 30 seconds is evicted from every room they're in. The eviction loop runs every 10 seconds. A user_left notification fires for every eviction so peers see them disappear.",
            },
            {
              term: "Rejoin-safe",
              description:
                "If the same userId joins a room they're already in, the previous WebSocket is closed with code 1000 ('Replaced by new connection') and the new socket takes over. Browser tabs that reconnect after a sleep don't create ghost users.",
            },
            {
              term: "Zod-validated everything",
              description:
                "Every inbound frame is parsed as JSON and validated against ClientMessage. Malformed JSON returns an invalid_message error. Schema violations return an invalid_message error with the Zod issue list. No raw payloads reach the room manager.",
            },
          ]}
        />

        <Callout tone="info">
          The error codes the server returns are an enum: invalid_message,
          room_not_found, unauthorized, rate_limited, internal_error.
          Client code can pattern-match on them without parsing prose.
        </Callout>

        <h2>Read-only observers via SSE</h2>

        <p>
          If you want a dashboard to watch a room without joining it —
          say, an admin view that shows every active room and who's
          in them — use the SSE endpoint instead:
        </p>

        <pre>
          <code>GET /realtime/events/:roomId</code>
        </pre>

        <p>
          Implemented in <code>apps/api/src/realtime/sse.ts</code>,
          this endpoint opens a Server-Sent Events stream and
          forwards every server-originated message for the room:
          cursor updates, presence syncs, user joined / left,
          broadcasts. SSE observers are not room members — they
          cannot send messages — and they don't count against the
          100-user room cap.
        </p>

        <KeyList
          items={[
            {
              term: "Initial frame",
              description:
                "On connect, the endpoint pushes a 'connected' event with the current user list, so the client can paint the initial state before any deltas arrive.",
            },
            {
              term: "Keep-alive",
              description:
                "A 'keepalive' frame is sent every 15 seconds to defeat load balancer and proxy idle timeouts. The client should ignore it — it carries no state.",
            },
            {
              term: "Event names",
              description:
                "Cursor updates are mapped to 'cursor', presence syncs to 'presence', joins/leaves/broadcasts to 'update', and errors to 'notification'. Listen on EventSource with addEventListener('cursor', ...) for typed dispatch.",
            },
          ]}
        />

        <h2>Handy REST helpers</h2>

        <KeyList
          items={[
            {
              term: "GET /realtime/rooms/:roomId/users",
              description:
                "Returns { roomId, users, count } without opening a subscription. Useful for 'who's viewing this page' badges that don't need live updates.",
            },
            {
              term: "GET /realtime/stats",
              description:
                "Returns the server's { rooms, users, timestamp } totals. The dashboard's real-time health tile is a thin wrapper over this endpoint.",
            },
          ]}
        />

        <Callout tone="note">
          The room manager is process-local today. Two Bun nodes do
          not share rooms. For single-server deployments this is a
          non-issue; multi-region collaboration is on the roadmap
          (BLK-011 🔵 PLANNED) behind a Durable Object-backed
          variant. The article will be updated when it ships.
        </Callout>
      </DocsArticle>
    </>
  );
}
