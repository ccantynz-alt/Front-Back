import { z } from "zod";
import { type JSX, Show, splitProps, createSignal } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const AlertPropsSchema = z.object({
  variant: z.enum(["info", "success", "warning", "error"]).default("info"),
  title: z.string().optional(),
  description: z.string().optional(),
  dismissible: z.boolean().default(false),
});

export type AlertSchemaProps = z.input<typeof AlertPropsSchema>;

export interface AlertProps extends AlertSchemaProps {
  children?: JSX.Element;
  onDismiss?: () => void;
  class?: string;
}

const variantClasses: Record<NonNullable<AlertSchemaProps["variant"]>, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-800",
  success: "bg-green-50 border-green-200 text-green-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  error: "bg-red-50 border-red-200 text-red-800",
};

const iconPaths: Record<NonNullable<AlertSchemaProps["variant"]>, string> = {
  info: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z",
  success: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z",
  warning: "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z",
  error: "M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z",
};

export function Alert(props: AlertProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "variant", "title", "description", "dismissible", "children", "onDismiss", "class",
  ]);

  const [dismissed, setDismissed] = createSignal(false);
  const variant = (): NonNullable<AlertSchemaProps["variant"]> => local.variant ?? "info";

  const handleDismiss = (): void => {
    setDismissed(true);
    local.onDismiss?.();
  };

  return (
    <Show when={!dismissed()}>
      <div
        class={`flex items-start gap-3 rounded-lg border p-4 ${variantClasses[variant()]} ${local.class ?? ""}`}
        role="alert"
        {...rest}
      >
        <svg class="h-5 w-5 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d={iconPaths[variant()]} clip-rule="evenodd" />
        </svg>
        <div class="flex-1 min-w-0">
          <Show when={local.title}>
            <p class="font-semibold">{local.title}</p>
          </Show>
          <Show when={local.description}>
            <p class={`text-sm opacity-90 ${local.title ? "mt-1" : ""}`}>{local.description}</p>
          </Show>
          {local.children}
        </div>
        <Show when={local.dismissible}>
          <button
            type="button"
            class="shrink-0 rounded-lg p-1 opacity-60 hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="Dismiss alert"
            onClick={handleDismiss}
          >
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </Show>
      </div>
    </Show>
  );
}
