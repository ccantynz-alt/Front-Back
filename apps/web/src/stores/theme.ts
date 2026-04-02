import {
  type Accessor,
  type JSX,
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";

// ── Theme Types ───────────────────────────────────────────────────────

type Theme = "light" | "dark";

interface ThemeState {
  theme: Accessor<Theme>;
  isDark: Accessor<boolean>;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// ── Storage Key ───────────────────────────────────────────────────────

const THEME_KEY = "btf_theme";

// ── Helper: Resolve Initial Theme ─────────────────────────────────────

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage unavailable
  }

  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

// ── Theme Context ─────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeState>();

export function ThemeProvider(props: { children: JSX.Element }): JSX.Element {
  const [theme, setThemeSignal] = createSignal<Theme>(getInitialTheme());
  const isDark: Accessor<boolean> = (): boolean => theme() === "dark";

  // Apply theme class to document and persist
  createEffect((): void => {
    const current = theme();
    if (typeof document === "undefined") return;

    document.documentElement.classList.toggle("dark", current === "dark");
    document.documentElement.setAttribute("data-theme", current);

    try {
      localStorage.setItem(THEME_KEY, current);
    } catch {
      // Storage unavailable
    }
  });

  const toggleTheme = (): void => {
    setThemeSignal((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setTheme = (newTheme: Theme): void => {
    setThemeSignal(newTheme);
  };

  const state: ThemeState = {
    theme,
    isDark,
    toggleTheme,
    setTheme,
  };

  const Provider = ThemeContext.Provider as (props: {
    value: ThemeState;
    children: JSX.Element;
  }) => JSX.Element;

  return Provider({ value: state, children: props.children });
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
