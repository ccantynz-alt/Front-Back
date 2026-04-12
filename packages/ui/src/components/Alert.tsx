import { type JSX, Show, splitProps, createSignal } from "solid-js";

export interface AlertProps {
  variant?: "info" | "success" | "warning" | "error" | undefined;
  title?: string | undefined;
  description?: string | undefined;
  dismissible?: boolean | undefined;
  class?: string | undefined;
  children?: JSX.Element | undefined;
}

export function Alert(props: AlertProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "variant",
    "title",
    "description",
    "dismissible",
    "class",
    "children",
  ]);

  const [dismissed, setDismissed] = createSignal(false);

  return (
    <Show when={!dismissed()}>
      <div
        class={`alert alert-${local.variant ?? "info"} ${local.class ?? ""}`}
        role="alert"
        {...rest}
      >
        <div class="alert-content">
          <Show when={local.title}>
            <strong class="alert-title">{local.title}</strong>
          </Show>
          <Show when={local.description}>
            <p class="alert-description">{local.description}</p>
          </Show>
          {local.children}
        </div>
        <Show when={local.dismissible}>
          <button
            class="alert-dismiss"
            aria-label="Dismiss alert"
            onClick={() => setDismissed(true)}
          >
            &times;
          </button>
        </Show>
      </div>
    </Show>
  );
}
