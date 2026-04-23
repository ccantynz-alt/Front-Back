// ── /docs/collaboration/yjs-crdts ────────────────────────────────────
//
// Deep dive on the Yjs shared-document endpoint at
// `apps/api/src/realtime/yjs-server.ts`. Describes the real
// single-node in-memory doc store, initial state sync via
// Y.encodeStateAsUpdate, and the broadcast-on-update loop. Honest
// about the planned Durable Object persistence (BLK-011 🔵 PLANNED).

import type { JSX } from "solid-js";
import { SEOHead } from "../../../components/SEOHead";
import {
  DocsArticle,
  Steps,
  Callout,
  KeyList,
} from "../../../components/docs/DocsArticle";

export default function YjsCrdtsArticle(): JSX.Element {
  return (
    <>
      <SEOHead
        title="Yjs CRDT documents"
        description="How Crontech syncs Yjs shared documents over WebSocket. Initial state encoding, update broadcast, and the in-memory doc store — grounded in the real apps/api/src/realtime/yjs-server.ts implementation."
        path="/docs/collaboration/yjs-crdts"
      />

      <DocsArticle
        eyebrow="Collaboration"
        title="Yjs CRDT documents"
        subtitle="A Yjs shared document is a conflict-free data structure that every client can edit at once and still converge on the same state. Crontech ships a small, honest WebSocket server that syncs them. Here's exactly what it does."
        readTime="3 min"
        updated="April 2026"
        nextStep={{
          label: "Presence and cursors",
          href: "/docs/collaboration/presence-and-cursors",
          description:
            "CRDTs solve the document-state problem. The next article covers the cursor and presence problem, which is solved by a separate, simpler room manager.",
        }}
      >
        <p>
          The Yjs server lives in{" "}
          <code>apps/api/src/realtime/yjs-server.ts</code> and
          exposes a single WebSocket route:
        </p>

        <pre>
          <code>GET /api/yjs/:roomId</code>
        </pre>

        <p>
          A room id is a free-form string you pick — typically the id
          of the document you're editing ("doc-abc123"). Every client
          that connects with the same room id shares a single{" "}
          <code>Y.Doc</code> on the server.
        </p>

        <h2>What happens when a client connects</h2>

        <Steps>
          <li>
            The server looks up the room's <code>Y.Doc</code> in the
            in-memory <code>docs</code> map. If none exists, a fresh{" "}
            <code>Y.Doc</code> is created and stored under the room
            id.
          </li>
          <li>
            The new connection is added to the room's set of WebSocket
            peers (the <code>roomConnections</code> map).
          </li>
          <li>
            The server encodes the current document state with{" "}
            <code>Y.encodeStateAsUpdate(doc)</code> and sends it as
            the first binary frame on the socket. This lets the
            client hydrate its local Y.Doc to the server's current
            state before it starts making edits.
          </li>
        </Steps>

        <Callout tone="info">
          The initial-state frame is the only piece of "protocol" the
          server adds on top of raw Yjs. Everything after it is just
          update frames — the same update bytes the Yjs client uses
          locally.
        </Callout>

        <h2>What happens when a client edits</h2>

        <p>
          When a client makes an edit, the Yjs client library encodes
          the mutation as a Yjs update and sends it as a binary frame
          on the WebSocket. The server's <code>onMessage</code>{" "}
          handler does two things:
        </p>

        <Steps>
          <li>
            Applies the update to the server's <code>Y.Doc</code>{" "}
            with <code>Y.applyUpdate(doc, update)</code>. This keeps
            the server's copy in sync with the client's.
          </li>
          <li>
            Broadcasts the same update bytes to every other open
            WebSocket in the room. Peers apply the update locally and
            converge. The sender is excluded from the broadcast — it
            already has the change.
          </li>
        </Steps>

        <p>
          There is no diff, no conflict detection, no merge. Yjs is a
          CRDT — applying the same updates in any order on any peer
          yields the same state. The server's job is just to be a
          fast, reliable relay.
        </p>

        <h2>What happens when a client disconnects</h2>

        <p>
          The <code>onClose</code> handler removes the socket from
          the room's peer set. If the room has no remaining
          connections, the entry is removed from{" "}
          <code>roomConnections</code>, but the <code>Y.Doc</code>{" "}
          itself is kept in memory so that a reconnecting client
          sees the last known state.
        </p>

        <Callout tone="warn">
          Because the doc is in-memory, it does not survive a server
          restart. Clients that reconnect after a restart will see a
          fresh empty doc for that room. Durable Object-backed
          persistence is on the roadmap (BLK-011 🔵 PLANNED) — until
          then, persist any document state you care about via a
          separate mechanism (tRPC snapshot procedure, periodic
          write to Turso, etc).
        </Callout>

        <h2>Client-side wiring</h2>

        <p>
          The standard pattern on the client is{" "}
          <code>y-websocket</code> with the URL pointing at the
          Crontech endpoint:
        </p>

        <KeyList
          items={[
            {
              term: "Browser",
              description:
                "Install the yjs and y-websocket packages. Construct a Y.Doc, then connect it to the server with `new WebsocketProvider('wss://your-api.crontech.app/api/yjs', roomId, doc)`. The provider handles reconnection, awareness, and the initial-state frame transparently.",
            },
            {
              term: "SolidStart integration",
              description:
                "Wrap the provider in a SolidJS createResource + signal so your components re-render when the Y.Doc changes. Any YText, YMap, or YArray you observe will emit updates on every applied change.",
            },
          ]}
        />

        <h2>Stats and introspection</h2>
        <p>
          The module exports a <code>yjsRoomManager</code> helper
          with two methods — <code>getRooms()</code> and{" "}
          <code>getConnectionCount(roomId)</code> — for server-side
          introspection. They're useful for dashboard tiles that
          count active collaborators per document.
        </p>

        <Callout tone="note">
          The Yjs server is intentionally separate from the room
          manager at <code>/ws</code>. Yjs owns structured document
          state; the room manager owns presence and cursors. Running
          both in parallel against the same room id is the expected
          shape.
        </Callout>
      </DocsArticle>
    </>
  );
}
