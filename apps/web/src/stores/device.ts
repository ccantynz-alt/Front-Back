// ── Device Capabilities Signal Store ─────────────────────────────────
// Runs detection once on mount and exposes reactive device capabilities.

import { type Accessor, createSignal, onMount } from "solid-js";
import type { DeviceCapabilities } from "@back-to-the-future/ai-core";
import { detectDeviceCapabilities } from "~/lib/device-capabilities";

/** Conservative server-side / pre-detection defaults. */
const DEFAULT_CAPABILITIES: DeviceCapabilities = {
  hasWebGPU: false,
  vramMB: 0,
  hardwareConcurrency: 1,
  deviceMemoryGB: 2,
  connectionType: "unknown",
};

const [capabilities, setCapabilities] =
  createSignal<DeviceCapabilities>(DEFAULT_CAPABILITIES);

let detected = false;

/**
 * Returns a reactive accessor for the current device capabilities.
 *
 * Detection runs once on first mount. Subsequent calls return the
 * cached result without re-detecting.
 */
export function useDeviceCapabilities(): Accessor<DeviceCapabilities> {
  onMount(() => {
    if (detected) return;
    detected = true;

    void detectDeviceCapabilities().then((caps) => {
      setCapabilities(caps);
    });
  });

  return capabilities;
}
