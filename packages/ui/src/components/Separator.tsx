import { z } from "zod";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const SeparatorPropsSchema = z.object({
  orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
});

export type SeparatorSchemaProps = z.input<typeof SeparatorPropsSchema>;

export interface SeparatorProps extends SeparatorSchemaProps {
  class?: string;
}

export function Separator(props: SeparatorProps): JSX.Element {
  const [local, rest] = splitProps(props, ["orientation", "class"]);
  const isHorizontal = (): boolean => (local.orientation ?? "horizontal") === "horizontal";

  return (
    <div
      class={`shrink-0 bg-gray-200 ${isHorizontal() ? "h-px w-full" : "w-px h-full"} ${local.class ?? ""}`}
      role="separator"
      aria-orientation={local.orientation ?? "horizontal"}
      {...rest}
    />
  );
}
