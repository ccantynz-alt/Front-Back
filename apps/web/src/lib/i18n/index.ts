import { createSignal } from "solid-js";
import { en } from "./locales/en";
import { es } from "./locales/es";
import type { Dictionary, DictionaryKey } from "./locales/en";

export type { Dictionary, DictionaryKey };

export type Locale = "en" | "es";

const dictionaries: Record<Locale, Dictionary> = { en, es };

const availableLocales: readonly Locale[] = ["en", "es"] as const;

/**
 * Creates an i18n instance with SolidJS signal-based locale tracking.
 * Supports flat key lookup via dot-notation keys defined in the dictionary.
 */
export function createI18n(initialLocale: Locale = "en") {
  const [locale, setLocale] = createSignal<Locale>(initialLocale);

  /**
   * Translate a key to the current locale's string value.
   * Falls back to English if the key is missing in the current locale,
   * and returns the key itself as a last resort.
   */
  function t(key: DictionaryKey): string {
    const currentDict = dictionaries[locale()];
    if (key in currentDict) {
      return currentDict[key];
    }
    // Fallback to English
    if (key in en) {
      return en[key];
    }
    return key;
  }

  return {
    /** Translate a dictionary key to the current locale */
    t,
    /** Reactive signal returning the current locale */
    locale,
    /** Set the active locale */
    setLocale,
    /** List of all available locales */
    locales: availableLocales,
  } as const;
}
