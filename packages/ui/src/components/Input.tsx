import { z } from "zod";
import { type JSX, splitProps, Show } from "solid-js";

// ── Zod Schema (AI Composability) ────────────────────────────────────
export const InputPropsSchema = z.object({
  type: z.enum(["text", "email", "password", "number", "search", "tel", "url"]).default("text"),
  placeholder: z.string().optional(),
  label: z.string().optional(),
  error: z.string().optional(),
  helperText: z.string().optional(),
  required: z.boolean().default(false),
  disabled: z.boolean().default(false),
  name: z.string().optional(),
  size: z.enum(["sm", "md", "lg"]).default("md"),
});

export type InputSchemaProps = z.input<typeof InputPropsSchema>;

export interface InputProps extends InputSchemaProps {
  value?: string;
  onInput?: (value: string) => void;
  onChange?: (value: string) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
  iconLeft?: JSX.Element;
  iconRight?: JSX.Element;
  class?: string;
  id?: string;
}

const sizeClasses: Record<NonNullable<InputSchemaProps["size"]>, string> = {
  sm: "h-8 px-2.5 text-sm rounded-md",
  md: "h-10 px-3 text-sm rounded-lg",
  lg: "h-12 px-4 text-base rounded-lg",
};

const labelSizeClasses: Record<NonNullable<InputSchemaProps["size"]>, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function Input(props: InputProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "type", "placeholder", "label", "error", "helperText", "required",
    "disabled", "name", "size", "value", "onInput", "onChange", "onFocus",
    "onBlur", "iconLeft", "iconRight", "class", "id",
  ]);

  const size = (): NonNullable<InputSchemaProps["size"]> => local.size ?? "md";
  const inputId = (): string => local.id ?? local.name ?? "input";
  const errorId = (): string => `${inputId()}-error`;
  const helperId = (): string => `${inputId()}-helper`;

  return (
    <div class="flex flex-col gap-1.5">
      <Show when={local.label}>
        <label
          for={inputId()}
          class={`font-medium text-gray-700 ${labelSizeClasses[size()]} ${local.required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ""}`}
        >
          {local.label}
        </label>
      </Show>
      <div class="relative">
        <Show when={local.iconLeft}>
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
            {local.iconLeft}
          </div>
        </Show>
        <input
          id={inputId()}
          type={local.type ?? "text"}
          name={local.name}
          placeholder={local.placeholder}
          value={local.value ?? ""}
          required={local.required}
          disabled={local.disabled}
          aria-invalid={!!local.error}
          aria-describedby={local.error ? errorId() : local.helperText ? helperId() : undefined}
          onInput={(e) => local.onInput?.(e.currentTarget.value)}
          onChange={(e) => local.onChange?.(e.currentTarget.value)}
          onFocus={(e) => local.onFocus?.(e)}
          onBlur={(e) => local.onBlur?.(e)}
          class={`w-full border bg-white text-gray-900 placeholder:text-gray-400 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size()]} ${local.iconLeft ? "pl-10" : ""} ${local.iconRight ? "pr-10" : ""} ${local.error ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"} ${local.class ?? ""}`}
          {...rest}
        />
        <Show when={local.iconRight}>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
            {local.iconRight}
          </div>
        </Show>
      </div>
      <Show when={local.error}>
        <p id={errorId()} class="text-sm text-red-600" role="alert">{local.error}</p>
      </Show>
      <Show when={!local.error && local.helperText}>
        <p id={helperId()} class="text-sm text-gray-500">{local.helperText}</p>
      </Show>
    </div>
  );
}
