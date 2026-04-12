import {
  type Accessor,
  type JSX,
  createContext,
  createSignal,
  createMemo,
  onMount,
  useContext,
  children as resolveChildren,
} from "solid-js";

interface FeatureFlagData {
  key: string;
  enabled: boolean;
  evaluatedEnabled: boolean;
  description?: string | undefined;
  rolloutPercentage: number;
}

interface FeatureFlagContextState {
  flags: Accessor<Map<string, FeatureFlagData>>;
  isLoaded: Accessor<boolean>;
  isEnabled: (flagKey: string) => boolean;
  refresh: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextState>();

interface FeatureFlagProviderProps {
  children: JSX.Element;
}

export function FeatureFlagProvider(props: FeatureFlagProviderProps): JSX.Element {
  const [flags, setFlags] = createSignal<Map<string, FeatureFlagData>>(new Map());
  const [isLoaded, setIsLoaded] = createSignal(false);

  const fetchFlags = async (): Promise<void> => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/flags`);
      if (res.ok) {
        const data = await res.json() as { flags: Array<{ key: string; enabled: boolean; description?: string; rolloutPercentage: number }> };
        const flagMap = new Map<string, FeatureFlagData>();
        for (const flag of data.flags) {
          flagMap.set(flag.key, {
            key: flag.key,
            enabled: flag.enabled,
            evaluatedEnabled: flag.enabled,
            description: flag.description,
            rolloutPercentage: flag.rolloutPercentage,
          });
        }
        setFlags(flagMap);
      }
    } catch {
      // Flags unavailable, proceed with defaults
    }
    setIsLoaded(true);
  };

  onMount((): void => {
    void fetchFlags();
  });

  const isEnabled = (flagKey: string): boolean => {
    const flag = flags().get(flagKey);
    return flag?.evaluatedEnabled ?? false;
  };

  const state: FeatureFlagContextState = {
    flags,
    isLoaded,
    isEnabled,
    refresh: fetchFlags,
  };

  return (
    <FeatureFlagContext.Provider value={state}>
      {props.children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagContextState {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error("useFeatureFlags must be used within a FeatureFlagProvider");
  }
  return context;
}

export function createFeatureFlag(flagName: string): Accessor<boolean> {
  const context = useContext(FeatureFlagContext);
  if (!context) return (): boolean => false;
  return createMemo((): boolean => context.isEnabled(flagName));
}

interface FeatureGateProps {
  flag: string;
  fallback?: JSX.Element;
  children: JSX.Element;
}

export function FeatureGate(props: FeatureGateProps): JSX.Element {
  const context = useContext(FeatureFlagContext);
  const isEnabled = createMemo((): boolean => {
    if (!context) return false;
    return context.isEnabled(props.flag);
  });

  const resolved = resolveChildren(() => props.children);
  const fallbackResolved = resolveChildren(() => props.fallback);

  return createMemo((): JSX.Element => {
    if (isEnabled()) return resolved() as JSX.Element;
    return (fallbackResolved() ?? null) as JSX.Element;
  }) as unknown as JSX.Element;
}
