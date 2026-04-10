import { type JSX, Show, splitProps, createSignal } from "solid-js";

export interface AvatarProps {
  src?: string | undefined;
  alt?: string | undefined;
  initials?: string | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  class?: string | undefined;
}

export function Avatar(props: AvatarProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "src",
    "alt",
    "initials",
    "size",
    "class",
  ]);

  const [imgError, setImgError] = createSignal(false);

  const showImage = (): boolean => !!local.src && !imgError();

  return (
    <div
      class={`avatar avatar-${local.size ?? "md"} ${local.class ?? ""}`}
      role="img"
      aria-label={local.alt ?? local.initials ?? "Avatar"}
      {...rest}
    >
      <Show when={showImage()} fallback={
        <span class="avatar-fallback">{local.initials ?? "?"}</span>
      }>
        <img
          class="avatar-image"
          src={local.src}
          alt={local.alt ?? ""}
          onError={() => setImgError(true)}
        />
      </Show>
    </div>
  );
}
