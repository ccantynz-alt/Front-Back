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

export function PreLaunchBanner(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      class="sticky top-0 z-[60] w-full border-b border-amber-500/30 bg-amber-500/20 backdrop-blur-md"
    >
      {/* Top accent line — subtle amber gradient to match brand */}
      <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

      <div class="mx-auto flex max-w-7xl items-start gap-2 px-3 py-2 sm:items-center sm:gap-3 sm:px-6 sm:py-2.5">
        {/* Warning glyph */}
        <span
          aria-hidden="true"
          class="mt-0.5 shrink-0 text-sm text-amber-300 sm:mt-0 sm:text-base"
        >
          {"\u26A0"}
        </span>

        {/* Copy — responsive down to 320px */}
        <p class="flex-1 text-[11px] leading-snug text-amber-100 sm:text-xs sm:leading-normal md:text-sm">
          <span class="font-semibold text-amber-200">Pre-launch</span>
          <span class="text-amber-100/90"> — Crontech is in final validation. Customer onboarding opens after launch review. This is not yet a live commercial service.</span>
        </p>
      </div>
    </div>
  );
}
