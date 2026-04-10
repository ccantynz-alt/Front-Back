import type { JSX } from "solid-js";
import { splitProps, Show, For } from "solid-js";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean | undefined;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string | undefined;
  placeholder?: string | undefined;
  label?: string | undefined;
  error?: string | undefined;
  disabled?: boolean | undefined;
  name?: string | undefined;
  class?: string | undefined;
  onChange?: ((value: string) => void) | undefined;
}

export function Select(props: SelectProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "options",
    "value",
    "placeholder",
    "label",
    "error",
    "disabled",
    "name",
    "class",
    "onChange",
  ]);

  return (
    <div class="select-wrapper">
      <Show when={local.label}>
        <label class="select-label">{local.label}</label>
      </Show>
      <select
        class={`select ${local.error ? "select-error" : ""} ${local.class ?? ""}`}
        value={local.value ?? ""}
        name={local.name}
        disabled={local.disabled}
        aria-invalid={!!local.error}
        aria-describedby={local.error ? `${local.name}-error` : undefined}
        onChange={(e) => local.onChange?.(e.currentTarget.value)}
        {...rest}
      >
        <Show when={local.placeholder}>
          <option value="" disabled>
            {local.placeholder}
          </option>
        </Show>
        <For each={local.options}>
          {(option) => (
            <option value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          )}
        </For>
      </select>
      <Show when={local.error}>
        <span class="select-error-text" id={`${local.name}-error`}>
          {local.error}
        </span>
      </Show>
    </div>
  );
}
