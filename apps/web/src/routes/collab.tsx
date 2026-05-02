import { Badge, Box, Button, Card, Input, Stack, Text } from "@back-to-the-future/ui";
import { For, Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { SEOHead } from "../components/SEOHead";

interface Room {
  id: string;
  name: string;
  users: number;
  status: "active" | "idle";
}

export default function CollabPage(): JSX.Element {
  const [rooms, setRooms] = createSignal<Room[]>([]);
  const [newRoomName, setNewRoomName] = createSignal("");

  const createRoom = (): void => {
    const name = newRoomName().trim();
    if (!name) return;
    const room: Room = {
      id: `room-${Date.now()}`,
      name,
      users: 1,
      status: "active",
    };
    setRooms([...rooms(), room]);
    setNewRoomName("");
  };

  return (
    <ProtectedRoute>
      <SEOHead
        title="Collaboration"
        description="Real-time collaboration powered by CRDTs. Create rooms, invite team members and AI agents, and co-create with zero conflicts."
        path="/collab"
      />
      <Stack direction="vertical" gap="lg" class="page-padded">
        <Stack direction="vertical" gap="xs">
          <Text variant="h1" weight="bold">
            Real-Time Collaboration
          </Text>
          <Text variant="body" class="text-muted">
            Create or join rooms to collaborate with team members and AI agents in real-time.
          </Text>
        </Stack>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h3" weight="semibold">
              Create New Room
            </Text>
            <Stack direction="horizontal" gap="sm" align="end">
              <Input
                placeholder="Room name..."
                value={newRoomName()}
                onInput={(e) => setNewRoomName(e.currentTarget.value)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") createRoom();
                }}
                label="Room Name"
              />
              <Button variant="primary" onClick={createRoom}>
                Create Room
              </Button>
            </Stack>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Stack direction="horizontal" gap="sm" align="center">
              <Text variant="h3" weight="semibold">
                Active Rooms
              </Text>
              <Badge variant="info" size="sm">
                {rooms().length} rooms
              </Badge>
            </Stack>

            <Show
              when={rooms().length > 0}
              fallback={
                <Text variant="body" class="text-muted">
                  No active rooms. Create one to start collaborating.
                </Text>
              }
            >
              <Stack direction="vertical" gap="sm">
                <For each={rooms()}>
                  {(room) => (
                    <Card padding="sm">
                      <Stack direction="horizontal" justify="between" align="center">
                        <Stack direction="vertical" gap="xs">
                          <Text variant="body" weight="semibold">
                            {room.name}
                          </Text>
                          <Text variant="caption" class="text-muted">
                            {room.users} user(s) connected
                          </Text>
                        </Stack>
                        <Stack direction="horizontal" gap="sm">
                          <Badge
                            variant={room.status === "active" ? "success" : "warning"}
                            size="sm"
                          >
                            {room.status}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.location.href = `/builder?room=${room.id}`;
                            }}
                          >
                            Join
                          </Button>
                        </Stack>
                      </Stack>
                    </Card>
                  )}
                </For>
              </Stack>
            </Show>
          </Stack>
        </Card>

        <Card padding="lg">
          <Stack direction="vertical" gap="md">
            <Text variant="h3" weight="semibold">
              Collaboration Features
            </Text>
            <Box class="grid-3">
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="body" weight="semibold">
                    CRDT Sync
                  </Text>
                  <Text variant="caption" class="text-muted">
                    Conflict-free editing powered by Yjs
                  </Text>
                </Stack>
              </Card>
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="body" weight="semibold">
                    AI Participants
                  </Text>
                  <Text variant="caption" class="text-muted">
                    AI agents join as real-time collaborators
                  </Text>
                </Stack>
              </Card>
              <Card padding="sm">
                <Stack direction="vertical" gap="xs">
                  <Text variant="body" weight="semibold">
                    Live Cursors
                  </Text>
                  <Text variant="caption" class="text-muted">
                    See everyone's position in real-time
                  </Text>
                </Stack>
              </Card>
            </Box>
          </Stack>
        </Card>
      </Stack>
    </ProtectedRoute>
  );
}
