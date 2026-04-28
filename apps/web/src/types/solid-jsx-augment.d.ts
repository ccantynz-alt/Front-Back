// Module augmentation: add `key` to SolidJS JSX element types.
// TypeScript 6 validates JSX props against HTMLAttributes<T> directly.
// SolidJS omits `key` because it uses <For>/<Index> for keyed iteration,
// but Biome's useJsxKeyInIterable rule still requires it on iterable elements.
// Augmenting DOMAttributes (base of HTMLAttributes) is the correct fix.
import "solid-js";

declare module "solid-js" {
  namespace JSX {
    interface DOMAttributes<T> {
      key?: string | number | null;
    }
    interface IntrinsicAttributes {
      key?: string | number | null;
    }
  }
}
