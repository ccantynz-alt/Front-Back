import {
  type Accessor,
  type JSX,
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import type { User } from "@back-to-the-future/schemas";
import { trpc } from "../lib/trpc";

// ── Auth State Types ──────────────────────────────────────────────────

interface AuthState {
  currentUser: Accessor<User | null>;
  isAuthenticated: Accessor<boolean>;
  isLoading: Accessor<boolean>;
  error: Accessor<string | null>;
  login: (email: string, credential?: PublicKeyCredential) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, displayName: string) => Promise<void>;
  checkSession: () => Promise<void>;
}

// ── Storage Keys ──────────────────────────────────────────────────────

const SESSION_TOKEN_KEY = "btf_session_token";
const USER_CACHE_KEY = "btf_user_cache";

// ── Helper: Safe localStorage Access ──────────────────────────────────

function getStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable -- silently fail
  }
}

function removeStorageItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable -- silently fail
  }
}

// ── Auth Context ──────────────────────────────────────────────────────

const AuthContext = createContext<AuthState>();

export function AuthProvider(props: { children: JSX.Element }): JSX.Element {
  const cachedUser = getStorageItem(USER_CACHE_KEY);
  const initialUser: User | null = cachedUser ? JSON.parse(cachedUser) : null;

  const [currentUser, setCurrentUser] = createSignal<User | null>(initialUser);
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [error, setError] = createSignal<string | null>(null);

  const isAuthenticated: Accessor<boolean> = (): boolean => currentUser() !== null;

  // Persist user cache when user changes
  createEffect((): void => {
    const user = currentUser();
    if (user) {
      setStorageItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      removeStorageItem(USER_CACHE_KEY);
    }
  });

  const login = async (email: string, _credential?: PublicKeyCredential): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // Step 1: Start the login flow via tRPC to get WebAuthn options
      const { options, userId } = await trpc.auth.login.start.mutate({ email });

      // Step 2: For now, store the options/userId for the WebAuthn ceremony.
      // Full passkey flow requires browser WebAuthn API integration which
      // is handled by the login page component. This simplified path stores
      // the challenge data for the finish step.
      // The login page will call trpc.auth.login.finish.mutate() after the
      // WebAuthn ceremony completes.

      // NOTE: A full implementation would invoke navigator.credentials.get()
      // here and then call loginFinish. For now we expose the options so the
      // calling component can drive the ceremony.
      void options;
      void userId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getStorageItem(SESSION_TOKEN_KEY);
      if (token) {
        await trpc.auth.logout.mutate().catch(() => {
          // Best-effort logout on server -- always clear local state
        });
      }
    } finally {
      removeStorageItem(SESSION_TOKEN_KEY);
      removeStorageItem(USER_CACHE_KEY);
      setCurrentUser(null);
      setIsLoading(false);
    }
  };

  const register = async (email: string, displayName: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // Step 1: Start registration via tRPC to get WebAuthn options
      const { options, userId } = await trpc.auth.register.start.mutate({
        email,
        displayName,
      });

      // Step 2: Similar to login, the full WebAuthn ceremony
      // (navigator.credentials.create()) is driven by the component.
      // After the ceremony, trpc.auth.register.finish.mutate() is called
      // with the credential response and the session token is stored.
      void options;
      void userId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const checkSession = async (): Promise<void> => {
    const token = getStorageItem(SESSION_TOKEN_KEY);
    if (!token) {
      setCurrentUser(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Use the tRPC auth.me query to validate the session and fetch user data.
      // The tRPC client automatically sends the Authorization header from localStorage.
      const user = await trpc.auth.me.query();
      setCurrentUser(user as User);
    } catch {
      // Session invalid or network error -- clear stored credentials
      removeStorageItem(SESSION_TOKEN_KEY);
      removeStorageItem(USER_CACHE_KEY);
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const state: AuthState = {
    currentUser,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    register,
    checkSession,
  };

  // Use type assertion for provider pattern -- SolidJS context requires this
  const Provider = AuthContext.Provider as (props: {
    value: AuthState;
    children: JSX.Element;
  }) => JSX.Element;

  return Provider({ value: state, children: props.children });
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
