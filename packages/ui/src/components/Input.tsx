import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  label?: string | undefined;
  error?: string | undefined;
}

export function Input(props: InputProps): JSX.Element {
  const [local, rest] = splitProps(props, ["label", "error", "class"]);

  return (
    <div class="input-wrapper">
      {local.label && <label class="input-label">{local.label}</label>}
      <input
        class={`input ${local.error ? "input-error" : ""} ${local.class ?? ""}`}
        {...rest}
      />
      {local.error && <span class="input-error-text">{local.error}</span>}
    </div>
  );
}
