// ── PreLaunchBanner — Platform-Wide Pre-Launch Signal ───────────────
// A sticky, non-dismissible banner that renders on every user-facing
// route (landing, dashboard, pricing, docs, admin — all of them) to
// make it unmistakably clear that Crontech is in pre-launch validation
// and is NOT yet a live commercial service.
//
// Why this exists (authorised by Craig on 16 Apr 2026):
//   The platform is in final validation ahead of launch review. Until
//   the attorney package is signed off and customer onboarding opens,
//   every route must advertise this state. No visitor — prospect,
//   collaborator, or attorney reviewer — should be able to miss it.
//
// Behaviour:
//   - Sticky top-of-viewport, full width.
//   - Warning (amber) tone to match the platform's dark palette.
//   - Not dismissible for this phase — signal must be persistent.
//   - Responsive from 320px up.
//
// Mounted from `apps/web/src/app.tsx` so every `FileRoutes` child
// (all 28 routes, including /admin/*) renders beneath it.

import type { JSX } from "solid-js";
import { Box, Stack, Text } from "@back-to-the-future/ui";

export function PreLaunchBanner(): JSX.Element {
  return (
    <Box
      role="status"
      aria-live="polite"
      class="sticky top-0 z-[60] w-full backdrop-blur-xl"
      style={{
        background: "rgba(10,15,26,0.85)",
        "border-bottom": "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Stack
        direction="horizontal"
        gap="sm"
        align="center"
        justify="center"
        class="mx-auto max-w-7xl px-3 py-2 sm:px-6"
      >
        <Box
          class="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: "#f59e0b",
            "box-shadow": "0 0 6px rgba(245,158,11,0.5)",
          }}
        />
        <Text variant="body" class="text-[11px] tracking-wide sm:text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
          <Text as="span" class="font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>Early access</Text>
          <Text as="span"> — Crontech is in final validation before public launch.</Text>
        </Text>
      </Stack>
    </Box>
  );
}
