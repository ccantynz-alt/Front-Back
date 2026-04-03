import { z } from "zod";
import { type JSX, Show, splitProps, createSignal } from "solid-js";

// ── Zod Schema (AI Composability) ───────────────────��────────────────
export const AvatarPropsSchema = z.object({
  src: z.string().optional(),
  alt: z.string().optional(),
  initials: z.string().optional(),
  size: z.enum(["xs", "sm", "md", "lg", "xl"]).default("md"),
});

export type AvatarSchemaProps = z.input<typeof AvatarPropsSchema>;

export interface AvatarProps extends AvatarSchemaProps {
  class?: string;
}

const sizeClasses: Record<NonNullable<AvatarSchemaProps["size"]>, string> = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

export function Avatar(props: AvatarProps): JSX.Element {
  const [local, rest] = splitProps(props, ["src", "alt", "initials", "size", "class"]);
  const [imgError, setImgError] = createSignal(false);
  const showImage = (): boolean => !!local.src && !imgError();
  const size = (): NonNullable<AvatarSchemaProps["size"]> => local.size ?? "md";

  return (
    <div
      class={`relative inline-flex items-center justify-center rounded-full bg-gray-200 overflow-hidden shrink-0 ${sizeClasses[size()]} ${local.class ?? ""}`}
      role="img"
      aria-label={local.alt ?? local.initials ?? "Avatar"}
      {...rest}
    >
      <Show
        when={showImage()}
        fallback={
          <span class="font-medium text-gray-600 select-none">{local.initials ?? "?"}</span>
        }
      >
        <img
          class="h-full w-full object-cover"
          src={local.src}
          alt={local.alt ?? ""}
          onError={() => setImgError(true)}
        />
      </Show>
    </div>
  );
}
