import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { createSignal, createResource, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text, Badge, Spinner, Separator } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useAuth } from "../stores";
import { trpc } from "../lib/trpc";

// ── Types ────────────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  subdomain: string | null;
  customDomain: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ── Site Card ────────────────────────────────────────────────────────

function SiteCard(props: { site: Site; onDelete: (id: string) => void }): JSX.Element {
  const [deleting, setDeleting] = createSignal(false);

  const statusVariant = (): "success" | "warning" | "default" => {
    if (props.site.status === "published") return "success";
    if (props.site.status === "draft") return "warning";
    return "default";
  };

  const siteUrl = (): string | null => {
    if (props.site.subdomain) return `https://${props.site.subdomain}.pages.dev`;
    if (props.site.customDomain) return `https://${props.site.customDomain}`;
    return null;
  };

  const handleDelete = async (): Promise<void> => {
    setDeleting(true);
    try {
      await trpc.sites.delete.mutate({ id: props.site.id });
      props.onDelete(props.site.id);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <Card padding="md">
      <Stack direction="vertical" gap="sm">
        <Stack direction="horizontal" gap="sm" align="center" justify="between">
          <Text variant="h4" weight="semibold">{props.site.name}</Text>
          <Badge variant={statusVariant()} label={props.site.status} />
        </Stack>

        <Show when={props.site.description}>
          <Text variant="body" class="text-muted">{props.site.description}</Text>
        </Show>

        <Show when={siteUrl()}>
          {(url) => (
            <a href={url()} target="_blank" rel="noopener noreferrer" class="text-sm text-blue-400 underline hover:text-blue-300">
              {url()}
            </a>
          )}
        </Show>

        <Text variant="caption" class="text-muted">
          Created {new Date(props.site.createdAt).toLocaleDateString()}
        </Text>

        <Stack direction="horizontal" gap="sm">
          <A href={`/builder?site=${props.site.id}`}>
            <Button variant="outline" size="sm">Edit</Button>
          </A>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            loading={deleting()}
          >
            Delete
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

// ── Quick Action Card ────────────────────────────────────────────────

function QuickAction(props: { title: string; description: string; href: string; label: string }): JSX.Element {
  return (
    <Card class="quick-action-card" padding="md">
      <Stack direction="vertical" gap="sm">
        <Text variant="h4" weight="semibold">{props.title}</Text>
        <Text variant="body" class="text-muted">{props.description}</Text>
        <A href={props.href}>
          <Button variant="outline" size="sm">{props.label}</Button>
        </A>
      </Stack>
    </Card>
  );
}

// ── Dashboard Page ───────────────────────────────────────────────────

export default function DashboardPage(): JSX.Element {
  const auth = useAuth();

  const [sites, { refetch }] = createResource(async () => {
    try {
      const result = await trpc.sites.list.query({});
      return result.items as Site[];
    } catch {
      return [] as Site[];
    }
  });

  const handleDeleteSite = (_id: string): void => {
    refetch();
  };

  return (
    <ProtectedRoute>
      <Title>Dashboard - Back to the Future</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        {/* Header */}
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            Welcome back, {auth.currentUser()?.displayName ?? "User"}
          </Text>
          <Text variant="body" class="text-muted">
            Your workspace overview.
          </Text>
        </Stack>

        {/* Quick Actions */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Quick Actions</Text>
          <div class="grid-3">
            <QuickAction
              title="AI Website Builder"
              description="Create a new website with AI. Describe what you want and deploy in one click."
              href="/builder"
              label="Open Builder"
            />
            <QuickAction
              title="View Sites"
              description="Manage your deployed sites, check analytics, and update content."
              href="#sites"
              label="Scroll Down"
            />
            <QuickAction
              title="Documentation"
              description="Learn how to use the platform, integrate APIs, and extend with plugins."
              href="/about"
              label="Read Docs"
            />
          </div>
        </Stack>

        <Separator />

        {/* My Sites */}
        <Stack direction="vertical" gap="sm">
          <Stack direction="horizontal" gap="md" align="center" justify="between">
            <Text variant="h3" weight="semibold" id="sites">My Sites</Text>
            <A href="/builder">
              <Button variant="primary" size="sm">New Site</Button>
            </A>
          </Stack>

          <Show when={!sites.loading} fallback={
            <Stack direction="horizontal" gap="sm" align="center">
              <Spinner size="sm" />
              <Text variant="body" class="text-muted">Loading sites...</Text>
            </Stack>
          }>
            <Show when={sites()?.length} fallback={
              <Card padding="lg">
                <Stack direction="vertical" gap="sm" align="center">
                  <Text variant="h4" class="text-muted">No sites yet</Text>
                  <Text variant="body" class="text-muted">
                    Create your first site with the AI Builder.
                  </Text>
                  <A href="/builder">
                    <Button variant="primary">Create First Site</Button>
                  </A>
                </Stack>
              </Card>
            }>
              <div class="grid-3">
                <For each={sites()}>
                  {(site) => <SiteCard site={site} onDelete={handleDeleteSite} />}
                </For>
              </div>
            </Show>
          </Show>
        </Stack>

        <Separator />

        {/* Account */}
        <Stack direction="vertical" gap="sm">
          <Text variant="h3" weight="semibold">Account</Text>
          <Card padding="md">
            <Stack direction="vertical" gap="xs">
              <Text variant="body">
                <strong>Email:</strong> {auth.currentUser()?.email}
              </Text>
              <Text variant="body">
                <strong>Role:</strong> {auth.currentUser()?.role}
              </Text>
              <Text variant="caption" class="text-muted">
                Member since {auth.currentUser()?.createdAt ? new Date(auth.currentUser()!.createdAt).toLocaleDateString() : "N/A"}
              </Text>
            </Stack>
          </Card>
        </Stack>
      </Stack>
    </ProtectedRoute>
  );
}
