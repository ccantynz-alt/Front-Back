import type { JSX } from "solid-js";
import { createUniqueId, splitProps } from "solid-js";

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label?: string | undefined;
  error?: string | undefined;
}

export function Input(props: InputProps): JSX.Element {
  const [local, rest] = splitProps(props, ["label", "error", "class", "id"]);
  const fallbackId = createUniqueId();

  return (
    <div class="input-wrapper">
      {local.label && (
        <label class="input-label" for={local.id ?? fallbackId}>
          {local.label}
        </label>
      )}
      <input
        id={local.id ?? fallbackId}
        class={`input ${local.error ? "input-error" : ""} ${local.class ?? ""}`}
        {...rest}
      />
      {local.error && <span class="input-error-text">{local.error}</span>}
    </div>
  );
}
