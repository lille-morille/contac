import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "./supabase.ts";

interface AuthState {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const sb = getSupabase();
    void sb.auth.getSession().then(({ data }) => {
      if (live) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <Context.Provider
      value={{
        session,
        loading,
        signOut: async () => {
          await getSupabase().auth.signOut();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
