import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  select: (id: string) => Promise<void>;
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
  const selectionQueue = useRef<Promise<void>>(Promise.resolve());
  const select = useCallback((id: string) => {
    const next = selectionQueue.current
      .catch(() => undefined)
      .then(async () => {
        const result = await request<{ teamId: string }>("/profile/selected-team", undefined, {
          teamId: id,
        });
        setSelected(result.teamId);
        localStorage.setItem(KEY, result.teamId);
      });
    selectionQueue.current = next;
    return next;
  }, []);
  const refresh = useCallback(async () => {
    if (!session) {
      setError(null);
      setOrganizations([]);
      setUser(null);
      setClassSpace(null);
      setSelected(null);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const result = await request<{
        organizations: Organization[];
        user: OrgState["user"];
        class: OrgState["classSpace"];
        selectedTeamId: string | null;
      }>("/me");
      setOrganizations(result.organizations);
      setUser(result.user);
      setClassSpace(result.class);
      const remembered = localStorage.getItem(KEY);
      const linkedTeam = new URLSearchParams(window.location.search).get("team");
      const nextTeamId =
        result.organizations.find((o) => o.id === linkedTeam)?.id ??
        result.organizations.find((o) => o.id === result.selectedTeamId)?.id ??
        result.organizations.find((o) => o.id === remembered)?.id ??
        result.organizations[0]?.id ??
        null;
      if (nextTeamId && nextTeamId !== result.selectedTeamId) await select(nextTeamId);
      else {
        setSelected(nextTeamId);
        if (nextTeamId) localStorage.setItem(KEY, nextTeamId);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setLoading(false);
    }
  }, [session, select]);
  useEffect(() => {
    if (authLoading) return;
    const timer = setTimeout(() => {
      void refresh().catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, [authLoading, refresh]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY || !event.newValue) return;
      if (organizations.some((team) => team.id === event.newValue)) setSelected(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [organizations]);
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
