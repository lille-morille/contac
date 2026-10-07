import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth.tsx";
import { useOrg } from "./org.tsx";
import { clearRealtimeAuth, ensureRealtimeAuth, getSupabase } from "./supabase.ts";
import { request } from "./api.ts";

export type TeamChange = {
  teamId: string;
  entity: string;
  id: string;
  operation: "insert" | "update" | "delete";
  revision: string;
};
export type TeamPeer = { userId: string; contactId: string | null; editingId: string | null };

const core = new Set([
  "companies",
  "domain_tags",
  "company_domains",
  "person_tags",
  "contacts",
  "contact_person_tags",
  "saved_contact_views",
  "memberships",
  "member",
]);
const activities = new Set([
  "contact_activities",
  "activity_contacts",
  "activity_files",
  "workspace_files",
  "email_activities",
]);

export function keysForTeamChange(change: TeamChange, teamId: string): QueryKey[] {
  if (change.teamId !== teamId) return [];
  const keys: QueryKey[] = [];
  if (core.has(change.entity) && !(change.entity === "contacts" && change.operation === "update"))
    keys.push(["contact-data", teamId, "core"]);
  if (
    activities.has(change.entity) &&
    !(change.entity === "contact_activities" && change.operation === "update")
  )
    keys.push(["contact-data", teamId, "activities"]);
  if (change.entity === "contacts") keys.push(["duplicates", teamId]);
  if (change.entity === "contacts" || change.entity === "companies")
    keys.push(["inbox", teamId], ["overlap", teamId]);
  if (change.entity === "contacts" || change.entity === "contact_activities")
    keys.push(["library", teamId], ["semantic-search", teamId], ["group-ai", teamId]);
  if (change.entity === "library_items") keys.push(["library", teamId]);
  if (change.entity === "checkin_sessions" || change.entity === "contact_activities")
    keys.push(["sessions", teamId]);
  if (change.entity === "inbound_suggestions" || change.entity === "log_access_requests")
    keys.push(["inbox", teamId]);
  if (change.entity === "log_access_requests")
    keys.push(["overlap", teamId], ["shared-log", teamId]);
  if (change.entity === "email_drafts") keys.push(["email-drafts", teamId]);
  if (change.entity === "lois" || change.entity === "loi_versions")
    keys.push(["lois", teamId], ["loi-last-sent", teamId]);
  if (change.entity === "group_ai_summaries") keys.push(["group-ai", teamId]);
  if (change.entity === "search_chunks") keys.push(["semantic-search", teamId]);
  if (change.entity === "ai_usage") keys.push(["ai-usage", teamId]);
  if (change.entity === "checkin_ai_settings")
    keys.push(["checkin-ai", teamId], ["ai-team-default", teamId]);
  if (change.entity === "loi_settings") keys.push(["loi-settings", teamId]);
  if (change.entity === "ai_suggestions" || change.entity === "ai_edit_log")
    keys.push(["contact-ai", teamId]);
  return keys;
}

type TeamRealtimeState = {
  peers: TeamPeer[];
  setContact: (id: string | null) => void;
  setEditing: (id: string | null) => void;
};
const Context = createContext<TeamRealtimeState | null>(null);

export function TeamRealtimeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { org, user } = useOrg();
  const qc = useQueryClient();
  const [peers, setPeers] = useState<TeamPeer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceRef = useRef({
    contactId: null as string | null,
    editingId: null as string | null,
  });
  const [presence, setPresence] = useState<{ contactId: string | null; editingId: string | null }>({
    contactId: null,
    editingId: null,
  });
  const teamId = org?.id ?? null;
  const hasSession = !!session?.access_token;

  useEffect(() => {
    presenceRef.current = { contactId: null, editingId: null };
    setPresence(presenceRef.current);
  }, [teamId]);

  useEffect(() => {
    if (session?.access_token) void ensureRealtimeAuth(session.access_token);
    else clearRealtimeAuth();
  }, [session?.access_token]);

  useEffect(() => {
    if (!teamId || !hasSession || !user?.onboarded) return;
    const sb = getSupabase();
    let closed = false;
    const pending = new Map<string, QueryKey>();
    const changedContacts = new Set<string>();
    const changedActivities = new Set<string>();
    const generations = new Map<string, number>();
    let timer: number | undefined;
    const flush = () => {
      timer = undefined;
      for (const id of changedContacts) {
        const requestKey = `contact:${id}`;
        const generation = (generations.get(requestKey) ?? 0) + 1;
        generations.set(requestKey, generation);
        void request<Record<string, unknown>>(`/org/contact-records/${id}`, teamId)
          .then((row) => {
            if (generations.get(requestKey) !== generation || closed) return;
            qc.setQueryData<{ contacts: Record<string, unknown>[] }>(
              ["contact-data", teamId, "core"],
              (old) =>
                old
                  ? {
                      ...old,
                      contacts: (old.contacts.some((item) => item.id === id)
                        ? old.contacts.map((item) => (item.id === id ? row : item))
                        : [...old.contacts, row]
                      ).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
                    }
                  : old,
            );
            void qc.invalidateQueries({ queryKey: ["deleted-contacts", teamId] });
          })
          .catch(() => {
            void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "core"] });
            void qc.invalidateQueries({ queryKey: ["deleted-contacts", teamId] });
          });
      }
      for (const id of changedActivities) {
        const requestKey = `activity:${id}`;
        const generation = (generations.get(requestKey) ?? 0) + 1;
        generations.set(requestKey, generation);
        void request<Record<string, unknown>>(`/org/activity-records/${id}`, teamId)
          .then((row) => {
            if (generations.get(requestKey) !== generation || closed) return;
            qc.setQueryData<{ activities: Record<string, unknown>[] }>(
              ["contact-data", teamId, "activities"],
              (old) =>
                old
                  ? {
                      ...old,
                      activities: old.activities
                        .map((item) => (item.id === id ? row : item))
                        .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))),
                    }
                  : old,
            );
          })
          .catch(() => qc.invalidateQueries({ queryKey: ["contact-data", teamId, "activities"] }));
      }
      changedContacts.clear();
      changedActivities.clear();
      for (const key of pending.values()) void qc.invalidateQueries({ queryKey: key });
      pending.clear();
    };
    const enqueue = (key: QueryKey) => {
      pending.set(JSON.stringify(key), key);
      if (timer === undefined) timer = window.setTimeout(flush, 100);
    };
    const recover = () => {
      for (const key of [
        ["contact-data", teamId, "core"],
        ["contact-data", teamId, "activities"],
        ["contact-data", teamId, "personal"],
        ["inbox", teamId],
        ["library", teamId],
        ["sessions", teamId],
        ["email-drafts", teamId],
        ["lois", teamId],
        ["loi-last-sent", teamId],
        ["loi-settings", teamId],
        ["checkin-ai", teamId],
        ["ai-team-default", teamId],
        ["contact-ai", teamId],
        ["group-ai", teamId],
        ["semantic-search", teamId],
        ["ai-usage", teamId],
        ["overlap", teamId],
        ["shared-log", teamId],
        ["duplicates", teamId],
        ["email-settings", teamId],
      ])
        enqueue(key);
    };
    const channel = sb.channel(`team:${teamId}`, { config: { private: true } });
    channelRef.current = channel;
    const configured = channel
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        const change = payload as TeamChange;
        if (!change || change.teamId !== teamId || typeof change.entity !== "string") return;
        if (change.operation === "update" && change.entity === "contacts")
          changedContacts.add(change.id);
        if (change.operation === "update" && change.entity === "contact_activities")
          changedActivities.add(change.id);
        for (const key of keysForTeamChange(change, teamId)) enqueue(key);
        if (timer === undefined && (changedContacts.size || changedActivities.size))
          timer = window.setTimeout(flush, 100);
      })
      .on("presence", { event: "sync" }, () => {
        const next = Object.values(channel.presenceState()).flatMap((rows) =>
          rows.flatMap((row) => {
            const peer = row as unknown as Record<string, unknown>;
            return typeof peer.userId === "string"
              ? [
                  {
                    userId: peer.userId,
                    contactId: typeof peer.contactId === "string" ? peer.contactId : null,
                    editingId: typeof peer.editingId === "string" ? peer.editingId : null,
                  },
                ]
              : [];
          }),
        );
        if (!closed) setPeers(next);
      });
    void sb.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session?.access_token) throw new Error("Signed out");
        return ensureRealtimeAuth(data.session.access_token);
      })
      .then(() => {
        if (closed) return;
        configured.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            recover();
            void channel.track({ userId: user.id, ...presenceRef.current });
          }
        });
      })
      .catch(() => recover());
    const onFocus = () => recover();
    window.addEventListener("focus", onFocus);
    return () => {
      closed = true;
      window.removeEventListener("focus", onFocus);
      if (timer !== undefined) window.clearTimeout(timer);
      pending.clear();
      changedContacts.clear();
      changedActivities.clear();
      channelRef.current = null;
      setPeers([]);
      void sb.removeChannel(channel);
    };
  }, [teamId, hasSession, user?.id, user?.onboarded, qc]);

  useEffect(() => {
    if (!channelRef.current || !user?.id) return;
    void channelRef.current.track({ userId: user.id, ...presence });
  }, [presence, user?.id]);

  const setContact = useCallback((contactId: string | null) => {
    if (presenceRef.current.contactId === contactId && !presenceRef.current.editingId) return;
    presenceRef.current = { contactId, editingId: null };
    setPresence(presenceRef.current);
  }, []);
  const setEditing = useCallback((editingId: string | null) => {
    presenceRef.current = { ...presenceRef.current, editingId };
    setPresence(presenceRef.current);
  }, []);
  const value = useMemo(() => ({ peers, setContact, setEditing }), [peers, setContact, setEditing]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTeamRealtime() {
  const value = useContext(Context);
  if (!value) throw new Error("TeamRealtimeProvider missing");
  return value;
}
