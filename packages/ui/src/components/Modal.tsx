import { type JSX, Show, splitProps } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";

export interface ModalProps {
  open?: boolean;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
  onClose?: () => void;
  class?: string;
  children?: JSX.Element;
}

export function Modal(props: ModalProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "open",
    "title",
    "description",
    "size",
    "onClose",
    "class",
    "children",
  ]);

  return (
    <Dialog
      open={local.open}
      onOpenChange={(isOpen) => {
        if (!isOpen) local.onClose?.();
      }}
      {...rest}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          class="modal-overlay"
        />
        <Dialog.Content
          class={`modal modal-${local.size ?? "md"} ${local.class ?? ""}`}
        >
          <Show when={local.title}>
            <div class="modal-header">
              <Dialog.Title class="modal-title">{local.title}</Dialog.Title>
              <Dialog.CloseButton class="modal-close" aria-label="Close">
                &times;
              </Dialog.CloseButton>
            </div>
          </Show>
          <Show when={local.description}>
            <Dialog.Description class="modal-description">
              {local.description}
            </Dialog.Description>
          </Show>
          <div class="modal-body">{local.children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
