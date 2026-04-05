import {
  type Accessor,
  type JSX,
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import type { User } from "@back-to-the-future/schemas";
import { trpc, fetchCsrfToken, clearCsrfToken, checkApiHealth } from "../lib/trpc";

// ── Auth State Types ──────────────────────────────────────────────────

interface AuthState {
  currentUser: Accessor<User | null>;
  isAuthenticated: Accessor<boolean>;
  isLoading: Accessor<boolean>;
  error: Accessor<string | null>;
  login: (email: string) => Promise<void>;
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
    // Storage full or unavailable
  }
}

function removeStorageItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable
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

  /**
   * Register with passkey: two-step WebAuthn ceremony via tRPC.
   * 1. Fetch CSRF token
   * 2. Call auth.register.start → get PublicKeyCredentialCreationOptions
   * 3. Browser creates credential via navigator.credentials.create()
   * 4. Fetch fresh CSRF token for finish step
   * 5. Call auth.register.finish → verify + create session
   */
  const register = async (email: string, displayName: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch CSRF token before mutation
      await fetchCsrfToken();

      // Step 1: Get registration options from server
      const { options, userId } = await trpc.auth.register.start.mutate({
        email,
        displayName,
      });

      // Fetch fresh CSRF token for finish step (tokens are single-use)
      await fetchCsrfToken();

      // Step 2: Browser creates the passkey credential
      const credential = await startRegistration({ optionsJSON: options });

      // Step 3: Send credential to server for verification
      const result = await trpc.auth.register.finish.mutate({
        userId,
        response: credential as Parameters<typeof trpc.auth.register.finish.mutate>[0]["response"],
      });

      if (result.verified && result.token) {
        setStorageItem(SESSION_TOKEN_KEY, result.token);
        clearCsrfToken();
        // Fetch the user profile
        await checkSession();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Login with passkey: two-step WebAuthn ceremony via tRPC.
   * 1. Fetch CSRF token
   * 2. Call auth.login.start → get PublicKeyCredentialRequestOptions
   * 3. Browser asserts credential via navigator.credentials.get()
   * 4. Fetch fresh CSRF token for finish step
   * 5. Call auth.login.finish → verify + create session
   */
  const login = async (email: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch CSRF token before mutation
      await fetchCsrfToken();

      // Step 1: Get authentication options from server
      const { options, userId } = await trpc.auth.login.start.mutate({
        email,
      });

      // Fetch fresh CSRF token for finish step (tokens are single-use)
      await fetchCsrfToken();

      // Step 2: Browser asserts the passkey credential
      const credential = await startAuthentication({ optionsJSON: options });

      // Step 3: Send assertion to server for verification
      const result = await trpc.auth.login.finish.mutate({
        userId,
        response: credential as Parameters<typeof trpc.auth.login.finish.mutate>[0]["response"],
      });

      if (result.verified && result.token) {
        setStorageItem(SESSION_TOKEN_KEY, result.token);
        clearCsrfToken();
        // Fetch the user profile
        await checkSession();
      }
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
      await trpc.auth.logout.mutate().catch(() => {
        // Best-effort logout on server
      });
    } finally {
      removeStorageItem(SESSION_TOKEN_KEY);
      removeStorageItem(USER_CACHE_KEY);
      setCurrentUser(null);
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
      const user = await trpc.auth.me.query();
      setCurrentUser(user as User);
    } catch {
      // Session invalid -- clear local state
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
