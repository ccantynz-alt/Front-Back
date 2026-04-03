import { z } from "zod";
import { type JSX, Show, splitProps, createEffect, onCleanup } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const ModalPropsSchema = z.object({
  open: z.boolean().default(false),
  title: z.string(),
  description: z.string().optional(),
  size: z.enum(["sm", "md", "lg", "xl", "full"]).default("md"),
  closeOnOverlay: z.boolean().default(true),
  closeOnEscape: z.boolean().default(true),
});

export type ModalSchemaProps = z.input<typeof ModalPropsSchema>;

export interface ModalProps extends ModalSchemaProps {
  onClose?: () => void;
  actions?: JSX.Element;
  children?: JSX.Element;
  class?: string;
}

const sizeClasses: Record<NonNullable<ModalSchemaProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
};

function createFocusTrap(container: HTMLElement): () => void {
  const sel = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Tab") return;
    const focusable = container.querySelectorAll<HTMLElement>(sel);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener("keydown", handleKeyDown);
  return (): void => { container.removeEventListener("keydown", handleKeyDown); };
}

export function Modal(props: ModalProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "open", "title", "description", "size", "closeOnOverlay", "closeOnEscape",
    "onClose", "actions", "children", "class",
  ]);

  let dialogRef: HTMLDivElement | undefined;
  let previousFocus: HTMLElement | null = null;
  const size = (): NonNullable<ModalSchemaProps["size"]> => local.size ?? "md";

  createEffect(() => {
    if (!local.open) return;
    previousFocus = document.activeElement as HTMLElement | null;
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && (local.closeOnEscape ?? true)) local.onClose?.();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      if (dialogRef) {
        const first = dialogRef.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        (first ?? dialogRef).focus();
      }
    });
    onCleanup(() => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      previousFocus?.focus();
    });
  });

  const setDialogRef = (el: HTMLDivElement): void => {
    dialogRef = el;
    const cleanup = createFocusTrap(el);
    onCleanup(cleanup);
  };

  return (
    <Show when={local.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div
          class="fixed inset-0 bg-black/50 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => { if (local.closeOnOverlay ?? true) local.onClose?.(); }}
        />
        <div
          ref={setDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          aria-describedby={local.description ? "modal-description" : undefined}
          tabIndex={-1}
          class={`relative z-50 w-full ${sizeClasses[size()]} bg-white rounded-xl shadow-xl ${local.class ?? ""}`}
          {...rest}
        >
          <div class="flex items-start justify-between p-5 border-b border-gray-200">
            <div>
              <h2 id="modal-title" class="text-lg font-semibold text-gray-900">{local.title}</h2>
              <Show when={local.description}>
                <p id="modal-description" class="mt-1 text-sm text-gray-500">{local.description}</p>
              </Show>
            </div>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={() => local.onClose?.()}
              class="ml-4 shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          <div class="p-5">{local.children}</div>
          <Show when={local.actions}>
            <div class="flex items-center justify-end gap-3 border-t border-gray-200 p-5">{local.actions}</div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
