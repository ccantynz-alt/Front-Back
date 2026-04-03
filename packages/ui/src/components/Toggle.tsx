import { z } from "zod";
import { type JSX, splitProps, Show } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const TogglePropsSchema = z.object({
  checked: z.boolean().default(false),
  disabled: z.boolean().default(false),
  label: z.string().optional(),
  description: z.string().optional(),
  size: z.enum(["sm", "md", "lg"]).default("md"),
  name: z.string().optional(),
});

export type ToggleSchemaProps = z.input<typeof TogglePropsSchema>;

export interface ToggleProps extends ToggleSchemaProps {
  onChange?: (checked: boolean) => void;
  class?: string;
  id?: string;
}

const trackSizes: Record<NonNullable<ToggleSchemaProps["size"]>, string> = {
  sm: "h-5 w-9",
  md: "h-6 w-11",
  lg: "h-7 w-[52px]",
};

const thumbSizes: Record<NonNullable<ToggleSchemaProps["size"]>, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const thumbTranslate: Record<NonNullable<ToggleSchemaProps["size"]>, string> = {
  sm: "translate-x-4",
  md: "translate-x-5",
  lg: "translate-x-6",
};

export function Toggle(props: ToggleProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "checked", "disabled", "label", "description", "size", "name", "onChange", "class", "id",
  ]);

  const size = (): NonNullable<ToggleSchemaProps["size"]> => local.size ?? "md";
  const inputId = (): string => local.id ?? local.name ?? "toggle";

  const handleClick = (): void => {
    if (!local.disabled) {
      local.onChange?.(!local.checked);
    }
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div class={`flex items-start gap-3 ${local.class ?? ""}`} {...rest}>
      <button
        type="button"
        role="switch"
        id={inputId()}
        aria-checked={local.checked}
        aria-label={local.label}
        disabled={local.disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        class={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${trackSizes[size()]} ${local.checked ? "bg-blue-600" : "bg-gray-200"}`}
      >
        <span
          class={`pointer-events-none inline-block transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${thumbSizes[size()]} ${local.checked ? thumbTranslate[size()] : "translate-x-1"}`}
          aria-hidden="true"
        />
      </button>
      <Show when={local.label || local.description}>
        <div class="flex flex-col">
          <Show when={local.label}>
            <label
              for={inputId()}
              class={`text-sm font-medium text-gray-900 ${local.disabled ? "opacity-50" : "cursor-pointer"}`}
            >
              {local.label}
            </label>
          </Show>
          <Show when={local.description}>
            <span class={`text-sm text-gray-500 ${local.disabled ? "opacity-50" : ""}`}>
              {local.description}
            </span>
          </Show>
        </div>
      </Show>
    </div>
  );
}
