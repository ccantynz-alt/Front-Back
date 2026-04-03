import { z } from "zod";
import { type JSX, Show, splitProps, createSignal } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const TooltipPropsSchema = z.object({
  content: z.string(),
  position: z.enum(["top", "bottom", "left", "right"]).default("top"),
  delay: z.number().int().nonnegative().default(200),
});

export type TooltipSchemaProps = z.input<typeof TooltipPropsSchema>;

export interface TooltipProps extends TooltipSchemaProps {
  children?: JSX.Element;
  class?: string;
}

const positionClasses: Record<NonNullable<TooltipSchemaProps["position"]>, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export function Tooltip(props: TooltipProps): JSX.Element {
  const [local, rest] = splitProps(props, ["content", "position", "delay", "children", "class"]);
  const [visible, setVisible] = createSignal(false);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const position = (): NonNullable<TooltipSchemaProps["position"]> => local.position ?? "top";
  const delayMs = (): number => local.delay ?? 200;

  const show = (): void => {
    timeout = setTimeout(() => setVisible(true), delayMs());
  };
  const hide = (): void => {
    clearTimeout(timeout);
    setVisible(false);
  };

  return (
    <div
      class={`relative inline-flex ${local.class ?? ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusIn={show}
      onFocusOut={hide}
      {...rest}
    >
      {local.children}
      <Show when={visible()}>
        <div
          class={`absolute z-50 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg pointer-events-none ${positionClasses[position()]}`}
          role="tooltip"
        >
          {local.content}
        </div>
      </Show>
    </div>
  );
}
