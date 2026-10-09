import { compareContactUpdated } from "../../lib/contact-sort.ts";
import { nextPickerIndex, pickerDirection } from "../../lib/picker-keyboard.ts";
import { Dialog as InboxDialog } from "@base-ui-components/react/dialog";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Building2,
  CalendarPlus,
  CalendarDays,
  ChevronDown,
  Clock3,
  GraduationCap,
  History,
  Inbox,
  Keyboard,
  LayoutGrid,
  List,
  ListFilter,
  LogOut,
  Moon,
  BookOpen,
  FileText,
  MessageSquare,
  Check,
  Plus,
  Search,
  Settings2,
  Star,
  Sun,
  Tag as TagIcon,
  Tags,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContactStatusIcon } from "../../components/contact-status.tsx";
import { Avatar } from "../../components/ui/avatar.tsx";
import { ProfileEditor } from "../../components/profile-editor.tsx";
import { ExportPage } from "../../components/export-page.tsx";
import { SemanticSearch } from "../../components/semantic-search.tsx";
import type { SearchResult } from "../../components/semantic-search.tsx";
import { CommandPalette, type PaletteItem } from "../../components/command-palette.tsx";
import { type ReferralPrefill } from "../../components/contact-ai-panel.tsx";
import { InboxItems, type InboxData, type AdminInboxItem } from "../../components/inbox-items.tsx";
import { FeedbackDialog, type FeedbackInboxItem } from "../../components/feedback.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { MultiSelect } from "../../components/ui/multi-select.tsx";
import { Select } from "../../components/ui/select.tsx";
import { profileAvatarUrl, request } from "../../lib/api.ts";
import { useAuth } from "../../lib/auth.tsx";
import { useOrg } from "../../lib/org.tsx";
import { useTeamRealtime } from "../../lib/team-realtime.tsx";
import { useTheme } from "../../lib/theme.ts";
import { ActivityFeed } from "./activity-feed.tsx";
import { TeamCalendar } from "./calendar.tsx";
import { ContactBoard } from "./board.tsx";
import { ContactDetail } from "./contact-detail.tsx";
import { ContactList, CreateContact } from "./contact-list.tsx";
import {
  assigneeOptions,
  colors,
  dateTimeLabel,
  defaultViewSettings,
  emptyData,
  readViewDrafts,
  readWorkspaceLocation,
  statusOptions,
  type Contact,
  type Data,
  type Filters,
  type MapFocus,
  type Page,
  type SortKey,
  type ViewSettings,
  workspaceSearch,
} from "./model.tsx";
import { OrganizationMap } from "./organization-map.tsx";
import { ContactCategorySelector, DeletedContactsPage, LibraryPage, NoTeam } from "./overview.tsx";
import { Settings } from "./settings.tsx";
import {
  BrowserNotificationPrompt,
  SidebarActivePill,
  SidebarNavSection,
  SidebarTeamName,
} from "./shell-parts.tsx";
import { applyOptimisticEdits, useWorkspaceMutations } from "./mutations.ts";
export function Home() {
  const initialLocation = useRef(
    readWorkspaceLocation(typeof window === "undefined" ? "" : window.location.search),
  ).current;
  const auth = useAuth();
  const { theme, setTheme } = useTheme();
  const state = useOrg();
  const org = state.org;
  const qc = useQueryClient();
  const { setContact } = useTeamRealtime();
  const [page, setPage] = useState<Page>(initialLocation.page);
  const [selectedId, setSelectedId] = useState<string | null>(initialLocation.contact);
  const [createdHighlightId, setCreatedHighlightId] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<{ id: string; hidden: boolean } | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [deletedNotice, setDeletedNotice] = useState<{ id: string; name: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createReferral, setCreateReferral] = useState<ReferralPrefill | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [shortcutChooser, setShortcutChooser] = useState<{
    contactId: string;
    kind: "assignee" | "status" | "tags";
    returnFocus: HTMLElement | null;
  } | null>(null);
  const [contactMenu, setContactMenu] = useState<{
    contactId: string;
    x: number;
    y: number;
    returnFocus: HTMLElement | null;
  } | null>(null);
  const [composerShortcut, setComposerShortcut] = useState<{
    contactId: string;
    kind: "phone" | "email";
    nonce: number;
  } | null>(null);
  const contactMenuRef = useRef<HTMLDivElement>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchNavigation, setSearchNavigation] = useState<{
    query: string;
    shared: SearchResult | null;
    nonce: number;
  }>({ query: initialLocation.query, shared: null, nonce: 0 });
  const [organizationTarget, setOrganizationTarget] = useState<{
    focus: MapFocus;
    nonce: number;
  }>({ focus: initialLocation.mapFocus, nonce: 0 });
  const [librarySearch, setLibrarySearch] = useState(initialLocation.librarySearch);
  const [feedFilters, setFeedFilters] = useState(initialLocation.feed);
  const [feedNonce, setFeedNonce] = useState(0);
  const [libraryNonce, setLibraryNonce] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof window !== "undefined" && window.isSecureContext && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const [now, setNow] = useState(() => Date.now());
  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(
    initialLocation.activity,
  );
  const [focusedPassage, setFocusedPassage] = useState<string | null>(initialLocation.passage);
  const [focusedQuery, setFocusedQuery] = useState<string | null>(initialLocation.query);
  const closeContactDetail = useCallback(() => {
    setComposerShortcut(null);
    setSelectedId(null);
    setFocusedActivityId(null);
    setFocusedPassage(null);
    setFocusedQuery(null);
  }, []);
  const canOpenCommand = !!auth.session && !!state.user?.onboarded && !!org;
  useEffect(() => {
    if (!canOpenCommand) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      if (!event.repeat && !commandOpen) setCommandOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canOpenCommand, commandOpen]);
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      if (
        commandOpen ||
        createOpen ||
        shortcutHelpOpen ||
        feedbackOpen ||
        shortcutChooser ||
        contactMenu ||
        inboxOpen ||
        document.querySelector("[data-activity-quote-action]") ||
        document.querySelector('[role="dialog"], [role="menu"]')
      )
        return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select, [contenteditable]")
      )
        return;
      event.preventDefault();
      closeContactDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedId,
    commandOpen,
    createOpen,
    shortcutHelpOpen,
    feedbackOpen,
    shortcutChooser,
    contactMenu,
    inboxOpen,
    closeContactDetail,
  ]);
  const [drafts, setDrafts] = useState<Record<string, ViewSettings>>(
    initialLocation.hasViewParams ? { home: initialLocation.view } : {},
  );
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["contact-data", org?.id, "core"],
    queryFn: () =>
      request<
        Pick<
          Data,
          | "companies"
          | "domains"
          | "companyDomains"
          | "personTags"
          | "contactPersonTags"
          | "contacts"
          | "contactCreators"
          | "contactAssignees"
          | "members"
        >
      >("/org/contact-data?part=core", org!.id),
    enabled: !!org && !!state.user?.onboarded,
    refetchInterval: 60_000,
  });
  const activityQuery = useQuery({
    queryKey: ["contact-data", org?.id, "activities"],
    queryFn: () =>
      request<Pick<Data, "activities" | "activityContacts" | "activityFiles" | "emailActivities">>(
        "/org/contact-data?part=activities",
        org!.id,
      ),
    enabled: !!org && !!state.user?.onboarded,
    refetchInterval: 60_000,
  });
  const personalQuery = useQuery({
    queryKey: ["contact-data", org?.id, "personal"],
    queryFn: () =>
      request<Pick<Data, "favoriteContactIds" | "reminders">>(
        "/org/contact-data?part=personal",
        org!.id,
      ),
    enabled: !!org && !!state.user?.onboarded,
    refetchInterval: 60_000,
  });
  const baseData: Data = {
    ...emptyData,
    ...query.data,
    ...activityQuery.data,
    ...personalQuery.data,
  };
  const { mutate, busy, error, setError, pendingEdits } = useWorkspaceMutations({
    teamId: org?.id,
    data: baseData,
    onChanged: () => setNow(Date.now()),
  });
  const data = applyOptimisticEdits(baseData, pendingEdits, state.user?.id ?? null);
  const deletedContactsQuery = useQuery({
    queryKey: ["deleted-contacts", org?.id],
    queryFn: () => request<Contact[]>("/org/contacts/deleted", org!.id),
    enabled: !!org && !!state.user?.onboarded,
    refetchInterval: 60_000,
  });
  const deletedContacts = deletedContactsQuery.data ?? [];
  const selectedDeletedContact = deletedContacts.find((contact) => contact.id === selectedId);
  useEffect(() => {
    if (!deletedNotice) return;
    const timer = window.setTimeout(() => setDeletedNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [deletedNotice]);
  useEffect(() => {
    if (!query.isSuccess) return;
    const valid = {
      assigneeId: new Set(["unassigned", ...data.members.map((member) => member.userId)]),
      companyId: new Set(data.companies.map((company) => company.id)),
      domainId: new Set(data.domains.map((domain) => domain.id)),
      tagId: new Set(data.personTags.map((tag) => tag.id)),
    };
    setDrafts((current) => {
      if (!current.home) return current;
      const filters = { ...current.home.filters };
      let changed = false;
      for (const key of ["assigneeId", "companyId", "domainId", "tagId"] as const) {
        const before = filters[key] ?? [];
        const after = before.filter((id) => valid[key].has(id));
        if (after.length !== before.length) {
          filters[key] = after;
          changed = true;
        }
      }
      return changed ? { ...current, home: { ...current.home, filters } } : current;
    });
  }, [query.isSuccess, data.members, data.companies, data.domains, data.personTags]);
  const productSettings = useQuery({
    queryKey: ["loi-settings", org?.id],
    queryFn: () => request<{ businessName: string }>("/org/loi-settings", org!.id),
    enabled: !!org && !!state.user?.onboarded,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    if (page === "class_settings" && state.user?.onboarded && state.classSpace?.role !== "admin")
      setPage("profile");
  }, [page, state.user?.onboarded, state.classSpace?.role]);
  useEffect(() => {
    setContact(
      selectedId && data.contacts.some((item) => item.id === selectedId) ? selectedId : null,
    );
  }, [selectedId, org?.id, data.contacts, setContact]);
  const inboxQuery = useQuery({
    queryKey: ["inbox", org?.id],
    queryFn: () => request<InboxData>("/org/inbox", org!.id),
    enabled: !!org && !!state.user?.onboarded,
    refetchInterval: 30_000,
  });
  const classInboxQuery = useQuery({
    queryKey: ["class-inbox", state.classSpace?.classId],
    queryFn: () => request<AdminInboxItem[]>("/class/inbox"),
    enabled: !!org && state.classSpace?.role === "admin" && !!state.user?.onboarded,
    refetchInterval: 30_000,
  });
  const feedbackInboxQuery = useQuery({
    queryKey: ["feedback-inbox", state.user?.id],
    queryFn: () => request<FeedbackInboxItem[]>("/feedback/inbox"),
    enabled: !!org && !!state.user?.onboarded,
    refetchInterval: 30_000,
  });
  const viewScope =
    org?.id && state.user?.id ? `contac:view-drafts:v1:${state.user.id}:${org.id}` : null;
  useEffect(() => {
    if (!viewScope) {
      setDraftScope(null);
      return;
    }
    const saved = readViewDrafts(viewScope);
    const linked = readWorkspaceLocation(window.location.search);
    const linkedView =
      linked.hasViewParams && (!linked.team || linked.team === org?.id) ? linked.view : null;
    setDrafts(linkedView ? { ...saved, home: linkedView } : saved);
    setDraftScope(viewScope);
  }, [viewScope, org?.id]);
  useEffect(() => {
    if (!viewScope || draftScope !== viewScope) return;
    try {
      localStorage.setItem(viewScope, JSON.stringify({ drafts }));
    } catch {
      // A blocked or full browser store does not prevent editing a view in memory.
    }
  }, [viewScope, draftScope, drafts]);
  const viewSettings = drafts.home ?? defaultViewSettings;
  const { layout, filters, sortKey } = viewSettings;
  const restoringUrl = useRef(false);
  const lastWorkspaceUrl = useRef<string | null>(null);
  const pendingTeamRestore = useRef<string | null>(null);
  const [urlSyncNonce, setUrlSyncNonce] = useState(0);
  useEffect(() => {
    const onPopState = () => {
      const location = readWorkspaceLocation(window.location.search);
      restoringUrl.current = true;
      setPage(location.page);
      setSelectedId(location.contact);
      setFocusedActivityId(location.activity);
      setFocusedPassage(location.passage);
      setFocusedQuery(location.query);
      setSearchNavigation((current) => ({
        query: location.query,
        shared: null,
        nonce: current.nonce + 1,
      }));
      setOrganizationTarget((current) => ({
        focus: location.mapFocus,
        nonce: current.nonce + 1,
      }));
      setLibrarySearch(location.librarySearch);
      setFeedFilters(location.feed);
      setFeedNonce((current) => current + 1);
      setLibraryNonce((current) => current + 1);
      setDrafts((current) => ({ ...current, home: location.view }));
      if (
        location.team &&
        location.team !== org?.id &&
        state.organizations.some((team) => team.id === location.team)
      ) {
        pendingTeamRestore.current = location.team;
        void state
          .select(location.team)
          .then(() => {
            if (pendingTeamRestore.current === location.team) pendingTeamRestore.current = null;
          })
          .catch((cause) => {
            if (pendingTeamRestore.current !== location.team) return;
            pendingTeamRestore.current = null;
            restoringUrl.current = false;
            lastWorkspaceUrl.current = null;
            setError(cause instanceof Error ? cause.message : String(cause));
            setUrlSyncNonce((current) => current + 1);
          });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [state]);
  useEffect(() => {
    if (!org || !viewScope || draftScope !== viewScope) return;
    if (pendingTeamRestore.current && pendingTeamRestore.current !== org.id) return;
    const next = workspaceSearch({
      team: org.id,
      page,
      contact: selectedId,
      activity: selectedId ? focusedActivityId : null,
      passage: selectedId ? focusedPassage : null,
      query: selectedId ? (focusedQuery ?? "") : page === "search" ? searchNavigation.query : "",
      mapFocus: organizationTarget.focus,
      view: viewSettings,
      hasViewParams: true,
      librarySearch,
      feed: feedFilters,
    });
    const current = window.location.search;
    if (restoringUrl.current || lastWorkspaceUrl.current === null) {
      restoringUrl.current = false;
      if (next !== current) window.history.replaceState(null, "", next);
    } else if (next !== current) window.history.pushState(null, "", next);
    lastWorkspaceUrl.current = next;
  }, [
    org?.id,
    viewScope,
    draftScope,
    page,
    selectedId,
    focusedActivityId,
    focusedPassage,
    focusedQuery,
    searchNavigation.query,
    organizationTarget.focus,
    viewSettings,
    librarySearch,
    feedFilters,
    urlSyncNonce,
  ]);
  const activeControls =
    [filters.status, filters.assigneeId, filters.companyId, filters.domainId, filters.tagId].filter(
      (value) => value?.length,
    ).length + (sortKey === "updated" ? 0 : 1);
  function editViewSettings(update: (current: ViewSettings) => ViewSettings) {
    setDrafts((current) => ({
      ...current,
      home: update(current.home ?? defaultViewSettings),
    }));
  }
  function setFilters(update: Filters | ((current: Filters) => Filters)) {
    editViewSettings((current) => ({
      ...current,
      filters: typeof update === "function" ? update(current.filters) : update,
    }));
  }
  function setSortKey(next: SortKey) {
    editViewSettings((current) => ({ ...current, sortKey: next }));
  }
  function setLayout(next: "board" | "list") {
    editViewSettings((current) => ({ ...current, layout: next }));
  }
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const dueReminders = data.reminders.filter(
    (reminder) => new Date(reminder.dueAt).getTime() <= now,
  );
  async function enableBrowserNotifications() {
    if (notificationPermission === "unsupported") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }
  useEffect(() => {
    if (notificationPermission !== "granted" || !state.user?.id) return;
    const key = `contac:notified-reminders:v1:${state.user.id}`;
    let notified: string[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (Array.isArray(stored))
        notified = stored.filter((id): id is string => typeof id === "string");
    } catch {
      // Browser storage can be blocked; reminders still appear in the inbox.
    }
    const seen = new Set(notified);
    let changed = false;
    for (const reminder of data.reminders) {
      if (new Date(reminder.dueAt).getTime() > now || seen.has(reminder.id)) continue;
      const contact = data.contacts.find((item) => item.id === reminder.contactId);
      try {
        const notification = new Notification(`Påminnelse: ${contact?.name ?? "Kontakt"}`, {
          body: reminder.message || "Åpne Contac for å se påminnelsen.",
          tag: `contac-reminder-${reminder.id}`,
        });
        notification.onclick = () => {
          window.focus();
          setSelectedId(reminder.contactId);
          setPage("contacts");
          notification.close();
        };
        seen.add(reminder.id);
        changed = true;
      } catch {
        // Leave it unread in the inbox when the browser refuses a notification.
      }
    }
    if (changed) {
      try {
        localStorage.setItem(key, JSON.stringify([...seen]));
      } catch {
        // The visible inbox is the fallback if browser storage is unavailable.
      }
    }
  }, [notificationPermission, state.user?.id, data.reminders, data.contacts, now]);
  const lastActivity = (contactId: string, includeMissed = false) =>
    data.activities.find(
      (a) =>
        (includeMissed || a.kind !== "missed_phone") &&
        data.activityContacts.some(
          (link) => link.activityId === a.id && link.contactId === contactId,
        ),
    );
  const allVisible = data.contacts.filter((c) => c.status !== "duplicate");
  const visible = (() => {
    let rows =
      page === "duplicates"
        ? data.contacts.filter((c) => c.status === "duplicate")
        : [...allVisible];
    if (page === "contacts" && filters.status?.length)
      rows = rows.filter((c) => filters.status?.includes(c.status));
    if (page === "contacts" && filters.assigneeId?.length)
      rows = rows.filter((c) => filters.assigneeId?.includes(c.assigneeId ?? "unassigned"));
    if (page === "contacts" && filters.companyId?.length)
      rows = rows.filter((c) => filters.companyId?.includes(c.companyId));
    if (page === "contacts" && filters.domainId?.length)
      rows = rows.filter((c) =>
        data.companyDomains.some(
          (x) => x.companyId === c.companyId && filters.domainId?.includes(x.domainId),
        ),
      );
    if (page === "contacts" && filters.tagId?.length)
      rows = rows.filter((c) =>
        data.contactPersonTags.some(
          (x) => x.contactId === c.id && filters.tagId?.includes(x.tagId),
        ),
      );
    const activeSort = sortKey;
    rows.sort((a, b) =>
      activeSort === "name"
        ? a.name.localeCompare(b.name, "nb")
        : activeSort === "created"
          ? b.createdAt.localeCompare(a.createdAt)
          : activeSort === "last_contacted"
            ? (lastActivity(b.id)?.occurredAt ?? "").localeCompare(
                lastActivity(a.id)?.occurredAt ?? "",
              )
            : compareContactUpdated(a, b),
    );
    return rows;
  })();
  const createdContactLoaded =
    !!createdHighlightId && data.contacts.some((contact) => contact.id === createdHighlightId);
  const createdContactVisible =
    !!createdHighlightId && visible.some((contact) => contact.id === createdHighlightId);
  useEffect(() => {
    if (!createdHighlightId || !createdContactLoaded || selectedId) return;
    if (!createdContactVisible) {
      const frame = requestAnimationFrame(() => {
        setCreatedNotice({ id: createdHighlightId, hidden: true });
        setCreatedHighlightId(null);
      });
      return () => cancelAnimationFrame(frame);
    }
    const id = createdHighlightId;
    const scrollTimer = window.setTimeout(() => {
      const item = document.querySelector<HTMLElement>(`[data-contact-item="${id}"]`);
      const target = item?.matches("tr") ? item.querySelector("td:first-child") : item;
      target?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
        inline: "center",
      });
    }, 240);
    const timer = window.setTimeout(() => {
      setCreatedHighlightId((current) => (current === id ? null : current));
    }, 5100);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(timer);
    };
  }, [createdHighlightId, createdContactLoaded, createdContactVisible, selectedId, layout]);
  useEffect(() => {
    if (!createdNotice) return;
    const timer = window.setTimeout(() => setCreatedNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [createdNotice]);
  const chosen = data.contacts.find((c) => c.id === selectedId) ?? null;
  function closeShortcutChooser() {
    const returnFocus = shortcutChooser?.returnFocus;
    setShortcutChooser(null);
    window.setTimeout(() => returnFocus?.isConnected && returnFocus.focus(), 0);
  }
  function openContactComposer(contact: Contact, kind: "phone" | "email") {
    if (contact.status === "duplicate") return;
    setContactMenu(null);
    setSelectedId(contact.id);
    setComposerShortcut((previous) => ({
      contactId: contact.id,
      kind,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  }
  function runContactShortcut(contact: Contact, key: string, returnFocus: HTMLElement | null) {
    if (contact.status === "duplicate" || contact.deletedAt) return;
    setContactMenu(null);
    if (key === "a" || key === "s" || key === "l") {
      setShortcutChooser({
        contactId: contact.id,
        kind: key === "a" ? "assignee" : key === "s" ? "status" : "tags",
        returnFocus,
      });
    } else if (key === "i" && state.user?.id) {
      void mutate(`/contacts/${contact.id}`, {
        assigneeId: contact.assigneeId === state.user.id ? null : state.user.id,
      });
    } else if (key === "f") {
      void mutate(`/contacts/${contact.id}/favorite`, {
        favorite: !data.favoriteContactIds.includes(contact.id),
      });
    } else if (key === "r" || key === "e") {
      openContactComposer(contact, key === "r" ? "phone" : "email");
    } else if (key === "d") {
      setDeletingContact(contact);
    }
  }
  useEffect(() => {
    if (!contactMenu) return;
    contactMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: globalThis.PointerEvent) => {
      if (!contactMenuRef.current?.contains(event.target as Node)) setContactMenu(null);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [contactMenu]);
  useEffect(() => {
    setContactMenu(null);
    setShortcutChooser(null);
  }, [page, org?.id]);
  function go(next: Page) {
    setComposerShortcut(null);
    setInboxOpen(false);
    setCreatedHighlightId(null);
    setCreatedNotice(null);
    setFiltersOpen(false);
    setSelectedId(null);
    setFocusedActivityId(null);
    setFocusedPassage(null);
    setFocusedQuery(null);
    if (next === "organizations")
      setOrganizationTarget((current) => ({
        focus: { kind: "all", id: null },
        nonce: current.nonce + 1,
      }));
    setPage(next);
  }
  function openFullSearch(query: string, shared: SearchResult | null = null) {
    go("search");
    setSearchNavigation((current) => ({ query, shared, nonce: current.nonce + 1 }));
  }
  function openPaletteSearchResult(result: SearchResult, query: string) {
    if (result.ownerOrgId !== org?.id) {
      openFullSearch(query, result);
      return;
    }
    openFullSearch(query);
    setSelectedId(result.contactId);
    setFocusedActivityId(
      result.activityId ??
        (result.kind === "note"
          ? "note"
          : result.kind === "additional_info"
            ? "additional_info"
            : null),
    );
    setFocusedPassage(result.passage);
    setFocusedQuery(query);
  }
  function openOrganization(id: string) {
    go("organizations");
    setOrganizationTarget((current) => ({
      focus: { kind: "company", id },
      nonce: current.nonce + 1,
    }));
  }
  async function selectTeam(id: string) {
    try {
      await state.select(id);
      setComposerShortcut(null);
      setInboxOpen(false);
      setCreatedHighlightId(null);
      setCreatedNotice(null);
      setFiltersOpen(false);
      setDraftScope(null);
      setDrafts({});
      setSelectedId(null);
      setOrganizationTarget((current) => ({
        focus: { kind: "all", id: null },
        nonce: current.nonce + 1,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke bytte team.");
    }
  }
  function showContactLayout(next: "board" | "list") {
    go("contacts");
    setDrafts((current) => ({
      ...current,
      home: { ...(current.home ?? defaultViewSettings), layout: next },
    }));
  }
  async function confirmDeleteContact() {
    if (!deletingContact) return;
    try {
      await mutate(`/contacts/${deletingContact.id}/delete`, {});
      if (selectedId === deletingContact.id) setSelectedId(null);
      setDeletedNotice({ id: deletingContact.id, name: deletingContact.name });
      setDeletingContact(null);
    } catch {
      // The page-level error banner explains the failure; keep the confirmation open.
    }
  }
  const contactNav: [Page, string, typeof LayoutGrid][] = [
    ["contacts", "Kontaktlogg", LayoutGrid],
    ["contacted", "Sist kontaktet", History],
    ["calendar", "Kalender", CalendarDays],
  ];
  const overviewNav: [Page, string, typeof LayoutGrid][] = [
    ["library", "Sitater", BookOpen],
    ["organizations", "Organisasjoner", Building2],
    ["export", "Eksport", FileText],
  ];
  const favorites = data.favoriteContactIds
    .map((id) => data.contacts.find((contact) => contact.id === id))
    .filter((contact): contact is Contact => !!contact && contact.status !== "duplicate");
  const activeSidebarItem =
    selectedId && favorites.some((contact) => contact.id === selectedId)
      ? `favorite:${selectedId}`
      : page === "team_settings" || page === "class_settings"
        ? "profile"
        : page === "duplicates" || page === "deleted"
          ? "contacts"
          : page;
  const shortcutNavigation = [
    ...contactNav.map(([id]) => id),
    ...overviewNav.map(([id]) => id),
    ...favorites.map((contact) => `favorite:${contact.id}`),
    "profile",
  ];
  const lastNavigationKey = useRef(0);
  useEffect(() => {
    if (!canOpenCommand) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target?.isContentEditable ||
        target?.closest('input, textarea, select, [contenteditable], [role="combobox"]') ||
        document.querySelector("[data-activity-quote-action]") ||
        document.querySelector('[role="dialog"], [role="menu"]') ||
        commandOpen ||
        createOpen ||
        shortcutHelpOpen ||
        feedbackOpen ||
        shortcutChooser ||
        contactMenu
      )
        return;
      const key = event.key.toLowerCase();
      const focusedItem = target?.closest<HTMLElement>("[data-contact-item]");
      const hoveredItem = document.querySelector<HTMLElement>("[data-contact-item]:hover");
      const contactItem = focusedItem ?? hoveredItem;
      const targetContact = selectedId
        ? chosen
        : data.contacts.find((contact) => contact.id === contactItem?.dataset.contactItem);
      if (
        (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) &&
        contactItem &&
        targetContact &&
        !selectedId
      ) {
        event.preventDefault();
        const rect = contactItem.getBoundingClientRect();
        setContactMenu({
          contactId: targetContact.id,
          x: rect.left + Math.min(rect.width, 32),
          y: rect.top + Math.min(rect.height, 32),
          returnFocus: focusedItem?.querySelector("button") ?? (focusedItem as HTMLElement),
        });
        return;
      }
      if (
        targetContact &&
        !event.repeat &&
        (selectedId
          ? ["r", "e", "a", "s", "f", "d"]
          : ["a", "i", "l", "s", "f", "r", "e", "d"]
        ).includes(key)
      ) {
        event.preventDefault();
        const detailFocus = selectedId
          ? document.querySelector<HTMLElement>(
              key === "a"
                ? '[aria-label="Ansvarlig"]'
                : key === "s"
                  ? '[aria-label="Status"]'
                  : "[data-contact-detail-actions] button",
            )
          : null;
        runContactShortcut(
          targetContact,
          key,
          detailFocus ?? focusedItem?.querySelector("button") ?? focusedItem ?? target,
        );
        return;
      }
      if (key === "?") {
        if (event.repeat) return;
        event.preventDefault();
        setShortcutHelpOpen(true);
      } else if (key === "c") {
        if (event.repeat) return;
        event.preventDefault();
        setCreateOpen(true);
      } else if (key === "i") {
        if (event.repeat) return;
        event.preventDefault();
        setInboxOpen(true);
      } else if (["w", "k", "s", "j"].includes(key)) {
        if (key === "s" && selectedId) return;
        if (event.timeStamp - lastNavigationKey.current < 95) return;
        lastNavigationKey.current = event.timeStamp;
        event.preventDefault();
        const current = shortcutNavigation.indexOf(activeSidebarItem);
        const next =
          (current + (key === "w" || key === "k" ? -1 : 1) + shortcutNavigation.length) %
          shortcutNavigation.length;
        const destination = shortcutNavigation[next];
        if (destination?.startsWith("favorite:")) {
          go("contacts");
          setSelectedId(destination.slice("favorite:".length));
        } else if (destination) go(destination as Page);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  if (auth.loading || state.loading)
    return (
      <main className="grid min-h-screen place-items-center text-muted-foreground">
        Laster arbeidsområde …
      </main>
    );
  if (!auth.session)
    return (
      <main className="mx-auto grid min-h-screen max-w-lg place-content-center gap-5 px-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Users />
        </div>
        <h1 className="text-4xl font-semibold">Kontaktarbeid for hele klassen</h1>
        <p className="text-muted-foreground">Samle kontakter, samtaler og funn på ett sted.</p>
        <Link to="/login">
          <Button>Logg inn</Button>
        </Link>
      </main>
    );
  if (state.error)
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert">{state.error}</p>
        <Button onClick={() => void state.refresh()}>Prøv igjen</Button>
      </main>
    );
  if (state.user && !state.user.onboarded)
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-5 py-10">
        <ProfileEditor onboarding />
        <Button variant="ghost" onClick={() => void auth.signOut()}>
          Logg ut
        </Button>
      </main>
    );
  if (!org) return <NoTeam />;
  const inboxCount =
    dueReminders.length +
    (inboxQuery.data?.overlaps?.length ?? 0) +
    (inboxQuery.data?.suggestions.length ?? 0) +
    (inboxQuery.data?.requests.length ?? 0) +
    (feedbackInboxQuery.data?.length ?? 0) +
    (classInboxQuery.data?.length ?? 0);
  const paletteItems: PaletteItem[] = [
    {
      id: "action:shortcuts",
      group: "actions",
      title: "Tastatursnarveier",
      detail: "Vis tilgjengelige snarveier",
      searchText: "hjelp keyboard shortcuts",
      icon: Keyboard,
      run: () => setShortcutHelpOpen(true),
    },
    {
      id: "action:new-contact",
      group: "actions",
      title: "Ny kontakt",
      detail: "Opprett en kontakt i dette teamet",
      searchText: "legg til opprett person",
      icon: Plus,
      run: () => {
        setCreateOpen(true);
      },
    },
    {
      id: "action:inbox",
      group: "actions",
      title: "Åpne innboks",
      detail: "Påminnelser, e-postforslag og forespørsler",
      searchText: "varsler meldinger",
      icon: Inbox,
      run: () => setInboxOpen(true),
    },
    {
      id: "action:export",
      group: "actions",
      title: "Åpne Eksport",
      detail: "Velg kontakter, kolonner og format",
      searchText: "eksport typst latex csv kopier",
      icon: FileText,
      run: () => go("export"),
    },
    {
      id: "action:board",
      group: "actions",
      title: "Vis kontakttavle",
      detail: "Åpne Kontaktlogg i tavlevisning",
      searchText: "kanban board kolonner",
      icon: LayoutGrid,
      run: () => showContactLayout("board"),
    },
    {
      id: "action:list",
      group: "actions",
      title: "Vis kontaktliste",
      detail: "Åpne Kontaktlogg i listevisning",
      searchText: "regneark tabell spreadsheet",
      icon: List,
      run: () => showContactLayout("list"),
    },
    {
      id: "action:logout",
      group: "actions",
      title: "Logg ut",
      searchText: "sign out avslutt økt",
      icon: LogOut,
      run: () => void auth.signOut(),
    },
    ...contactNav.map(
      ([id, title, icon]): PaletteItem => ({
        id: `page:${id}`,
        group: "pages",
        title,
        icon,
        searchText:
          id === "contacts"
            ? "kontakter hjem tavle liste board kanban"
            : id === "calendar"
              ? "kalender uke møte frist påminnelse"
              : "samtaler møter telefon e-post aktivitet feed",
        run: () => go(id),
      }),
    ),
    ...overviewNav.map(
      ([id, title, icon]): PaletteItem => ({
        id: `page:${id}`,
        group: "pages",
        title,
        icon,
        searchText:
          id === "library"
            ? "sitater bokmerker"
            : id === "organizations"
              ? "selskaper bedrifter domener hierarki"
              : "duplikater",
        run: () => go(id),
      }),
    ),
    {
      id: "page:search",
      group: "pages",
      title: "Søk i kontaktloggen",
      detail: "Alle samtaler, notater og kontakter",
      searchText: "semantisk søk finn innhold",
      icon: Search,
      run: () => openFullSearch(""),
    },
    {
      id: "page:profile",
      group: "pages",
      title: "Min profil",
      detail: state.user?.name ?? undefined,
      searchText: "min profil konto innstillinger",
      icon: UserRound,
      run: () => go("profile"),
    },
    {
      id: "page:team_settings",
      group: "pages" as const,
      title: org.name,
      searchText: "team AI LOI",
      icon: Settings2,
      run: () => go("team_settings"),
    },
    ...(state.classSpace?.role === "admin"
      ? [
          {
            id: "page:class_settings",
            group: "pages" as const,
            title: "Klasserom",
            searchText: "klasse admin team invitasjon",
            icon: GraduationCap,
            run: () => go("class_settings"),
          },
        ]
      : []),
    ...data.contacts
      .filter((contact) => contact.status !== "duplicate")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((contact, index): PaletteItem => {
        const company = data.companies.find((candidate) => candidate.id === contact.companyId);
        return {
          id: `contact:${contact.id}`,
          group: "contacts",
          title: contact.name,
          detail: company?.name,
          phone: contact.phone,
          searchText: [
            contact.email,
            contact.phone ? "telefon tlf" : null,
            contact.description,
            contact.stikkord,
          ]
            .filter(Boolean)
            .join(" "),
          icon: UserRound,
          recent: index < 6,
          run: () => {
            setSelectedId(contact.id);
            setFocusedActivityId(null);
            setFocusedPassage(null);
          },
        };
      }),
    ...data.companies.map(
      (company): PaletteItem => ({
        id: `organization:${company.id}`,
        group: "organizations",
        title: company.name,
        detail: `${data.contacts.filter((contact) => contact.companyId === company.id && contact.status !== "duplicate").length} kontakter`,
        searchText: data.companyDomains
          .filter((link) => link.companyId === company.id)
          .map((link) => data.domains.find((domain) => domain.id === link.domainId)?.name)
          .filter(Boolean)
          .join(" "),
        icon: Building2,
        run: () => openOrganization(company.id),
      }),
    ),
    ...state.organizations.map(
      (team): PaletteItem => ({
        id: `team:${team.id}`,
        group: "teams",
        title: team.name,
        detail: team.id === org.id ? "Aktivt team" : "Bytt team",
        searchText: "arbeidsområde workspace bytt team",
        icon: Users,
        run: () => selectTeam(team.id),
      }),
    ),
  ];
  return (
    <div className="min-h-screen lg:flex">
      <aside className="glass workspace-sidebar flex w-full shrink-0 flex-col p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:overflow-hidden">
        <div className="mb-4 flex items-center justify-between gap-2 px-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Users size={18} />
            </div>
            <SidebarTeamName name={productSettings.data?.businessName || "Contac"} />
          </div>
          <button
            type="button"
            aria-label="Søk (⌘K eller Ctrl+K)"
            aria-expanded={commandOpen}
            title="Søk (⌘K eller Ctrl+K)"
            className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${page === "search" && !selectedId ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
            onClick={() => setCommandOpen(true)}
          >
            <Search size={18} />
          </button>
        </div>
        <div className="space-y-2 px-1">
          <Button
            className="w-full"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            <Plus /> Ny kontakt
          </Button>
          <Button
            variant={inboxCount > 0 ? "outline" : "ghost"}
            size="sm"
            className="w-full"
            aria-expanded={inboxOpen}
            aria-controls="sidebar-inbox"
            onClick={() => setInboxOpen((open) => !open)}
          >
            <Inbox size={16} />
            Innboks
            {inboxCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                {inboxCount}
              </span>
            )}
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNavSection
            title="Navigasjon"
            items={[...contactNav, ...overviewNav]}
            activeItem={activeSidebarItem}
            onSelect={go}
          />
          {favorites.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <p className="flex items-center gap-1.5 px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Star size={13} /> Favoritter
              </p>
              <div className="space-y-1">
                {favorites.map((contact) => {
                  const active = activeSidebarItem === `favorite:${contact.id}`;
                  const company = data.companies.find((item) => item.id === contact.companyId);
                  const detail = contact.description?.trim() || "";
                  return (
                    <div key={contact.id} className="group relative flex items-center">
                      <button
                        type="button"
                        className={`relative min-w-0 flex-1 rounded-xl px-3 py-2 text-left text-sm transition-colors ${active ? "font-medium text-foreground" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}
                        title={[contact.name, company?.name, detail].filter(Boolean).join(" · ")}
                        onClick={() => setSelectedId(contact.id)}
                      >
                        {active && <SidebarActivePill />}
                        <span className="relative z-10 flex min-w-0 items-start gap-2">
                          <span className="mt-0.5 shrink-0">
                            <ContactStatusIcon status={contact.status} size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">
                              {contact.name}
                            </span>
                            <span className="block truncate text-xs font-normal text-muted-foreground">
                              {company?.name}
                            </span>
                            {detail && (
                              <span className="mt-0.5 line-clamp-2 text-xs font-normal leading-snug text-muted-foreground">
                                {detail}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="relative z-10 hidden p-1 text-muted-foreground hover:text-primary group-hover:block group-focus-within:block"
                        aria-label={`Fjern ${contact.name} fra favoritter`}
                        onClick={() =>
                          void mutate(`/contacts/${contact.id}/favorite`, { favorite: false })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 shrink-0 space-y-1 border-t border-border pt-3">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-muted-foreground hover:bg-card/70 hover:text-foreground"
            onClick={() => setFeedbackOpen(true)}
          >
            <MessageSquare size={16} /> Send tilbakemelding
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-muted-foreground hover:bg-card/70 hover:text-foreground"
            onClick={() => setShortcutHelpOpen(true)}
          >
            <Keyboard size={16} /> Tastatursnarveier <kbd className="ml-auto text-xs">?</kbd>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors ${["profile", "team_settings", "class_settings"].includes(page) ? "sidebar-settings-active bg-card font-medium text-foreground shadow-sm" : "hover:bg-card/70"}`}
              onClick={() => go("profile")}
            >
              <Avatar
                name={state.user?.name ?? "Bruker"}
                src={profileAvatarUrl(state.user?.avatarPath)}
                className="size-8"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{state.user?.name ?? "Bruker"}</span>
                <span className="block text-xs text-muted-foreground">Innstillinger</span>
              </span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              aria-label="Mørk modus"
              title={theme === "dark" ? "Slå av mørk modus" : "Slå på mørk modus"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${theme === "dark" ? "bg-primary" : "bg-slate/30"}`}
            >
              <span
                className={`ml-0.5 grid size-5 place-items-center rounded-full bg-card text-foreground shadow-sm transition-transform ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`}
              >
                {theme === "dark" ? <Moon size={12} /> : <Sun size={12} />}
              </span>
            </button>
          </div>
        </div>
      </aside>
      <main
        onContextMenu={(event) => {
          if (selectedId || commandOpen || shortcutChooser) return;
          const item = (event.target as HTMLElement).closest<HTMLElement>("[data-contact-item]");
          const contact = data.contacts.find((row) => row.id === item?.dataset.contactItem);
          if (!item || !contact) return;
          event.preventDefault();
          setContactMenu({
            contactId: contact.id,
            x: event.clientX,
            y: event.clientY,
            returnFocus: item.querySelector("button") ?? item,
          });
        }}
        className={
          page === "organizations" && !selectedId
            ? "flex min-w-0 flex-1 flex-col p-4 md:p-6 lg:h-screen lg:overflow-hidden"
            : page === "contacts" && layout === "board" && !selectedId
              ? "flex min-w-0 flex-1 flex-col p-4 md:p-6 lg:h-screen lg:overflow-hidden"
              : "min-w-0 flex-1 p-4 md:p-6"
        }
      >
        {error && (
          <div role="alert" className="mb-4 rounded-xl bg-risk-soft px-4 py-3 text-sm text-risk">
            {error}
            <button aria-label="Lukk" className="float-right" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {(query.isError || activityQuery.isError || personalQuery.isError) && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-risk-soft px-4 py-3 text-sm text-risk"
          >
            <span className="flex-1">Kunne ikke laste kontaktdata. Prøv igjen.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void qc.invalidateQueries({ queryKey: ["contact-data", org.id] })}
            >
              Last inn på nytt
            </Button>
          </div>
        )}
        {createdNotice && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-ok-soft px-4 py-3 text-sm"
          >
            <span className="flex-1">
              {createdNotice.hidden
                ? "Kontakt opprettet, men vises ikke i denne visningen."
                : "Kontakt opprettet."}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedId(createdNotice.id);
                setCreatedNotice(null);
              }}
            >
              Åpne kontakt
            </Button>
            <button type="button" aria-label="Lukk melding" onClick={() => setCreatedNotice(null)}>
              <X size={16} />
            </button>
          </div>
        )}
        {deletedNotice && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-ok-soft px-4 py-3 text-sm"
          >
            <span className="flex-1">{deletedNotice.name} er slettet.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void mutate(`/contacts/${deletedNotice.id}/restore`, {}).then(() =>
                  setDeletedNotice(null),
                )
              }
            >
              Angre
            </Button>
            <button type="button" aria-label="Lukk melding" onClick={() => setDeletedNotice(null)}>
              <X size={16} />
            </button>
          </div>
        )}
        {!selectedId && ["contacts", "duplicates", "deleted"].includes(page) && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {page === "contacts" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-[38px]"
                  aria-expanded={filtersOpen}
                  aria-controls="contact-filters-and-sort"
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <ListFilter size={16} /> Filtre og sortering
                  {activeControls > 0 && (
                    <span className="rounded-full bg-primary-soft px-1.5 text-xs text-primary">
                      {activeControls}
                    </span>
                  )}
                  <ChevronDown size={15} className={filtersOpen ? "rotate-180" : ""} />
                </Button>
                <div
                  role="group"
                  aria-label="Kontaktvisning"
                  className="inline-flex items-center rounded-xl border border-border bg-muted p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={layout === "board"}
                    onClick={() => setLayout("board")}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${layout === "board" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <LayoutGrid size={16} /> Kanban
                  </button>
                  <button
                    type="button"
                    aria-pressed={layout === "list"}
                    onClick={() => setLayout("list")}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${layout === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <List size={16} /> Liste
                  </button>
                </div>
              </div>
            )}
            <ContactCategorySelector
              page={page as "contacts" | "duplicates" | "deleted"}
              hasDuplicates={data.contacts.some((contact) => contact.status === "duplicate")}
              hasDeleted={deletedContacts.length > 0}
              onChange={go}
            />
          </div>
        )}
        {selectedId ? (
          selectedDeletedContact ? (
            <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card">
              <h1 className="text-2xl font-semibold">{selectedDeletedContact.name} er slettet</h1>
              <p className="text-sm text-muted-foreground">
                Kontakten og historikken er bevart. Gjenopprett for å fortsette arbeidet.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeContactDetail}>
                  <ArrowLeft size={16} /> Tilbake
                </Button>
                <Button
                  onClick={() => void mutate(`/contacts/${selectedDeletedContact.id}/restore`, {})}
                >
                  Gjenopprett kontakt
                </Button>
              </div>
            </div>
          ) : (
            <ContactDetail
              key={chosen?.id}
              contact={chosen}
              missing={query.isSuccess && !chosen}
              data={data}
              favorite={chosen ? data.favoriteContactIds.includes(chosen.id) : false}
              mutate={mutate}
              onBack={closeContactDetail}
              onOpen={(id) => {
                setSelectedId(id);
                setFocusedActivityId(null);
              }}
              onDelete={setDeletingContact}
              onAcceptReferral={(referral) => {
                setCreateReferral(referral);
                setCreateOpen(true);
              }}
              composerShortcut={
                composerShortcut?.contactId === chosen?.id ? composerShortcut : null
              }
              busy={busy}
              focusedActivityId={focusedActivityId}
              focusedPassage={focusedPassage}
              focusedQuery={focusedQuery}
              notificationPermission={notificationPermission}
              onEnableNotifications={() => void enableBrowserNotifications()}
            />
          )
        ) : page === "deleted" ? (
          <DeletedContactsPage
            contacts={deletedContacts}
            companies={data.companies}
            loading={deletedContactsQuery.isPending}
            busy={busy}
            onOpen={setSelectedId}
            onRestore={(id) => void mutate(`/contacts/${id}/restore`, {})}
          />
        ) : page === "export" ? (
          <ExportPage key={org.id} orgId={org.id} onOpenContact={setSelectedId} />
        ) : page === "library" ? (
          <LibraryPage
            key={libraryNonce}
            initialSearch={librarySearch}
            onSearchChange={setLibrarySearch}
            onOpen={(contactId, activityId) => {
              setFocusedActivityId(activityId ?? "note");
              setSelectedId(contactId);
            }}
          />
        ) : page === "search" ? (
          <SemanticSearch
            key={searchNavigation.nonce}
            initialQuery={searchNavigation.query}
            initialShared={searchNavigation.shared}
            onQueryChange={(query) => setSearchNavigation((current) => ({ ...current, query }))}
            onOpen={(contactId, activityId, passage, query) => {
              setSelectedId(contactId);
              setFocusedActivityId(activityId);
              setFocusedPassage(passage);
              setFocusedQuery(query);
            }}
          />
        ) : page === "contacted" ? (
          <ActivityFeed
            key={feedNonce}
            data={data}
            currentUserId={state.user?.id ?? ""}
            initialFilters={feedFilters}
            onFiltersChange={setFeedFilters}
            onOpenActivity={(contactId, activityId) => {
              setFocusedActivityId(activityId);
              setSelectedId(contactId);
            }}
          />
        ) : page === "calendar" ? (
          <TeamCalendar
            contacts={data.contacts}
            reminders={data.reminders}
            onOpenContact={setSelectedId}
          />
        ) : page === "profile" || page === "team_settings" || page === "class_settings" ? (
          <Settings
            section={page}
            state={state}
            mutate={mutate}
            busy={busy}
            onSectionChange={go}
            onSelectTeam={selectTeam}
            onSignOut={() => void auth.signOut()}
          />
        ) : page === "organizations" && !query.data ? (
          <div
            className="flex min-h-[560px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-card"
            role="status"
          >
            {query.isError ? (
              <>
                <p>Kunne ikke laste organisasjonene.</p>
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Prøv igjen
                </Button>
              </>
            ) : (
              <p>Laster organisasjonene …</p>
            )}
          </div>
        ) : page === "organizations" ? (
          <OrganizationMap
            key={organizationTarget.nonce}
            workspaceId={org.id}
            initialFocus={organizationTarget.focus}
            onFocusChange={(focus) => setOrganizationTarget((current) => ({ ...current, focus }))}
            loaded={query.isSuccess}
            data={data}
            mutate={mutate}
            onOpenContact={setSelectedId}
            busy={busy}
          />
        ) : (
          <>
            <h1 className="sr-only">
              {page === "duplicates" ? "Duplikate kontakter" : "Kontaktlogg"}
            </h1>
            {page === "contacts" && (
              <div
                id="contact-filters-and-sort"
                className={`mt-3 flex-wrap items-end gap-x-3 gap-y-3 rounded-xl border border-border bg-card p-3 ${filtersOpen ? "flex" : "hidden"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <ListFilter size={15} /> Filtre
                  </span>
                  <MultiSelect
                    label="Status"
                    icon={<ContactStatusIcon status="ikke_kontaktet" />}
                    value={filters.status ?? []}
                    onChange={(status) => setFilters((current) => ({ ...current, status }))}
                    options={statusOptions}
                    className="max-w-56"
                  />
                  <MultiSelect
                    label="Ansvarlig"
                    icon={<UserRound size={16} />}
                    value={filters.assigneeId ?? []}
                    onChange={(assigneeId) => setFilters((current) => ({ ...current, assigneeId }))}
                    options={[
                      {
                        value: "unassigned",
                        label: "Uten ansvarlig",
                        icon: <UserRound size={16} />,
                      },
                      ...data.members.map((m) => ({
                        value: m.userId,
                        label: m.name || "Medlem",
                        icon: (
                          <Avatar
                            name={m.name || "Medlem"}
                            src={profileAvatarUrl(m.avatarPath)}
                            className="size-5"
                          />
                        ),
                      })),
                    ]}
                    className="max-w-56"
                  />
                  <MultiSelect
                    label="Organisasjon"
                    icon={<Building2 size={16} />}
                    value={filters.companyId ?? []}
                    onChange={(companyId) => setFilters((current) => ({ ...current, companyId }))}
                    options={data.companies.map((c) => ({
                      value: c.id,
                      label: c.name,
                      icon: <Building2 size={16} />,
                    }))}
                    className="max-w-64"
                  />
                  <MultiSelect
                    label="Domene"
                    icon={<Tags size={16} />}
                    value={filters.domainId ?? []}
                    onChange={(domainId) => setFilters((current) => ({ ...current, domainId }))}
                    options={data.domains.map((d) => ({
                      value: d.id,
                      label: d.name,
                      icon: <TagIcon size={16} style={{ color: colors[d.color] }} />,
                    }))}
                    className="max-w-56"
                  />
                  <MultiSelect
                    label="Persontagg"
                    icon={<TagIcon size={16} />}
                    value={filters.tagId ?? []}
                    onChange={(tagId) => setFilters((current) => ({ ...current, tagId }))}
                    options={data.personTags.map((tag) => ({
                      value: tag.id,
                      label: tag.name,
                      icon: <TagIcon size={16} />,
                    }))}
                    className="max-w-56"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 border-l border-border pl-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <ArrowDownWideNarrow size={15} /> Sortering
                  </span>
                  <Select
                    value={sortKey}
                    onValueChange={(value) => setSortKey(value as SortKey)}
                    items={[
                      { value: "updated", label: "Sist endret", icon: <Clock3 size={16} /> },
                      { value: "name", label: "Navn", icon: <ArrowDownAZ size={16} /> },
                      {
                        value: "last_contacted",
                        label: "Siste kontaktet",
                        icon: <CalendarDays size={16} />,
                      },
                      { value: "created", label: "Opprettet", icon: <CalendarPlus size={16} /> },
                    ]}
                    aria-label="Sorter kontakter etter"
                    className="w-48"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    !Object.values(filters).some((value) =>
                      Array.isArray(value) ? value.length > 0 : !!value,
                    )
                  }
                  onClick={() => setFilters({})}
                >
                  Fjern alle filtre
                </Button>
              </div>
            )}
            {page === "contacts" && layout === "board" ? (
              <ContactBoard
                rows={visible}
                visibleStatuses={filters.status}
                data={data}
                onOpen={(id) => {
                  setComposerShortcut(null);
                  setCreatedHighlightId(null);
                  setSelectedId(id);
                }}
                mutate={mutate}
                highlightId={createdHighlightId}
              />
            ) : (
              <ContactList
                rows={visible}
                data={data}
                mutate={mutate}
                onOpen={(id) => {
                  setComposerShortcut(null);
                  setCreatedHighlightId(null);
                  setSelectedId(id);
                }}
                lastActivity={lastActivity}
                highlightId={createdHighlightId}
              />
            )}
          </>
        )}
      </main>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        orgId={org.id}
        items={paletteItems}
        onFullSearch={(query) => openFullSearch(query)}
        onSearchResult={openPaletteSearchResult}
      />
      <Dialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogTitle>Tastatursnarveier</DialogTitle>
          <DialogDescription>Snarveier virker når du ikke skriver i et felt.</DialogDescription>
          <div className="mt-4 space-y-3 text-sm">
            <section className="rounded-xl border border-primary/25 bg-primary-soft/40 p-3">
              <h3 className="mb-2 font-semibold">Arbeidsområde · tilgjengelig nå</h3>
              <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                <span>Forrige / neste side</span>
                <kbd>W/K · S/J</kbd>
                <span>Ny kontakt</span>
                <kbd>C</kbd>
                <span>Innboks uten kontaktmål</span>
                <kbd>I</kbd>
                <span>Vis denne hjelpen</span>
                <kbd>?</kbd>
                <span>Åpne kommandomeny</span>
                <kbd>⌘K / Ctrl+K</kbd>
                <span>Lukk meny eller dialog</span>
                <kbd>Esc</kbd>
              </div>
            </section>
            <section
              className={`rounded-xl border p-3 ${!selectedId && page === "contacts" ? "border-primary/25 bg-primary-soft/40" : "border-border"}`}
            >
              <h3 className="mb-2 font-semibold">
                Kontaktliste og kanban{" "}
                {!selectedId && page === "contacts" && (
                  <span className="text-xs text-primary">· her</span>
                )}
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Pek på eller fokuser en kontakt først.
              </p>
              <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                <span>Ansvarlig / tildel meg / tagger / status</span>
                <kbd>A / I / L / S</kbd>
                <span>Favoritt / ring / e-post / slett</span>
                <kbd>F / R / E / D</kbd>
                <span>Kontekstmeny</span>
                <kbd>Høyreklikk / Shift+F10</kbd>
                <span>Åpne fokusert kontakt</span>
                <kbd>Enter</kbd>
              </div>
            </section>
            <section
              className={`rounded-xl border p-3 ${chosen && chosen.status !== "duplicate" ? "border-primary/25 bg-primary-soft/40" : "border-border"}`}
            >
              <h3 className="mb-2 font-semibold">
                Kontaktdetaljer{" "}
                {chosen && chosen.status !== "duplicate" && (
                  <span className="text-xs text-primary">· her</span>
                )}
              </h3>
              <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                <span>Ring / skriv e-post</span>
                <kbd>R / E</kbd>
                <span>Ansvarlig / status</span>
                <kbd>A / S</kbd>
                <span>Favoritt / slett</span>
                <kbd>F / D</kbd>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!shortcutChooser} onOpenChange={(open) => !open && closeShortcutChooser()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>
            {shortcutChooser?.kind === "assignee"
              ? "Velg ansvarlig"
              : shortcutChooser?.kind === "status"
                ? "Velg status"
                : "Velg persontagger"}
          </DialogTitle>
          <DialogDescription>
            {data.contacts.find((contact) => contact.id === shortcutChooser?.contactId)?.name}
          </DialogDescription>
          <div
            className="mt-4 space-y-1"
            onKeyDown={(event) => {
              const direction = pickerDirection(event.nativeEvent);
              if (direction === null) return;
              const options = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
              ];
              const next = nextPickerIndex(
                options.indexOf(document.activeElement as HTMLButtonElement),
                direction,
                options.length,
              );
              if (next < 0) return;
              event.preventDefault();
              event.stopPropagation();
              options[next]?.focus();
            }}
          >
            {shortcutChooser?.kind === "assignee" &&
              assigneeOptions(data.members).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  autoFocus={option.value === ""}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    void mutate(`/contacts/${shortcutChooser.contactId}`, {
                      assigneeId: option.value || null,
                    });
                    closeShortcutChooser();
                  }}
                >
                  {option.icon} {option.label}
                </button>
              ))}
            {shortcutChooser?.kind === "status" &&
              statusOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  autoFocus={index === 0}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    void mutate(`/contacts/${shortcutChooser.contactId}`, { status: option.value });
                    closeShortcutChooser();
                  }}
                >
                  {option.icon} {option.label}
                </button>
              ))}
            {shortcutChooser?.kind === "tags" &&
              data.personTags.map((tag, index) => {
                const selected = data.contactPersonTags.some(
                  (link) => link.contactId === shortcutChooser.contactId && link.tagId === tag.id,
                );
                return (
                  <button
                    key={tag.id}
                    type="button"
                    autoFocus={index === 0}
                    aria-pressed={selected}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      const tagIds = data.contactPersonTags
                        .filter(
                          (link) =>
                            link.contactId === shortcutChooser.contactId && link.tagId !== tag.id,
                        )
                        .map((link) => link.tagId);
                      void mutate(`/contacts/${shortcutChooser.contactId}/tags`, {
                        tagIds: selected ? tagIds : [...tagIds, tag.id],
                      });
                    }}
                  >
                    {tag.name} {selected && <Check size={16} />}
                  </button>
                );
              })}
            {shortcutChooser?.kind === "tags" && !data.personTags.length && (
              <p className="text-sm text-muted-foreground">Ingen persontagger ennå.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {contactMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={contactMenuRef}
            role="menu"
            aria-label={`Handlinger for ${data.contacts.find((contact) => contact.id === contactMenu.contactId)?.name ?? "kontakt"}`}
            className="glass-strong fixed z-[60] max-h-[min(80vh,32rem)] w-60 overflow-y-auto rounded-xl p-1.5 shadow-xl"
            style={{
              left: Math.max(8, Math.min(contactMenu.x, window.innerWidth - 252)),
              top: Math.max(8, Math.min(contactMenu.y, window.innerHeight - 420)),
            }}
            onKeyDown={(event) => {
              const items = Array.from(
                contactMenuRef.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitem"]:not(:disabled)',
                ) ?? [],
              );
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === "Escape") {
                event.preventDefault();
                setContactMenu(null);
                contactMenu.returnFocus?.focus();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                items[
                  (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
                ]?.focus();
              }
            }}
          >
            {(
              [
                ["open", "Åpne kontakt", ""],
                ["a", "Endre ansvarlig", "A"],
                ["i", "Tildel meg / fjern", "I"],
                ["l", "Endre persontagger", "L"],
                ["s", "Endre status", "S"],
                ["f", "Favoritt av/på", "F"],
                ["r", "Start telefonsamtale", "R"],
                ["e", "Skriv e-post", "E"],
                ["d", "Slett kontakt", "D"],
              ] as const
            ).map(([key, label, hint]) => {
              const contact = data.contacts.find((row) => row.id === contactMenu.contactId);
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  disabled={
                    !contact ||
                    (contact.status === "duplicate" && key !== "open") ||
                    (key === "i" && !state.user?.id)
                  }
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-40"
                  onClick={() => {
                    if (!contact) return;
                    if (key === "open") {
                      setComposerShortcut(null);
                      setSelectedId(contact.id);
                      setContactMenu(null);
                    } else runContactShortcut(contact, key, contactMenu.returnFocus);
                  }}
                >
                  <span>{label}</span>
                  <kbd className="text-xs text-muted-foreground">{hint}</kbd>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
      <Dialog open={!!deletingContact} onOpenChange={(open) => !open && setDeletingContact(null)}>
        <DialogContent>
          <DialogTitle>Slett kontakt?</DialogTitle>
          <DialogDescription>
            {deletingContact?.name} ·{" "}
            {data.companies.find((company) => company.id === deletingContact?.companyId)?.name ??
              "Organisasjon ukjent"}
            . Kontakten og samtalene blir bevart og kan gjenopprettes fra Slettede kontakter.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setDeletingContact(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDeleteContact()}
            >
              Slett kontakt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateReferral(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogTitle>Ny kontakt</DialogTitle>
          <CreateContact
            key={createReferral?.id ?? "new"}
            data={data}
            referral={createReferral}
            mutate={mutate}
            onCreated={(id, openDetail) => {
              if (createReferral)
                void qc.invalidateQueries({
                  queryKey: ["contact-ai", org.id, createReferral.sourceContactId],
                });
              setCreateOpen(false);
              setCreateReferral(null);
              setCreatedHighlightId(null);
              setCreatedNotice(null);
              if (openDetail) setSelectedId(id);
              else if (!selectedId && ["contacts", "duplicates"].includes(page))
                setCreatedHighlightId(id);
              else setCreatedNotice({ id, hidden: false });
            }}
            busy={busy}
          />
        </DialogContent>
      </Dialog>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <InboxDialog.Root open={inboxOpen} onOpenChange={setInboxOpen}>
        <InboxDialog.Portal>
          <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden lg:left-60">
            <InboxDialog.Backdrop className="pointer-events-auto absolute inset-0 bg-overlay backdrop-blur-sm transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
            <InboxDialog.Popup
              id="sidebar-inbox"
              className="pointer-events-auto absolute inset-y-0 left-0 flex w-full flex-col border-r border-border bg-card shadow-2xl outline-none transition-transform duration-300 ease-out data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full motion-reduce:transition-none sm:max-w-md lg:w-[min(30rem,calc(100vw-15rem))] lg:max-w-none"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
                <div>
                  <InboxDialog.Title className="font-semibold">Innboks</InboxDialog.Title>
                  <InboxDialog.Description className="mt-1 text-sm text-muted-foreground">
                    Påminnelser, meldinger, e-postforslag og forespørsler på ett sted.
                  </InboxDialog.Description>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Lukk innboks"
                  onClick={() => setInboxOpen(false)}
                >
                  <X size={18} />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mt-3">
                  <BrowserNotificationPrompt
                    permission={notificationPermission}
                    onEnable={() => void enableBrowserNotifications()}
                  />
                </div>
                <InboxItems
                  orgId={org.id}
                  inbox={inboxQuery.data}
                  adminItems={classInboxQuery.data}
                  feedbackItems={feedbackInboxQuery.data}
                  contacts={data.contacts}
                  teams={state.organizations}
                  onRefresh={() => qc.invalidateQueries({ queryKey: ["contact-data", org.id] })}
                  onOpenContact={(contactId) => {
                    setInboxOpen(false);
                    setPage("contacts");
                    setSelectedId(contactId);
                  }}
                />
                {data.reminders.length === 0 ? (
                  !inboxQuery.data?.overlaps?.length &&
                  !inboxQuery.data?.suggestions.length &&
                  !inboxQuery.data?.requests.length &&
                  !feedbackInboxQuery.data?.length &&
                  !classInboxQuery.data?.length ? (
                    <p className="py-5 text-sm text-muted-foreground">Innboksen er tom.</p>
                  ) : null
                ) : (
                  <div className="mt-4 space-y-4">
                    {[
                      { title: "Klare nå", items: dueReminders },
                      {
                        title: "Kommende",
                        items: data.reminders.filter(
                          (reminder) => !dueReminders.includes(reminder),
                        ),
                      },
                    ].map((group) =>
                      group.items.length ? (
                        <section key={group.title}>
                          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {group.title}
                          </h3>
                          <div className="space-y-2">
                            {group.items.map((reminder) => {
                              const contact = data.contacts.find(
                                (item) => item.id === reminder.contactId,
                              );
                              return (
                                <div
                                  key={reminder.id}
                                  className="rounded-xl border border-border p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <button
                                        type="button"
                                        className="font-medium text-primary hover:underline"
                                        onClick={() => {
                                          setInboxOpen(false);
                                          setSelectedId(reminder.contactId);
                                        }}
                                      >
                                        {contact?.name ?? "Kontakt"}
                                      </button>
                                      <p className="text-xs text-muted-foreground">
                                        {dateTimeLabel(reminder.dueAt)}
                                      </p>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        void mutate(`/reminders/${reminder.id}/dismiss`, {})
                                      }
                                    >
                                      Fjern
                                    </Button>
                                  </div>
                                  {reminder.message && (
                                    <p className="mt-2 whitespace-pre-wrap text-sm">
                                      {reminder.message}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            </InboxDialog.Popup>
          </div>
        </InboxDialog.Portal>
      </InboxDialog.Root>
    </div>
  );
}
