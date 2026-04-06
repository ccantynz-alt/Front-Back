import { Title } from "@solidjs/meta";
import { Show, createSignal, createResource, For } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Card, Stack, Text, Badge, Input } from "@back-to-the-future/ui";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { trpc } from "../lib/trpc";

const NEON_REGIONS = [
  { id: "aws-us-east-2", label: "US East (Ohio)" },
  { id: "aws-us-west-2", label: "US West (Oregon)" },
  { id: "aws-eu-central-1", label: "EU Central (Frankfurt)" },
  { id: "aws-ap-southeast-1", label: "Asia Pacific (Singapore)" },
] as const;

function statusColor(status: string): "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "active":
    case "healthy":
      return "success";
    case "provisioning":
      return "warning";
    case "suspended":
    case "unhealthy":
      return "danger";
    default:
      return "info";
  }
}

export default function DatabasePage(): JSX.Element {
  const [selectedRegion, setSelectedRegion] = createSignal("aws-us-east-2");
  const [provisioning, setProvisioning] = createSignal(false);
  const [branchName, setBranchName] = createSignal("");
  const [creatingBranch, setCreatingBranch] = createSignal(false);
  const [copySuccess, setCopySuccess] = createSignal(false);
  const [showFullUri, setShowFullUri] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const [project, { refetch: refetchProject }] = createResource(async () => {
    try {
      return await trpc.tenant.getProject.query();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load project";
      console.error("[database]", msg);
      return null;
    }
  });

  const [health, { refetch: refetchHealth }] = createResource(async () => {
    try {
      return await trpc.tenant.health.query();
    } catch {
      return null;
    }
  });

  async function handleProvision(): Promise<void> {
    setProvisioning(true);
    setError(null);
    try {
      await trpc.tenant.provision.mutate({
        plan: "pro",
        region: selectedRegion(),
      });
      await refetchProject();
      await refetchHealth();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Provisioning failed";
      setError(msg);
    } finally {
      setProvisioning(false);
    }
  }

  async function handleCreateBranch(): Promise<void> {
    const name = branchName().trim();
    if (!name) return;

    setCreatingBranch(true);
    setError(null);
    try {
      await trpc.tenant.createBranch.mutate({ branchName: name });
      setBranchName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Branch creation failed";
      setError(msg);
    } finally {
      setCreatingBranch(false);
    }
  }

  function handleCopyUri(): void {
    const p = project();
    if (!p?.fullConnectionUri) return;

    navigator.clipboard.writeText(p.fullConnectionUri).then(
      () => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      },
      () => {
        setError("Failed to copy to clipboard");
      },
    );
  }

  return (
    <ProtectedRoute>
      <Title>Database - Marco Reid</Title>
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">Database</Text>
          <Text variant="body" class="text-muted">
            Manage your isolated Neon PostgreSQL database.
          </Text>
        </Stack>

        <Show when={error()}>
          <Card padding="md">
            <Text variant="body" class="text-danger">{error()}</Text>
          </Card>
        </Show>

        <Show
          when={project() !== undefined && project() !== null}
          fallback={
            <Card padding="lg">
              <Stack direction="vertical" gap="md">
                <Text variant="h3" weight="semibold">Provision Your Database</Text>
                <Text variant="body" class="text-muted">
                  Pro and Enterprise plans include an isolated PostgreSQL database
                  powered by Neon. Select a region and provision your database.
                </Text>

                <Stack direction="vertical" gap="sm">
                  <Text variant="caption" weight="semibold">Region</Text>
                  <Stack direction="horizontal" gap="sm">
                    <For each={NEON_REGIONS}>
                      {(region) => (
                        <Button
                          variant={selectedRegion() === region.id ? "primary" : "outline"}
                          size="sm"
                          onClick={() => setSelectedRegion(region.id)}
                        >
                          {region.label}
                        </Button>
                      )}
                    </For>
                  </Stack>
                </Stack>

                <Button
                  variant="primary"
                  onClick={handleProvision}
                  disabled={provisioning()}
                >
                  {provisioning() ? "Provisioning..." : "Provision Database"}
                </Button>
              </Stack>
            </Card>
          }
        >
          {(_p) => {
            const proj = project()!;
            return (
              <Stack direction="vertical" gap="md">
                {/* Status Card */}
                <Card padding="lg">
                  <Stack direction="vertical" gap="md">
                    <Stack direction="horizontal" gap="sm" align="center">
                      <Text variant="h3" weight="semibold">Database Status</Text>
                      <Badge variant={statusColor(proj.status)} size="sm">
                        {proj.status}
                      </Badge>
                    </Stack>

                    <div class="grid-3">
                      <Card padding="sm">
                        <Stack direction="vertical" gap="xs">
                          <Text variant="caption" class="text-muted">Region</Text>
                          <Text variant="body" weight="semibold">{proj.region}</Text>
                        </Stack>
                      </Card>
                      <Card padding="sm">
                        <Stack direction="vertical" gap="xs">
                          <Text variant="caption" class="text-muted">Plan</Text>
                          <Text variant="body" weight="semibold">{proj.plan}</Text>
                        </Stack>
                      </Card>
                      <Card padding="sm">
                        <Stack direction="vertical" gap="xs">
                          <Text variant="caption" class="text-muted">Project ID</Text>
                          <Text variant="body" weight="semibold">
                            {proj.neonProjectId || "Provisioning..."}
                          </Text>
                        </Stack>
                      </Card>
                    </div>
                  </Stack>
                </Card>

                {/* Connection Info Card */}
                <Card padding="lg">
                  <Stack direction="vertical" gap="md">
                    <Text variant="h3" weight="semibold">Connection Info</Text>
                    <Stack direction="vertical" gap="sm">
                      <Text variant="caption" class="text-muted">Connection URI</Text>
                      <Stack direction="horizontal" gap="sm" align="center">
                        <Text variant="body" class="font-mono text-sm">
                          {showFullUri() ? proj.fullConnectionUri : proj.connectionUri}
                        </Text>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowFullUri(!showFullUri())}
                        >
                          {showFullUri() ? "Hide" : "Show"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyUri}
                        >
                          {copySuccess() ? "Copied!" : "Copy"}
                        </Button>
                      </Stack>
                    </Stack>
                  </Stack>
                </Card>

                {/* Health Card */}
                <Card padding="lg">
                  <Stack direction="vertical" gap="md">
                    <Stack direction="horizontal" gap="sm" align="center">
                      <Text variant="h3" weight="semibold">Health</Text>
                      <Show when={health()}>
                        {(h) => (
                          <Badge variant={statusColor(h().status)} size="sm">
                            {h().status} ({h().latencyMs}ms)
                          </Badge>
                        )}
                      </Show>
                    </Stack>
                    <Button variant="outline" size="sm" onClick={() => refetchHealth()}>
                      Refresh Health
                    </Button>
                  </Stack>
                </Card>

                {/* Branch Management Card */}
                <Card padding="lg">
                  <Stack direction="vertical" gap="md">
                    <Text variant="h3" weight="semibold">Branch Management</Text>
                    <Text variant="body" class="text-muted">
                      Create copy-on-write branches for staging or testing.
                      Branches are instant and cost-efficient.
                    </Text>
                    <Stack direction="horizontal" gap="sm" align="center">
                      <Input
                        placeholder="Branch name (e.g., staging)"
                        value={branchName()}
                        onInput={(e) => setBranchName(e.currentTarget.value)}
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleCreateBranch}
                        disabled={creatingBranch() || !branchName().trim()}
                      >
                        {creatingBranch() ? "Creating..." : "Create Branch"}
                      </Button>
                    </Stack>
                  </Stack>
                </Card>

                {/* Usage Stats Placeholder */}
                <Card padding="lg">
                  <Stack direction="vertical" gap="md">
                    <Text variant="h3" weight="semibold">Usage Stats</Text>
                    <div class="grid-3">
                      <Card padding="sm">
                        <Stack direction="vertical" gap="xs">
                          <Text variant="caption" class="text-muted">Storage</Text>
                          <Text variant="h3" weight="bold">--</Text>
                        </Stack>
                      </Card>
                      <Card padding="sm">
                        <Stack direction="vertical" gap="xs">
                          <Text variant="caption" class="text-muted">Compute Hours</Text>
                          <Text variant="h3" weight="bold">--</Text>
                        </Stack>
                      </Card>
                      <Card padding="sm">
                        <Stack direction="vertical" gap="xs">
                          <Text variant="caption" class="text-muted">Active Branches</Text>
                          <Text variant="h3" weight="bold">--</Text>
                        </Stack>
                      </Card>
                    </div>
                    <Text variant="caption" class="text-muted">
                      Detailed usage stats coming soon.
                    </Text>
                  </Stack>
                </Card>
              </Stack>
            );
          }}
        </Show>
      </Stack>
    </ProtectedRoute>
  );
}
