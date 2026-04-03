import { z } from "zod";
import { type JSX, splitProps, Show, For } from "solid-js";

// ── Zod Schema (AI Composability) ─��──────────────��───────────────────
export const SelectOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  disabled: z.boolean().optional(),
});

export const SelectPropsSchema = z.object({
  options: z.array(SelectOptionSchema).min(1),
  value: z.string().optional(),
  placeholder: z.string().optional(),
  label: z.string().optional(),
  error: z.string().optional(),
  disabled: z.boolean().default(false),
  required: z.boolean().default(false),
  name: z.string().optional(),
  size: z.enum(["sm", "md", "lg"]).default("md"),
});

export type SelectSchemaProps = z.input<typeof SelectPropsSchema>;

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectSchemaProps {
  options: SelectOption[];
  onChange?: (value: string) => void;
  class?: string;
  id?: string;
}

const sizeClasses: Record<NonNullable<SelectSchemaProps["size"]>, string> = {
  sm: "h-8 px-2.5 text-sm rounded-md",
  md: "h-10 px-3 text-sm rounded-lg",
  lg: "h-12 px-4 text-base rounded-lg",
};

export function Select(props: SelectProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "options", "value", "placeholder", "label", "error", "disabled",
    "required", "name", "size", "onChange", "class", "id",
  ]);

  const size = (): NonNullable<SelectSchemaProps["size"]> => local.size ?? "md";
  const inputId = (): string => local.id ?? local.name ?? "select";
  const errorId = (): string => `${inputId()}-error`;

  return (
    <div class="flex flex-col gap-1.5">
      <Show when={local.label}>
        <label
          for={inputId()}
          class={`text-sm font-medium text-gray-700 ${local.required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ""}`}
        >
          {local.label}
        </label>
      </Show>
      <div class="relative">
        <select
          id={inputId()}
          name={local.name}
          value={local.value ?? ""}
          disabled={local.disabled}
          required={local.required}
          aria-invalid={!!local.error}
          aria-describedby={local.error ? errorId() : undefined}
          onChange={(e) => local.onChange?.(e.currentTarget.value)}
          class={`w-full appearance-none border bg-white text-gray-900 pr-10 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size()]} ${local.error ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"} ${local.class ?? ""}`}
          {...rest}
        >
          <Show when={local.placeholder}>
            <option value="" disabled>{local.placeholder}</option>
          </Show>
          <For each={local.options}>
            {(option) => (
              <option value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            )}
          </For>
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <svg class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
          </svg>
        </div>
      </div>
      <Show when={local.error}>
        <p id={errorId()} class="text-sm text-red-600" role="alert">{local.error}</p>
      </Show>
    </div>
  );
}
