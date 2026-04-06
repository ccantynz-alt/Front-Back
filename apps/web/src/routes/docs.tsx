import { createSignal, For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Title } from "@solidjs/meta";
import { Button, Card, Stack, Text, Badge } from "@back-to-the-future/ui";

// ── Types ───────────────────────────────────────────────────────────

interface EndpointDoc {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  requestBody?: string;
  responseFormat: string;
  curl: string;
}

interface EndpointCategory {
  name: string;
  description: string;
  endpoints: EndpointDoc[];
}

// ── API Documentation Data ──────────────────────────────────────────

const API_CATEGORIES: EndpointCategory[] = [
  {
    name: "Auth",
    description: "Authentication via passkeys (WebAuthn/FIDO2). Phishing-immune, passwordless authentication.",
    endpoints: [
      {
        method: "POST",
        path: "/api/trpc/auth.register.start",
        description: "Start passkey registration. Returns WebAuthn creation options.",
        requestBody: `z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
})`,
        responseFormat: `{ options: PublicKeyCredentialCreationOptions, userId: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/auth.register.start \\
  -H "Content-Type: application/json" \\
  -H "X-CSRF-Token: <token>" \\
  -d '{"json":{"email":"user@example.com","displayName":"John Doe"}}'`,
      },
      {
        method: "POST",
        path: "/api/trpc/auth.register.finish",
        description: "Complete passkey registration with the authenticator response.",
        requestBody: `z.object({
  userId: z.string().uuid(),
  response: RegistrationResponseJSON,
})`,
        responseFormat: `{ verified: boolean, token: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/auth.register.finish \\
  -H "Content-Type: application/json" \\
  -H "X-CSRF-Token: <token>" \\
  -d '{"json":{"userId":"<uuid>","response":{...}}}'`,
      },
      {
        method: "POST",
        path: "/api/trpc/auth.login.start",
        description: "Start passkey login. Returns WebAuthn request options.",
        requestBody: `z.object({
  email: z.string().email().optional(),
}).optional()`,
        responseFormat: `{ options: PublicKeyCredentialRequestOptions, userId: string | null }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/auth.login.start \\
  -H "Content-Type: application/json" \\
  -H "X-CSRF-Token: <token>" \\
  -d '{"json":{"email":"user@example.com"}}'`,
      },
      {
        method: "POST",
        path: "/api/trpc/auth.login.finish",
        description: "Complete passkey login and receive a session token.",
        requestBody: `z.object({
  userId: z.string().uuid().nullable(),
  response: AuthenticationResponseJSON,
})`,
        responseFormat: `{ verified: boolean, token: string, userId: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/auth.login.finish \\
  -H "Content-Type: application/json" \\
  -H "X-CSRF-Token: <token>" \\
  -d '{"json":{"userId":"<uuid>","response":{...}}}'`,
      },
      {
        method: "POST",
        path: "/api/trpc/auth.logout",
        description: "Log out the current session. Requires authentication.",
        responseFormat: `{ success: boolean }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/auth.logout \\
  -H "Authorization: Bearer <session_token>"`,
      },
      {
        method: "GET",
        path: "/api/trpc/auth.me",
        description: "Get the current authenticated user profile.",
        responseFormat: `{ id: string, email: string, displayName: string, role: string, createdAt: Date }`,
        curl: `curl http://localhost:3001/api/trpc/auth.me \\
  -H "Authorization: Bearer <session_token>"`,
      },
    ],
  },
  {
    name: "Users",
    description: "User management CRUD operations.",
    endpoints: [
      {
        method: "GET",
        path: "/api/trpc/users.list",
        description: "List users with cursor-based pagination.",
        requestBody: `z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
})`,
        responseFormat: `{ items: User[], nextCursor: string | null, total: number }`,
        curl: `curl "http://localhost:3001/api/trpc/users.list?input=%7B%22json%22%3A%7B%22limit%22%3A20%7D%7D"`,
      },
      {
        method: "GET",
        path: "/api/trpc/users.getById",
        description: "Get a user by ID.",
        requestBody: `z.object({ id: z.string().uuid() })`,
        responseFormat: `User`,
        curl: `curl "http://localhost:3001/api/trpc/users.getById?input=%7B%22json%22%3A%7B%22id%22%3A%22<uuid>%22%7D%7D"`,
      },
      {
        method: "POST",
        path: "/api/trpc/users.create",
        description: "Create a new user.",
        requestBody: `z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
})`,
        responseFormat: `User`,
        curl: `curl -X POST http://localhost:3001/api/trpc/users.create \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"email":"user@example.com","displayName":"Jane","role":"editor"}}'`,
      },
      {
        method: "POST",
        path: "/api/trpc/users.update",
        description: "Update an existing user.",
        requestBody: `z.object({
  id: z.string().uuid(),
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(100).optional(),
  role: z.enum(["admin", "editor", "viewer"]).optional(),
})`,
        responseFormat: `User`,
        curl: `curl -X POST http://localhost:3001/api/trpc/users.update \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"id":"<uuid>","displayName":"Updated Name"}}'`,
      },
      {
        method: "POST",
        path: "/api/trpc/users.delete",
        description: "Delete a user by ID.",
        requestBody: `z.object({ id: z.string().uuid() })`,
        responseFormat: `{ success: true, id: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/users.delete \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"id":"<uuid>"}}'`,
      },
    ],
  },
  {
    name: "Billing",
    description: "Subscription plans, Stripe checkout, and customer portal.",
    endpoints: [
      {
        method: "GET",
        path: "/api/trpc/billing.getPlans",
        description: "List all active subscription plans.",
        responseFormat: `Plan[]  // { id, name, description, price, interval, features }`,
        curl: `curl http://localhost:3001/api/trpc/billing.getPlans`,
      },
      {
        method: "GET",
        path: "/api/trpc/billing.getSubscription",
        description: "Get the current user's subscription details. Requires auth.",
        responseFormat: `{ status: string, plan: string, stripeSubscriptionId: string | null, currentPeriodEnd: Date | null }`,
        curl: `curl http://localhost:3001/api/trpc/billing.getSubscription \\
  -H "Authorization: Bearer <token>"`,
      },
      {
        method: "POST",
        path: "/api/trpc/billing.createCheckoutSession",
        description: "Create a Stripe checkout session for a price ID.",
        requestBody: `z.object({ priceId: z.string() })`,
        responseFormat: `{ url: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/billing.createCheckoutSession \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"priceId":"price_pro_monthly"}}'`,
      },
      {
        method: "POST",
        path: "/api/trpc/billing.createPortalSession",
        description: "Create a Stripe customer portal session for managing billing.",
        requestBody: `z.object({ customerId: z.string() })`,
        responseFormat: `{ url: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/billing.createPortalSession \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"customerId":"cus_xxxxx"}}'`,
      },
    ],
  },
  {
    name: "AI",
    description: "AI inference, chat, generative UI, and embeddings. Supports three-tier compute: client GPU, edge, and cloud.",
    endpoints: [
      {
        method: "POST",
        path: "/api/ai/chat",
        description: "Stream a chat completion response. Supports SSE streaming.",
        requestBody: `z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })),
  model: z.string().optional(),
})`,
        responseFormat: `text/event-stream  // SSE stream of token chunks`,
        curl: `curl -X POST http://localhost:3001/api/ai/chat \\
  -H "Authorization: Bearer btf_sk_<your_key>" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello"}]}'`,
      },
      {
        method: "POST",
        path: "/api/ai/generate-ui",
        description: "Generate a UI component tree from a natural language description using the Zod component catalog.",
        requestBody: `z.object({
  prompt: z.string(),
  components: z.array(z.string()).optional(),
})`,
        responseFormat: `{ componentTree: JsonRenderNode }`,
        curl: `curl -X POST http://localhost:3001/api/ai/generate-ui \\
  -H "Authorization: Bearer btf_sk_<your_key>" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"Create a pricing card with a Pro plan"}'`,
      },
      {
        method: "POST",
        path: "/api/ai/embeddings",
        description: "Generate vector embeddings for text input.",
        requestBody: `z.object({
  input: z.string().or(z.array(z.string())),
  model: z.string().optional(),
})`,
        responseFormat: `{ embeddings: number[][], dimensions: number, model: string }`,
        curl: `curl -X POST http://localhost:3001/api/ai/embeddings \\
  -H "Authorization: Bearer btf_sk_<your_key>" \\
  -H "Content-Type: application/json" \\
  -d '{"input":"Marco Reid platform"}'`,
      },
    ],
  },
  {
    name: "Collaboration",
    description: "Real-time collaboration rooms with Yjs CRDTs. Supports multi-user and AI agent participants.",
    endpoints: [
      {
        method: "POST",
        path: "/api/trpc/collab.createRoom",
        description: "Create a new collaboration room. Requires auth.",
        requestBody: `z.object({ name: z.string().min(1) })`,
        responseFormat: `{ id: string, name: string, users: string[], createdAt: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/collab.createRoom \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"name":"My Room"}}'`,
      },
      {
        method: "GET",
        path: "/api/trpc/collab.getRooms",
        description: "List all active collaboration rooms.",
        responseFormat: `Room[]`,
        curl: `curl http://localhost:3001/api/trpc/collab.getRooms`,
      },
      {
        method: "GET",
        path: "/api/trpc/collab.getRoomUsers",
        description: "Get users currently in a collaboration room.",
        requestBody: `z.object({ roomId: z.string() })`,
        responseFormat: `string[]  // user IDs`,
        curl: `curl "http://localhost:3001/api/trpc/collab.getRoomUsers?input=%7B%22json%22%3A%7B%22roomId%22%3A%22room-123%22%7D%7D"`,
      },
      {
        method: "GET",
        path: "/api/realtime/events/:roomId",
        description: "SSE stream for real-time room events (presence, updates).",
        responseFormat: `text/event-stream`,
        curl: `curl -N http://localhost:3001/api/realtime/events/room-123`,
      },
      {
        method: "GET",
        path: "ws://localhost:3001/api/yjs/:roomId",
        description: "WebSocket endpoint for Yjs CRDT sync. Connect with a Yjs WebSocket provider.",
        responseFormat: `WebSocket (binary Yjs sync protocol)`,
        curl: `# Use a WebSocket client:
wscat -c ws://localhost:3001/api/yjs/room-123`,
      },
    ],
  },
  {
    name: "Video",
    description: "Video project management and WebGPU-accelerated processing pipeline.",
    endpoints: [
      {
        method: "POST",
        path: "/api/ai/video/process",
        description: "Submit a video processing job (encoding, effects, transitions).",
        requestBody: `z.object({
  projectId: z.string(),
  operations: z.array(z.object({
    type: z.enum(["trim", "encode", "effect", "transition"]),
    params: z.record(z.unknown()),
  })),
})`,
        responseFormat: `{ jobId: string, status: "queued" }`,
        curl: `curl -X POST http://localhost:3001/api/ai/video/process \\
  -H "Authorization: Bearer btf_sk_<your_key>" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId":"proj_123","operations":[{"type":"trim","params":{"start":0,"end":10}}]}'`,
      },
    ],
  },
  {
    name: "Feature Flags",
    description: "Progressive feature delivery with user targeting and percentage rollouts.",
    endpoints: [
      {
        method: "GET",
        path: "/api/trpc/featureFlags.getAll",
        description: "List all feature flags with their evaluated state for the current user.",
        responseFormat: `Array<FeatureFlag & { evaluatedEnabled: boolean }>`,
        curl: `curl http://localhost:3001/api/trpc/featureFlags.getAll`,
      },
      {
        method: "GET",
        path: "/api/trpc/featureFlags.isEnabled",
        description: "Check if a specific feature flag is enabled.",
        requestBody: `z.object({ key: z.string() })`,
        responseFormat: `{ key: string, enabled: boolean }`,
        curl: `curl "http://localhost:3001/api/trpc/featureFlags.isEnabled?input=%7B%22json%22%3A%7B%22key%22%3A%22ai-playground%22%7D%7D"`,
      },
      {
        method: "GET",
        path: "/api/trpc/featureFlags.evaluate",
        description: "Evaluate a flag for a specific user ID.",
        requestBody: `z.object({
  flagKey: z.string(),
  userId: z.string().optional(),
})`,
        responseFormat: `{ key: string, enabled: boolean, flag: FeatureFlag | null }`,
        curl: `curl "http://localhost:3001/api/trpc/featureFlags.evaluate?input=%7B%22json%22%3A%7B%22flagKey%22%3A%22video-editor%22%2C%22userId%22%3A%22user_123%22%7D%7D"`,
      },
    ],
  },
  {
    name: "API Keys",
    description: "Manage API keys for programmatic access. Keys use the btf_sk_ prefix.",
    endpoints: [
      {
        method: "POST",
        path: "/api/trpc/apiKeys.create",
        description: "Generate a new API key. The raw key is returned only once.",
        requestBody: `z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.date().optional(),
})`,
        responseFormat: `{ id: string, name: string, prefix: string, rawKey: string, createdAt: string, expiresAt: string | null }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/apiKeys.create \\
  -H "Authorization: Bearer <session_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"name":"Production Key"}}'`,
      },
      {
        method: "GET",
        path: "/api/trpc/apiKeys.list",
        description: "List all API keys for the authenticated user (values are masked).",
        responseFormat: `Array<{ id, name, prefix, maskedKey, lastUsedAt, expiresAt, createdAt }>`,
        curl: `curl http://localhost:3001/api/trpc/apiKeys.list \\
  -H "Authorization: Bearer <session_token>"`,
      },
      {
        method: "POST",
        path: "/api/trpc/apiKeys.revoke",
        description: "Revoke an API key permanently.",
        requestBody: `z.object({ id: z.string().uuid() })`,
        responseFormat: `{ success: true, id: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/apiKeys.revoke \\
  -H "Authorization: Bearer <session_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"id":"<key_uuid>"}}'`,
      },
    ],
  },
  {
    name: "Webhooks",
    description: "Outgoing webhook management. Receive HTTP callbacks when events occur.",
    endpoints: [
      {
        method: "POST",
        path: "/api/trpc/webhooks.create",
        description: "Register a webhook URL for specific events. Returns signing secret once.",
        requestBody: `z.object({
  url: z.string().url(),
  events: z.array(z.enum([
    "project.created", "project.updated", "project.deleted",
    "build.started", "build.completed", "build.failed",
    "deployment.created", "deployment.ready",
    "collaboration.joined", "collaboration.left",
    "ai.job.completed", "video.render.completed",
  ])).min(1),
})`,
        responseFormat: `{ id: string, url: string, events: string[], secret: string, isActive: boolean }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/webhooks.create \\
  -H "Authorization: Bearer <session_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"url":"https://example.com/webhook","events":["build.completed"]}}'`,
      },
      {
        method: "GET",
        path: "/api/trpc/webhooks.list",
        description: "List all registered webhooks for the current user.",
        responseFormat: `Array<{ id, url, events, isActive, createdAt }>`,
        curl: `curl http://localhost:3001/api/trpc/webhooks.list \\
  -H "Authorization: Bearer <session_token>"`,
      },
      {
        method: "POST",
        path: "/api/trpc/webhooks.delete",
        description: "Remove a webhook registration.",
        requestBody: `z.object({ id: z.string().uuid() })`,
        responseFormat: `{ success: true, id: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/webhooks.delete \\
  -H "Authorization: Bearer <session_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"id":"<webhook_uuid>"}}'`,
      },
      {
        method: "POST",
        path: "/api/trpc/webhooks.test",
        description: "Send a test event to a webhook URL to verify connectivity.",
        requestBody: `z.object({ id: z.string().uuid() })`,
        responseFormat: `{ success: boolean, statusCode: number, statusText: string }`,
        curl: `curl -X POST http://localhost:3001/api/trpc/webhooks.test \\
  -H "Authorization: Bearer <session_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"json":{"id":"<webhook_uuid>"}}'`,
      },
    ],
  },
];

// ── Helper Components ───────────────────────────────────────────────

function MethodBadge(props: { method: string }): JSX.Element {
  const colorClass = (): string => {
    switch (props.method) {
      case "GET":
        return "bg-green-700 text-green-100";
      case "POST":
        return "bg-blue-700 text-blue-100";
      case "PUT":
        return "bg-yellow-700 text-yellow-100";
      case "DELETE":
        return "bg-red-700 text-red-100";
      case "PATCH":
        return "bg-purple-700 text-purple-100";
      default:
        return "bg-gray-700 text-gray-100";
    }
  };

  return (
    <span
      class={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${colorClass()}`}
    >
      {props.method}
    </span>
  );
}

function CodeBlock(props: { code: string; onCopy?: () => void }): JSX.Element {
  const [copied, setCopied] = createSignal(false);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(props.code);
    setCopied(true);
    props.onCopy?.();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="relative group">
      <pre class="bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto text-sm font-mono text-gray-300 leading-relaxed">
        <code>{props.code}</code>
      </pre>
      <button
        type="button"
        class="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied() ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function EndpointCard(props: { endpoint: EndpointDoc }): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <MethodBadge method={props.endpoint.method} />
        <code class="text-sm font-mono text-gray-200 flex-1">
          {props.endpoint.path}
        </code>
        <span class="text-gray-500 text-sm">
          {expanded() ? "▲" : "▼"}
        </span>
      </button>

      <Show when={expanded()}>
        <div class="p-4 pt-0 space-y-4 border-t border-gray-700">
          <Text variant="body" class="text-gray-300">
            {props.endpoint.description}
          </Text>

          <Show when={props.endpoint.requestBody}>
            <div>
              <Text variant="caption" weight="semibold" class="text-gray-400 mb-1 block">
                Request Body (Zod Schema)
              </Text>
              <CodeBlock code={props.endpoint.requestBody!} />
            </div>
          </Show>

          <div>
            <Text variant="caption" weight="semibold" class="text-gray-400 mb-1 block">
              Response Format
            </Text>
            <CodeBlock code={props.endpoint.responseFormat} />
          </div>

          <div>
            <Text variant="caption" weight="semibold" class="text-gray-400 mb-1 block">
              Example
            </Text>
            <CodeBlock code={props.endpoint.curl} />
          </div>
        </div>
      </Show>
    </div>
  );
}

function CategorySection(props: { category: EndpointCategory }): JSX.Element {
  return (
    <div id={props.category.name.toLowerCase().replace(/\s+/g, "-")} class="scroll-mt-20">
      <Stack direction="vertical" gap="sm" class="mb-4">
        <Text variant="h3" weight="bold">{props.category.name}</Text>
        <Text variant="body" class="text-gray-400">
          {props.category.description}
        </Text>
        <Badge variant="default" size="sm">
          {props.category.endpoints.length} endpoint{props.category.endpoints.length !== 1 ? "s" : ""}
        </Badge>
      </Stack>

      <Stack direction="vertical" gap="sm">
        <For each={props.category.endpoints}>
          {(endpoint) => <EndpointCard endpoint={endpoint} />}
        </For>
      </Stack>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function DocsPage(): JSX.Element {
  const [searchQuery, setSearchQuery] = createSignal("");

  const filteredCategories = createMemo((): EndpointCategory[] => {
    const query = searchQuery().toLowerCase().trim();
    if (!query) return API_CATEGORIES;

    return API_CATEGORIES.map((cat) => ({
      ...cat,
      endpoints: cat.endpoints.filter(
        (ep) =>
          ep.path.toLowerCase().includes(query) ||
          ep.description.toLowerCase().includes(query) ||
          ep.method.toLowerCase().includes(query) ||
          cat.name.toLowerCase().includes(query),
      ),
    })).filter((cat) => cat.endpoints.length > 0);
  });

  const totalEndpoints = createMemo((): number =>
    API_CATEGORIES.reduce((sum, cat) => sum + cat.endpoints.length, 0),
  );

  return (
    <div class="max-w-6xl mx-auto p-6">
      <Title>API Documentation - Marco Reid</Title>

      <Stack direction="vertical" gap="lg">
        {/* Header */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h1" weight="bold">API Documentation</Text>
          <Text variant="body" class="text-gray-400">
            Complete reference for the Marco Reid public API. {totalEndpoints()} endpoints across {API_CATEGORIES.length} categories.
          </Text>
        </Stack>

        {/* Auth info banner */}
        <Card padding="md" class="border-blue-800 bg-blue-950/30">
          <Stack direction="vertical" gap="sm">
            <Text variant="body" weight="semibold" class="text-blue-300">
              Authentication
            </Text>
            <Text variant="caption" class="text-blue-200/80">
              Authenticate using a session token or API key in the Authorization header.
              Session tokens are obtained via passkey login. API keys use the <code class="bg-blue-900/50 px-1 rounded">btf_sk_</code> prefix
              and can be created in Settings &gt; Developer.
            </Text>
            <CodeBlock code={`Authorization: Bearer <session_token>\n# or\nAuthorization: Bearer btf_sk_<your_api_key>`} />
          </Stack>
        </Card>

        {/* Search + Nav */}
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar navigation */}
          <div class="lg:col-span-1">
            <div class="sticky top-4 space-y-4">
              <input
                type="text"
                placeholder="Search endpoints..."
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />

              <nav class="space-y-1">
                <For each={API_CATEGORIES}>
                  {(cat) => (
                    <a
                      href={`#${cat.name.toLowerCase().replace(/\s+/g, "-")}`}
                      class="block px-3 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
                    >
                      {cat.name}
                      <span class="text-gray-600 ml-1">
                        ({cat.endpoints.length})
                      </span>
                    </a>
                  )}
                </For>
              </nav>
            </div>
          </div>

          {/* Endpoint list */}
          <div class="lg:col-span-3 space-y-10">
            <Show
              when={filteredCategories().length > 0}
              fallback={
                <Card padding="lg">
                  <Text variant="body" class="text-gray-400 text-center">
                    No endpoints matching "{searchQuery()}".
                  </Text>
                </Card>
              }
            >
              <For each={filteredCategories()}>
                {(category) => <CategorySection category={category} />}
              </For>
            </Show>
          </div>
        </div>
      </Stack>
    </div>
  );
}
