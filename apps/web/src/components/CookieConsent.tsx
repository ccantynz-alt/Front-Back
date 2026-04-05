import { createSignal, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { Button, Text } from "@back-to-the-future/ui";

const STORAGE_KEY = "btf_cookie_consent";

type ConsentValue = "all" | "essential";

export function CookieConsent(): JSX.Element {
  const [visible, setVisible] = createSignal(false);
  const [animateIn, setAnimateIn] = createSignal(false);

  onMount(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setVisible(true);
      // Trigger animation on next frame
      requestAnimationFrame(() => {
        setAnimateIn(true);
      });
    }
  });

  function accept(value: ConsentValue): void {
    localStorage.setItem(STORAGE_KEY, value);
    setAnimateIn(false);
    // Wait for animation out before hiding
    setTimeout(() => {
      setVisible(false);
    }, 300);
  }

  return (
    <Show when={visible()}>
      <div
        class={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out ${
          animateIn() ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-label="Cookie consent"
      >
        <div class="mx-auto max-w-4xl p-4">
          <div
            class="flex flex-col gap-4 rounded-xl border border-[var(--border-color,#e5e7eb)] bg-[var(--card-bg,#ffffff)] p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between"
            style={{
              "background-color": "var(--card-bg, #ffffff)",
              "border-color": "var(--border-color, #e5e7eb)",
            }}
          >
            <div class="flex-1">
              <Text variant="body" weight="semibold">
                We use cookies
              </Text>
              <Text variant="caption" class="text-muted mt-1">
                We use cookies to improve your experience and analyze site traffic.
                Read our{" "}
                <A href="/legal/cookies" class="underline hover:opacity-80">
                  Cookie Policy
                </A>{" "}
                for more information.
              </Text>
            </div>
            <div class="flex shrink-0 gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => accept("essential")}
              >
                Essential Only
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => accept("all")}
              >
                Accept All
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
