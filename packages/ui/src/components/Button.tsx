import { z } from "zod";
import { type JSX, splitProps, Show } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const ButtonPropsSchema = z.object({
  variant: z
    .enum(["primary", "secondary", "outline", "ghost", "destructive", "link"])
    .default("primary"),
  size: z.enum(["sm", "md", "lg", "icon"]).default("md"),
  loading: z.boolean().default(false),
  disabled: z.boolean().default(false),
  fullWidth: z.boolean().default(false),
  label: z.string().optional(),
});

export type ButtonSchemaProps = z.input<typeof ButtonPropsSchema>;

// ── Component Props (extends schema with JSX-specific) ───────────────
export interface ButtonProps extends ButtonSchemaProps {
  children?: JSX.Element;
  iconLeft?: JSX.Element;
  iconRight?: JSX.Element;
  onClick?: (e: MouseEvent) => void;
  type?: "button" | "submit" | "reset";
  class?: string;
  "aria-label"?: string;
}

// ── Tailwind Class Maps ──────────────────────────────────────────────
const variantClasses: Record<NonNullable<ButtonSchemaProps["variant"]>, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500",
  secondary:
    "bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 focus-visible:ring-gray-400",
  outline:
    "border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-gray-400",
  ghost:
    "bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-gray-400",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500",
  link: "bg-transparent text-blue-600 hover:underline active:text-blue-800 p-0 h-auto focus-visible:ring-blue-500",
};

const sizeClasses: Record<NonNullable<ButtonSchemaProps["size"]>, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-6 text-base gap-2.5 rounded-lg",
  icon: "h-10 w-10 rounded-lg",
};

// ── Component ────────────────────────────────────────────────────────
export function Button(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "loading",
    "disabled",
    "fullWidth",
    "label",
    "children",
    "iconLeft",
    "iconRight",
    "onClick",
    "type",
    "class",
    "aria-label",
  ]);

  const variant = (): NonNullable<ButtonSchemaProps["variant"]> => local.variant ?? "primary";
  const size = (): NonNullable<ButtonSchemaProps["size"]> => local.size ?? "md";
  const isDisabled = (): boolean => !!local.disabled || !!local.loading;

  return (
    <button
      type={local.type ?? "button"}
      disabled={isDisabled()}
      aria-label={local["aria-label"]}
      aria-busy={local.loading || undefined}
      onClick={(e) => local.onClick?.(e)}
      class={`inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant()]} ${sizeClasses[size()]} ${local.fullWidth ? "w-full" : ""} ${local.class ?? ""}`}
      {...rest}
    >
      <Show when={local.loading}>
        <svg
          class="animate-spin h-4 w-4 shrink-0"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </Show>
      <Show when={!local.loading && local.iconLeft}>{local.iconLeft}</Show>
      <Show when={local.label ?? local.children}>
        <span>{local.label ?? local.children}</span>
      </Show>
      <Show when={!local.loading && local.iconRight}>{local.iconRight}</Show>
    </button>
  );
}
