import { z } from "zod";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const SpinnerPropsSchema = z.object({
  size: z.enum(["sm", "md", "lg"]).default("md"),
  label: z.string().default("Loading"),
});

export type SpinnerSchemaProps = z.input<typeof SpinnerPropsSchema>;

export interface SpinnerProps extends SpinnerSchemaProps {
  class?: string;
}

const sizeClasses: Record<NonNullable<SpinnerSchemaProps["size"]>, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export function Spinner(props: SpinnerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["size", "label", "class"]);
  const size = (): NonNullable<SpinnerSchemaProps["size"]> => local.size ?? "md";

  return (
    <div
      class={`inline-flex items-center justify-center ${local.class ?? ""}`}
      role="status"
      aria-label={local.label ?? "Loading"}
      {...rest}
    >
      <div
        class={`animate-spin rounded-full border-gray-300 border-t-blue-600 ${sizeClasses[size()]}`}
        aria-hidden="true"
      />
      <span class="sr-only">{local.label ?? "Loading"}</span>
    </div>
  );
}
