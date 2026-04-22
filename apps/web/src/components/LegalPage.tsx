/**
 * Legal page layout — shared by /privacy, /terms, /cookies.
 *
 * Renders a lightweight markdown string as readable legal typography.
 * Keeps the single-source-of-truth MD files in docs/legal/ in sync with
 * the published routes: each route passes its MD content to this
 * component as a string literal.
 */

import { For } from "solid-js";
import type { JSX } from "solid-js";

interface LegalPageProps {
  title: string;
  updated: string;
  version: string;
  sections: LegalSection[];
}

export interface LegalSection {
  heading: string;
  level: 2 | 3;
  blocks: LegalBlock[];
}

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

function renderInline(text: string): JSX.Element {
  // Very small bold parser — **text** → <strong>text</strong>.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <For each={parts}>
      {(part) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong>{part.slice(2, -2)}</strong>;
        }
        return <>{part}</>;
      }}
    </For>
  );
}

function renderBlock(block: LegalBlock): JSX.Element {
  if (block.type === "p") {
    return (
      <p class="mb-4 leading-[1.75]" style={{ color: "#334155" }}>
        {renderInline(block.text)}
      </p>
    );
  }
  if (block.type === "ul") {
    return (
      <ul class="mb-4 ml-6 list-disc space-y-2 leading-[1.7]" style={{ color: "#334155" }}>
        <For each={block.items}>
          {(item) => <li>{renderInline(item)}</li>}
        </For>
      </ul>
    );
  }
  if (block.type === "table") {
    return (
      <div class="mb-5 overflow-x-auto">
        <table class="w-full border-collapse text-[0.9375rem]" style={{ color: "#334155" }}>
          <thead>
            <tr style={{ "border-bottom": "2px solid #cbd5e1" }}>
              <For each={block.headers}>
                {(h) => (
                  <th class="px-3 py-2 text-left font-semibold" style={{ color: "#0f172a" }}>
                    {h}
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={block.rows}>
              {(row) => (
                <tr style={{ "border-bottom": "1px solid #e2e8f0" }}>
                  <For each={row}>
                    {(cell) => <td class="px-3 py-2 align-top">{renderInline(cell)}</td>}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    );
  }
  return <></>;
}

export default function LegalPage(props: LegalPageProps): JSX.Element {
  return (
    <div class="min-h-screen" style={{ background: "#ffffff" }}>
      <div class="mx-auto max-w-[760px] px-6 py-16 lg:px-8 lg:py-24">
        <div class="mb-10 border-b pb-6" style={{ "border-color": "#e2e8f0" }}>
          <h1 class="mb-3 text-[2.25rem] font-bold tracking-tight" style={{ color: "#0f172a" }}>
            {props.title}
          </h1>
          <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: "#64748b" }}>
            <span>Version: {props.version}</span>
            <span>Last updated: {props.updated}</span>
          </div>
        </div>

        <div>
          <For each={props.sections}>
            {(section) => (
              <section class="mb-10">
                {section.level === 2 ? (
                  <h2
                    class="mb-4 text-[1.5rem] font-bold tracking-tight"
                    style={{ color: "#0f172a" }}
                  >
                    {section.heading}
                  </h2>
                ) : (
                  <h3
                    class="mb-3 mt-6 text-[1.125rem] font-semibold"
                    style={{ color: "#1e293b" }}
                  >
                    {section.heading}
                  </h3>
                )}
                <For each={section.blocks}>{(block) => renderBlock(block)}</For>
              </section>
            )}
          </For>
        </div>

        <div class="mt-16 border-t pt-6 text-sm" style={{ "border-color": "#e2e8f0", color: "#64748b" }}>
          <p>
            Questions? Email <a href="mailto:legal@crontech.ai" style={{ color: "#6366f1" }}>legal@crontech.ai</a>.
          </p>
          <p class="mt-2">
            <a href="/" style={{ color: "#6366f1" }}>← Back to Crontech</a>
            <span class="mx-2">·</span>
            <a href="/privacy" style={{ color: "#6366f1" }}>Privacy</a>
            <span class="mx-2">·</span>
            <a href="/terms" style={{ color: "#6366f1" }}>Terms</a>
            <span class="mx-2">·</span>
            <a href="/cookies" style={{ color: "#6366f1" }}>Cookies</a>
          </p>
        </div>
      </div>
    </div>
  );
}
