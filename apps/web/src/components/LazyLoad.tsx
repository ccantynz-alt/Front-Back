/**
 * Lazy loading primitives for SolidJS.
 *
 * - LazyLoad: renders children only when the container enters the viewport.
 * - LazyImage: image with native lazy loading, blur-up placeholder, and fetchpriority.
 */
import {
  type JSX,
  type ParentProps,
  Show,
  Suspense,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

/* ── LazyLoad ──────────────────────────────────────────────────────── */

export interface LazyLoadProps extends ParentProps {
  /** Root margin for IntersectionObserver (default: "200px") */
  rootMargin?: string;
  /** Visibility threshold 0-1 (default: 0) */
  threshold?: number;
  /** Fallback while waiting for visibility or Suspense */
  fallback?: JSX.Element;
  /** CSS class applied to the wrapper div */
  class?: string;
}

/**
 * Renders children only when the wrapper element scrolls into view.
 * Uses IntersectionObserver for zero-cost idle detection and wraps
 * content in Suspense for code-split component support.
 */
export function LazyLoad(props: LazyLoadProps): JSX.Element {
  const [visible, setVisible] = createSignal(false);
  let ref: HTMLDivElement | undefined;

  onMount(() => {
    if (!ref) return;

    // If IntersectionObserver is not available, render immediately
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: props.rootMargin ?? "200px",
        threshold: props.threshold ?? 0,
      },
    );

    observer.observe(ref);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={ref}
      class={props.class}
      style={{ "content-visibility": visible() ? "visible" : "auto" }}
    >
      <Show when={visible()} fallback={props.fallback}>
        <Suspense fallback={props.fallback}>{props.children}</Suspense>
      </Show>
    </div>
  );
}

/* ── LazyImage ─────────────────────────────────────────────────────── */

export interface LazyImageProps {
  /** Image source URL */
  src: string;
  /** Alt text (required for accessibility) */
  alt: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** CSS class */
  class?: string;
  /** Fetch priority hint: "high" for above-the-fold, "low" for below */
  fetchpriority?: "high" | "low" | "auto";
  /** Optional low-res placeholder for blur-up effect */
  placeholder?: string;
  /** Responsive sizes attribute */
  sizes?: string;
  /** Responsive srcset attribute */
  srcset?: string;
}

/**
 * Lazy-loaded image with optional blur-up placeholder.
 *
 * Uses native `loading="lazy"` and `fetchpriority` for optimal browser
 * scheduling. When a `placeholder` is provided, it shows a blurred
 * low-res version that crossfades to the full image on load.
 */
export function LazyImage(props: LazyImageProps): JSX.Element {
  const [loaded, setLoaded] = createSignal(false);
  const isAboveFold = props.fetchpriority === "high";

  return (
    <div
      class={props.class}
      style={{
        position: "relative",
        overflow: "hidden",
        width: props.width ? `${props.width}px` : undefined,
        height: props.height ? `${props.height}px` : undefined,
      }}
    >
      {/* Blur-up placeholder */}
      <Show when={props.placeholder && !loaded()}>
        <img
          src={props.placeholder}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "0",
            width: "100%",
            height: "100%",
            "object-fit": "cover",
            filter: "blur(20px)",
            transform: "scale(1.1)",
            transition: "opacity 0.3s ease",
            opacity: loaded() ? "0" : "1",
          }}
        />
      </Show>
      {/* Full image */}
      <img
        src={props.src}
        alt={props.alt}
        width={props.width}
        height={props.height}
        loading={isAboveFold ? "eager" : "lazy"}
        decoding={isAboveFold ? "sync" : "async"}
        fetchpriority={props.fetchpriority ?? "auto"}
        sizes={props.sizes}
        srcset={props.srcset}
        onLoad={() => setLoaded(true)}
        style={{
          width: "100%",
          height: "100%",
          "object-fit": "cover",
          transition: "opacity 0.3s ease",
          opacity: loaded() || !props.placeholder ? "1" : "0",
        }}
      />
    </div>
  );
}
