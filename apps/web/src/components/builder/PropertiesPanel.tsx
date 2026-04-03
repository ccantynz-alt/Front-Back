// ── Properties Panel ──────────────────────────────────────────────────
// Shows editable props for the selected component. Reads the Zod schema
// from ComponentRegistry to auto-generate form fields. Changes reflect
// immediately on canvas via editor store signals.

import { type JSX, For, Show, createMemo, createSignal } from "solid-js";
import { ComponentRegistry, type ComponentName } from "@cronix/ui";
import { useEditor } from "../../stores/editor";
import type { z } from "zod";

// ── Zod Shape Introspection ─────────────────────────────────────────

interface PropField {
  key: string;
  type: "string" | "boolean" | "enum" | "number" | "unknown";
  options?: string[];
  defaultValue?: unknown;
  description?: string;
  isAdvanced: boolean;
}

/** Common props shown in main section; rest goes to Advanced */
const COMMON_PROP_KEYS = new Set([
  "variant", "size", "label", "content", "placeholder", "disabled",
  "checked", "direction", "gap", "align", "justify", "title",
  "description", "required", "error", "src", "alt", "name",
  "value", "fullWidth", "loading", "open", "orientation",
]);

function extractFieldsFromSchema(schema: z.ZodType): PropField[] {
  const fields: PropField[] = [];

  // Navigate through ZodObject
  const shape = getZodShape(schema);
  if (!shape) return fields;

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const field = introspectField(key, fieldSchema as z.ZodType);
    if (field) {
      fields.push(field);
    }
  }

  return fields;
}

function getZodShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  const s = schema as Record<string, unknown>;
  if (s._def && typeof s._def === "object") {
    const def = s._def as Record<string, unknown>;
    if (def.shape && typeof def.shape === "function") {
      return (def.shape as () => Record<string, z.ZodType>)();
    }
    if (def.shape && typeof def.shape === "object") {
      return def.shape as Record<string, z.ZodType>;
    }
  }
  return null;
}

function introspectField(key: string, schema: z.ZodType): PropField | null {
  const def = (schema as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) return null;

  // Unwrap default
  let inner = schema;
  let defaultValue: unknown = undefined;
  const typeName = def.typeName as string | undefined;

  if (typeName === "ZodDefault") {
    defaultValue = (def.defaultValue as () => unknown)?.();
    inner = def.innerType as z.ZodType;
  }

  // Unwrap optional
  const innerDef = (inner as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  const innerTypeName = innerDef?.typeName as string | undefined;
  if (innerTypeName === "ZodOptional") {
    inner = innerDef?.innerType as z.ZodType;
  }

  const finalDef = (inner as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  const finalTypeName = finalDef?.typeName as string | undefined;

  const isAdvanced = !COMMON_PROP_KEYS.has(key);

  if (finalTypeName === "ZodEnum") {
    const values = finalDef?.values as string[];
    return { key, type: "enum", options: values, defaultValue, isAdvanced };
  }
  if (finalTypeName === "ZodBoolean") {
    return { key, type: "boolean", defaultValue: defaultValue ?? false, isAdvanced };
  }
  if (finalTypeName === "ZodString") {
    return { key, type: "string", defaultValue, isAdvanced };
  }
  if (finalTypeName === "ZodNumber") {
    return { key, type: "number", defaultValue, isAdvanced };
  }

  // Skip complex types (arrays, objects) for now
  return null;
}

// ── Field Renderer ──────────────────────────────────────────────────

interface FieldEditorProps {
  field: PropField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

function FieldEditor(props: FieldEditorProps): JSX.Element {
  const displayValue = (): unknown => props.value ?? props.field.defaultValue ?? "";

  return (
    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-gray-600 capitalize">{props.field.key}</label>

      {/* String field */}
      <Show when={props.field.type === "string"}>
        <input
          type="text"
          value={String(displayValue())}
          onInput={(e) => props.onChange(props.field.key, e.currentTarget.value)}
          class="w-full h-8 px-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </Show>

      {/* Number field */}
      <Show when={props.field.type === "number"}>
        <input
          type="number"
          value={displayValue() as number}
          onInput={(e) => props.onChange(props.field.key, Number(e.currentTarget.value))}
          class="w-full h-8 px-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </Show>

      {/* Boolean field (toggle) */}
      <Show when={props.field.type === "boolean"}>
        <button
          type="button"
          role="switch"
          aria-checked={!!displayValue()}
          onClick={() => props.onChange(props.field.key, !displayValue())}
          class={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${
            displayValue() ? "bg-blue-600" : "bg-gray-200"
          }`}
        >
          <span
            class={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
              displayValue() ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
      </Show>

      {/* Enum field (select) */}
      <Show when={props.field.type === "enum" && props.field.options}>
        <select
          value={String(displayValue())}
          onChange={(e) => props.onChange(props.field.key, e.currentTarget.value)}
          class="w-full h-8 px-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
        >
          <For each={props.field.options ?? []}>
            {(option) => (
              <option value={option}>{option}</option>
            )}
          </For>
        </select>
      </Show>
    </div>
  );
}

// ── Properties Panel Component ──────────────────────────────────────

export function PropertiesPanel(): JSX.Element {
  const editor = useEditor();
  const [showAdvanced, setShowAdvanced] = createSignal(false);

  const selected = createMemo(() => editor.primarySelection());

  const componentSchema = createMemo((): z.ZodType | null => {
    const sel = selected();
    if (!sel) return null;
    const name = sel.type as ComponentName;
    return ComponentRegistry[name] ?? null;
  });

  const fields = createMemo((): PropField[] => {
    const schema = componentSchema();
    if (!schema) return [];
    return extractFieldsFromSchema(schema);
  });

  const mainFields = createMemo(() => fields().filter((f) => !f.isAdvanced));
  const advancedFields = createMemo(() => fields().filter((f) => f.isAdvanced));

  function handlePropChange(key: string, value: unknown): void {
    const sel = selected();
    if (!sel) return;
    editor.updateComponentProps(sel.id, { [key]: value });
  }

  return (
    <div class="flex flex-col h-full overflow-hidden">
      <div class="px-3 py-2 border-b border-gray-200">
        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Properties</span>
      </div>

      <Show
        when={selected()}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center p-4 text-gray-400">
            <svg class="w-10 h-10 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            <span class="text-sm">Select a component</span>
            <span class="text-xs mt-1">to edit its properties</span>
          </div>
        }
      >
        {(sel) => (
          <div class="flex-1 overflow-y-auto">
            {/* Component info header */}
            <div class="px-3 py-3 bg-gray-50 border-b border-gray-200">
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-gray-800">{sel().type}</span>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    class={`p-1 rounded transition-colors ${sel().visible ? "text-gray-500 hover:bg-gray-200" : "text-gray-300"}`}
                    onClick={() => editor.toggleComponentVisibility(sel().id)}
                    title={sel().visible ? "Hide" : "Show"}
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <Show when={sel().visible} fallback={
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      }>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </Show>
                    </svg>
                  </button>
                  <button
                    type="button"
                    class={`p-1 rounded transition-colors ${sel().locked ? "text-amber-500" : "text-gray-500 hover:bg-gray-200"}`}
                    onClick={() => editor.toggleComponentLock(sel().id)}
                    title={sel().locked ? "Unlock" : "Lock"}
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <Show when={sel().locked} fallback={
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      }>
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </Show>
                    </svg>
                  </button>
                </div>
              </div>
              {/* Editable name */}
              <input
                type="text"
                value={sel().name}
                onInput={(e) => editor.renameComponent(sel().id, e.currentTarget.value)}
                class="mt-1.5 w-full h-7 px-2 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Component name"
              />
            </div>

            {/* Main fields */}
            <div class="px-3 py-3 space-y-3">
              <For each={mainFields()}>
                {(field) => (
                  <FieldEditor
                    field={field}
                    value={sel().props[field.key]}
                    onChange={handlePropChange}
                  />
                )}
              </For>
            </div>

            {/* Advanced section */}
            <Show when={advancedFields().length > 0}>
              <div class="border-t border-gray-200">
                <button
                  type="button"
                  class="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setShowAdvanced((p) => !p)}
                >
                  <svg
                    class={`w-3 h-3 transition-transform ${showAdvanced() ? "rotate-90" : ""}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Advanced ({advancedFields().length})
                </button>
                <Show when={showAdvanced()}>
                  <div class="px-3 pb-3 space-y-3">
                    <For each={advancedFields()}>
                      {(field) => (
                        <FieldEditor
                          field={field}
                          value={sel().props[field.key]}
                          onChange={handlePropChange}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Actions */}
            <div class="border-t border-gray-200 px-3 py-3">
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 h-8 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  onClick={() => editor.duplicate()}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  class="flex-1 h-8 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                  onClick={() => editor.removeComponent(sel().id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
