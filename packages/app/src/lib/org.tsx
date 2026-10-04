import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { request } from "./api.ts";
import { useAuth } from "./auth.tsx";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
}
interface OrgState {
  organizations: Organization[];
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatarPath: string | null;
    onboarded: boolean;
  } | null;
  classSpace: { classId: string; name: string; role: "admin" | "member" } | null;
  org: Organization | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (id: string) => void;
}
const Context = createContext<OrgState | null>(null);
const KEY = "contac:active-org";
export function OrgProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [user, setUser] = useState<OrgState["user"]>(null);
  const [classSpace, setClassSpace] = useState<OrgState["classSpace"]>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!session) {
      setError(null);
      setOrganizations([]);
      setUser(null);
      setClassSpace(null);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const result = await request<{
        organizations: Organization[];
        user: OrgState["user"];
        class: OrgState["classSpace"];
      }>("/me");
      setOrganizations(result.organizations);
      setUser(result.user);
      setClassSpace(result.class);
      const remembered = localStorage.getItem(KEY);
      setSelected(
        (current) =>
          result.organizations.find((o) => o.id === current)?.id ??
          result.organizations.find((o) => o.id === remembered)?.id ??
          result.organizations[0]?.id ??
          null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    if (authLoading) return;
    const timer = setTimeout(() => {
      void refresh().catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [authLoading, refresh]);
  const select = (id: string) => {
    setSelected(id);
    localStorage.setItem(KEY, id);
  };
  return (
    <Context.Provider
      value={{
        organizations,
        user,
        classSpace,
        org: organizations.find((o) => o.id === selected) ?? null,
        loading: loading || authLoading,
        error,
        refresh,
        select,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useOrg() {
  const value = useContext(Context);
  if (!value) throw new Error("OrgProvider missing");
  return value;
}
