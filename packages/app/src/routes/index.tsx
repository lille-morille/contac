import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignLeft,
  ArrowLeft,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Building2,
  CalendarPlus,
  CalendarDays,
  ChevronDown,
  Clock3,
  ClipboardPaste,
  Copy,
  GraduationCap,
  Inbox,
  Keyboard,
  LayoutGrid,
  List,
  ListFilter,
  LogOut,
  Mail,
  Moon,
  BookOpen,
  FileText,
  Phone,
  PhoneCall,
  Pencil,
  Check,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Tag as TagIcon,
  Tags,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import {
  ContactStatusBadge,
  ContactStatusIcon,
  contactStatusColor,
  contactStatuses as statuses,
  type ContactStatus as Status,
} from "../components/contact-status.tsx";
import { Avatar } from "../components/ui/avatar.tsx";
import { ProfileEditor } from "../components/profile-editor.tsx";
import { EmailComposer } from "../components/email-composer.tsx";
import { SemanticSearch } from "../components/semantic-search.tsx";
import type { SearchResult } from "../components/semantic-search.tsx";
import { CommandPalette, type PaletteItem } from "../components/command-palette.tsx";
import { TeamAiSettings } from "../components/team-ai-settings.tsx";
import { ContactAiPanel, ContactAiFieldSuggestions } from "../components/contact-ai-panel.tsx";
import { GroupAiSummary } from "../components/group-ai-summary.tsx";
import { LoiPanel } from "../components/loi-panel.tsx";
import { TeamLoiSettings } from "../components/team-loi-settings.tsx";
import { LiveText } from "../components/live-text.tsx";
import { CrossTeamOverlap } from "../components/cross-team-overlap.tsx";
import { InboxItems, type InboxData, type AdminInboxItem } from "../components/inbox-items.tsx";
import { ProfileAgentAccess } from "../components/profile-agent-access.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card } from "../components/ui/card.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { DateTimePicker } from "../components/ui/date-time-picker.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog.tsx";
import { Input } from "../components/ui/input.tsx";
import { MultiSelect } from "../components/ui/multi-select.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.tsx";
import { Select } from "../components/ui/select.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import {
  ApiError,
  downloadOrgFile,
  profileAvatarUrl,
  readOrgText,
  request,
  uploadFile,
} from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { copyText } from "../lib/clipboard.ts";
import { typstQuoteSnippet } from "../lib/typst-citation.ts";
import { parseContactPaste, remainingSuggestion } from "../lib/contact-paste.ts";
import { HighlightedText } from "../lib/search-highlight.tsx";
import { useOrg } from "../lib/org.tsx";
import { useTeamRealtime } from "../lib/team-realtime.tsx";
import { useTheme } from "../lib/theme.ts";

export const Route = createFileRoute("/")({ component: Home });
const statusOptions = statuses.map(([value, label]) => ({
  value,
  label,
  icon: <ContactStatusIcon status={value} />,
}));
const companyStatuses = [
  ["ingen", "Ingen status"],
  ["kunde", "Kunde"],
  ["konkurrent", "Konkurrent"],
  ["samarbeidspartner", "Samarbeidspartner"],
] as const;
const companyStatusColors: Record<(typeof companyStatuses)[number][0], string> = {
  ingen: "var(--border)",
  kunde: "var(--mint)",
  konkurrent: "var(--coral)",
  samarbeidspartner: "var(--blue)",
};
const colors = {
  blue: "var(--blue)",
  orange: "var(--orange)",
  mint: "var(--mint)",
  pink: "var(--pink)",
  violet: "var(--primary)",
  coral: "var(--coral)",
  yellow: "var(--yellow)",
  lime: "var(--lime)",
  cyan: "var(--cyan)",
  slate: "var(--slate)",
};
type Color = keyof typeof colors;
const colorLabels: Record<Color, string> = {
  blue: "blå",
  orange: "oransje",
  mint: "mintgrønn",
  pink: "rosa",
  violet: "fiolett",
  coral: "korall",
  yellow: "gul",
  lime: "limegrønn",
  cyan: "cyan",
  slate: "skifergrå",
};
type Company = {
  id: string;
  name: string;
  status: (typeof companyStatuses)[number][0];
  loiLogoFileId: string | null;
  loiLogoUrl: string | null;
};
type Domain = { id: string; name: string; description: string | null; color: Color };
type Tag = { id: string; name: string; description: string | null };
type Contact = {
  id: string;
  contactNumber: number;
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  description: string | null;
  sharedNote: string;
  sharedNoteSavedAt: string | null;
  stikkord: string | null;
  stikkordGeneratedAt: string | null;
  status: Status;
  assigneeId: string | null;
  duplicateOfId: string | null;
  allowExternalAi: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
type Activity = {
  id: string;
  kind: "phone" | "missed_phone" | "meeting" | "email";
  summary: string;
  transcript: string;
  missedOutcome: MissedOutcome | null;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  allowExternalAiOverride: boolean | null;
  exportOwnerContactId: string | null;
};
type ActivityFile = {
  activityId: string;
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};
type EmailActivity = {
  activityId: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
};
type LibraryItem = {
  id: string;
  contactId: string | null;
  activityId: string | null;
  sourceKind: "activity" | "note";
  quote: string;
  contactName: string | null;
  contactNumber: number | null;
  sourceDeleted: boolean;
  sourceEdited: boolean;
  createdAt: string;
};
type MissedOutcome = "voicemail" | "busy" | "call_later" | "no_answer" | "no_signal";
const missedOutcomeLabels: Record<MissedOutcome, string> = {
  voicemail: "Mobilsvar",
  busy: "Person opptatt",
  call_later: "Ring igjen senere",
  no_answer: "Ingen svar",
  no_signal: "Ingen dekning",
};
function activityPresentation(activity: Activity): {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
  titleClass: string;
  borderClass: string;
} {
  if (activity.kind === "missed_phone")
    return {
      label: activity.missedOutcome
        ? missedOutcomeLabels[activity.missedOutcome]
        : "Ubesvart anrop",
      icon: Phone,
      badgeClass: "bg-warn-soft text-warn",
      titleClass: "text-warn",
      borderClass: "border-l-warn",
    };
  if (activity.kind === "meeting")
    return {
      label: "Møte",
      icon: Users,
      badgeClass: "bg-blue-soft text-blue",
      titleClass: "text-blue",
      borderClass: "border-l-blue",
    };
  if (activity.kind === "email")
    return {
      label: "E-post",
      icon: Mail,
      badgeClass: "bg-ok-soft text-ok",
      titleClass: "text-ok",
      borderClass: "border-l-ok",
    };
  return {
    label: "Telefonsamtale",
    icon: PhoneCall,
    badgeClass: "bg-primary-soft text-primary",
    titleClass: "text-primary",
    borderClass: "border-l-primary",
  };
}
type Reminder = { id: string; contactId: string; dueAt: string; message: string };
type Filters = {
  status?: string[];
  assigneeId?: string[];
  companyId?: string[];
  domainId?: string[];
  tagId?: string[];
};
function normalizeFilters(input: Record<string, unknown>): Filters {
  const values = (key: keyof Filters) => {
    const raw = input[key];
    return Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === "string")
      : typeof raw === "string"
        ? [raw]
        : [];
  };
  return {
    status: values("status"),
    assigneeId: values("assigneeId"),
    companyId: values("companyId"),
    domainId: values("domainId"),
    tagId: values("tagId"),
  };
}
type SortKey = "updated" | "name" | "last_contacted" | "created";
type ViewSettings = { layout: "board" | "list"; filters: Filters; sortKey: SortKey };
const defaultViewSettings: ViewSettings = { layout: "board", filters: {}, sortKey: "updated" };
type MapFocus = { kind: "all" | "company" | "domain"; id: string | null };
type WorkspaceLocation = {
  team: string | null;
  page: Page;
  contact: string | null;
  activity: string | null;
  passage: string | null;
  query: string;
  mapFocus: MapFocus;
  view: ViewSettings;
  hasViewParams: boolean;
  librarySearch: string;
  feed: { assignee: string | null; search: string; conversationsOnly: boolean };
};
const workspacePages: Page[] = [
  "contacts",
  "contacted",
  "search",
  "duplicates",
  "deleted",
  "organizations",
  "library",
  "profile",
  "team_settings",
  "class_settings",
];
export function readWorkspaceLocation(search: string): WorkspaceLocation {
  const params = new URLSearchParams(search);
  const uuid = (value: string | null) =>
    value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  const rawPage = params.get("page") as Page;
  const page = workspacePages.includes(rawPage) ? rawPage : "contacts";
  const sort = params.get("sort") as SortKey;
  const filters: Filters = {
    status: params.getAll("status").filter((value) => statuses.some(([key]) => key === value)),
    assigneeId: params.getAll("assignee"),
    companyId: params.getAll("company"),
    domainId: params.getAll("domain"),
    tagId: params.getAll("tag"),
  };
  return {
    team: params.get("team"),
    page,
    contact: uuid(params.get("contact")),
    activity: ["note", "additional_info"].includes(params.get("activity") ?? "")
      ? params.get("activity")
      : uuid(params.get("activity")),
    passage: params.get("passage"),
    query: params.get("q") ?? "",
    mapFocus: uuid(params.get("mapDomain"))
      ? { kind: "domain", id: uuid(params.get("mapDomain")) }
      : uuid(params.get("mapCompany"))
        ? { kind: "company", id: uuid(params.get("mapCompany")) }
        : { kind: "all", id: null },
    view: {
      layout: params.get("layout") === "list" ? "list" : "board",
      sortKey: ["updated", "name", "last_contacted", "created"].includes(sort) ? sort : "updated",
      filters,
    },
    hasViewParams: ["layout", "sort", "status", "assignee", "company", "domain", "tag"].some(
      (key) => params.has(key),
    ),
    librarySearch: params.get("quoteQ") ?? "",
    feed: {
      assignee: params.get("feedAssignee"),
      search: params.get("feedQ") ?? "",
      conversationsOnly: params.get("feedAll") !== "1",
    },
  };
}
export function workspaceSearch(location: WorkspaceLocation): string {
  const params = new URLSearchParams();
  if (location.team) params.set("team", location.team);
  params.set("page", location.page);
  if (location.contact) params.set("contact", location.contact);
  if (location.activity) params.set("activity", location.activity);
  if (location.passage) params.set("passage", location.passage);
  if (location.query) params.set("q", location.query);
  if (location.mapFocus.kind === "domain" && location.mapFocus.id)
    params.set("mapDomain", location.mapFocus.id);
  if (location.mapFocus.kind === "company" && location.mapFocus.id)
    params.set("mapCompany", location.mapFocus.id);
  if (location.page === "library" && location.librarySearch)
    params.set("quoteQ", location.librarySearch);
  if (location.page === "contacted") {
    if (location.feed.assignee) params.set("feedAssignee", location.feed.assignee);
    if (location.feed.search) params.set("feedQ", location.feed.search);
    if (!location.feed.conversationsOnly) params.set("feedAll", "1");
  }
  if (location.view.layout !== "board") params.set("layout", location.view.layout);
  if (location.view.sortKey !== "updated") params.set("sort", location.view.sortKey);
  for (const [field, key] of [
    ["status", "status"],
    ["assigneeId", "assignee"],
    ["companyId", "company"],
    ["domainId", "domain"],
    ["tagId", "tag"],
  ] as const) {
    for (const value of location.view.filters[field] ?? []) params.append(key, value);
  }
  return `?${params.toString()}`;
}
function readViewDrafts(key: string): Record<string, ViewSettings> {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as {
      drafts?: Record<string, unknown>;
    } | null;
    const drafts: Record<string, ViewSettings> = {};
    for (const [draftKey, raw] of Object.entries(saved?.drafts ?? {})) {
      if (draftKey !== "home") continue;
      if (!raw || typeof raw !== "object") continue;
      const value = raw as Record<string, unknown>;
      drafts[draftKey] = {
        layout: value.layout === "list" ? "list" : "board",
        filters: normalizeFilters(
          value.filters && typeof value.filters === "object"
            ? (value.filters as Record<string, unknown>)
            : {},
        ),
        sortKey: ["updated", "name", "last_contacted", "created"].includes(String(value.sortKey))
          ? (value.sortKey as SortKey)
          : "updated",
      };
    }
    return drafts;
  } catch {
    return {};
  }
}
type Data = {
  companies: Company[];
  domains: Domain[];
  companyDomains: { companyId: string; domainId: string }[];
  personTags: Tag[];
  contactPersonTags: { contactId: string; tagId: string }[];
  additionalInfo: AdditionalInfo[];
  contacts: Contact[];
  activities: Activity[];
  activityContacts: { activityId: string; contactId: string }[];
  activityFiles: ActivityFile[];
  emailActivities: EmailActivity[];
  members: { userId: string; role: string; name: string | null; avatarPath: string | null }[];
  favoriteContactIds: string[];
  reminders: Reminder[];
};
type AdditionalInfo = {
  id: string;
  contactId: string;
  source: "agent" | "referral";
  sourceContactId: string | null;
  markdown: string;
  createdAt: string;
  updatedAt: string;
};
function assigneeOptions(members: Data["members"]) {
  return [
    { value: "", label: "Ingen", icon: <Avatar name="Uten ansvarlig" className="size-5" /> },
    ...members.map((member) => ({
      value: member.userId,
      label: member.name || "Medlem",
      icon: (
        <Avatar
          name={member.name || "Medlem"}
          src={profileAvatarUrl(member.avatarPath)}
          className="size-5"
        />
      ),
    })),
  ];
}
type Page =
  | "contacts"
  | "contacted"
  | "search"
  | "duplicates"
  | "deleted"
  | "organizations"
  | "library"
  | "profile"
  | "team_settings"
  | "class_settings";
const emptyData: Data = {
  companies: [],
  domains: [],
  companyDomains: [],
  personTags: [],
  contactPersonTags: [],
  additionalInfo: [],
  contacts: [],
  activities: [],
  activityContacts: [],
  activityFiles: [],
  emailActivities: [],
  members: [],
  favoriteContactIds: [],
  reminders: [],
};
const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
const dateTimeLabel = (date: string) =>
  new Date(date).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function nextReminderTime() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow.toISOString();
}
type ReminderPreset = "hour" | "three_hours" | "tomorrow" | "next_week";
const reminderPresets: { value: ReminderPreset; label: string }[] = [
  { value: "hour", label: "Om én time" },
  { value: "three_hours", label: "Om tre timer" },
  { value: "tomorrow", label: "I morgen" },
  { value: "next_week", label: "Om én uke" },
];
function reminderPresetTime(preset: ReminderPreset) {
  const date = new Date();
  if (preset === "hour" || preset === "three_hours")
    date.setHours(date.getHours() + (preset === "hour" ? 1 : 3));
  else {
    date.setDate(date.getDate() + (preset === "tomorrow" ? 1 : 7));
    date.setHours(9, 0, 0, 0);
  }
  return date.toISOString();
}
function ReminderTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [quickSelection, setQuickSelection] = useState<{
    preset: ReminderPreset;
    value: string;
  } | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" aria-label="Hurtigvalg for påminnelse">
        {reminderPresets.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            variant={
              quickSelection?.preset === preset.value && quickSelection.value === value
                ? "secondary"
                : "outline"
            }
            size="sm"
            className="h-7 px-2.5 text-xs"
            aria-pressed={quickSelection?.preset === preset.value && quickSelection.value === value}
            onClick={() => {
              const next = reminderPresetTime(preset.value);
              setQuickSelection({ preset: preset.value, value: next });
              onChange(next);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <DateTimePicker value={value} onChange={onChange} ariaLabel="Tidspunkt for påminnelse" />
    </div>
  );
}
function BrowserNotificationPrompt({
  permission,
  onEnable,
}: {
  permission: NotificationPermission | "unsupported";
  onEnable: () => void;
}) {
  if (permission === "granted")
    return (
      <p className="text-xs text-muted-foreground">
        Nettleservarsler er aktivert mens Contac er åpen.
      </p>
    );
  if (permission === "denied")
    return (
      <p className="text-xs text-muted-foreground">
        Nettleservarsler er blokkert. Du kan tillate dem i nettleserens innstillinger.
      </p>
    );
  if (permission === "unsupported")
    return (
      <p className="text-xs text-muted-foreground">
        Nettleservarsler krever en sikker HTTPS-adresse og en støttet nettleser.
      </p>
    );
  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" size="sm" onClick={onEnable}>
        Aktiver nettleservarsler
      </Button>
      <p className="text-xs text-muted-foreground">
        Du får et varsel ved forfall mens Contac er åpen.
      </p>
    </div>
  );
}
const sidebarSpring = { type: "spring" as const, stiffness: 400, damping: 30 };
function SidebarActivePill() {
  return (
    <motion.span
      layoutId="sidebar-active-pill"
      transition={sidebarSpring}
      className="absolute inset-0 rounded-xl bg-card shadow-sm"
      aria-hidden
    />
  );
}
function SidebarNavSection({
  title,
  items,
  activeItem,
  onSelect,
}: {
  title: string;
  items: [Page, string, typeof LayoutGrid][];
  activeItem: string;
  onSelect: (page: Page) => void;
}) {
  return (
    <section className="mt-5">
      <h2 className="sr-only">{title}</h2>
      <nav className="space-y-1" aria-label={title}>
        {items.map(([key, label, Icon]) => {
          const active = activeItem === key;
          return (
            <button
              key={key}
              type="button"
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${active ? "font-medium text-foreground" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}
              onClick={() => onSelect(key)}
            >
              {active && <SidebarActivePill />}
              <Icon
                size={17}
                className={`relative z-10 shrink-0 ${active ? "text-primary" : ""}`}
              />
              <span className="relative z-10 truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
function Home() {
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
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
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
  const inboxPanelRef = useRef<HTMLElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof window !== "undefined" && window.isSecureContext && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const [now, setNow] = useState(() => Date.now());
  const [paste, setPaste] = useState("");
  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(
    initialLocation.activity,
  );
  const [focusedPassage, setFocusedPassage] = useState<string | null>(initialLocation.passage);
  const [focusedQuery, setFocusedQuery] = useState<string | null>(initialLocation.query);
  const canOpenCommand = !!auth.session && !!state.user?.onboarded && !!org;
  useEffect(() => {
    if (!canOpenCommand) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      if (!event.repeat && !commandOpen) setCommandOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canOpenCommand, commandOpen]);
  useEffect(() => {
    if (!inboxOpen) return;
    inboxPanelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setInboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inboxOpen]);
  const [error, setError] = useState("");
  const [scalarConflict, setScalarConflict] = useState<{
    path: string;
    changes: Record<string, unknown>;
    current: Record<string, unknown>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
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
          | "additionalInfo"
          | "contacts"
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
  const data: Data = { ...emptyData, ...query.data, ...activityQuery.data, ...personalQuery.data };
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
      setPage("contacts");
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
      if (location.team && state.organizations.some((team) => team.id === location.team))
        state.select(location.team);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [state]);
  useEffect(() => {
    if (!org || !viewScope || draftScope !== viewScope) return;
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
  async function mutate<T = unknown>(path: string, body: unknown): Promise<T> {
    if (!org) throw new Error("Velg et team");
    setBusy(true);
    setError("");
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const contactId = path.match(/^\/contacts\/([0-9a-f-]{36})$/i)?.[1];
    const activityId = path.match(/^\/activities\/([0-9a-f-]{36})$/i)?.[1];
    const companyId = path.match(/^\/companies\/([0-9a-f-]{36})$/i)?.[1];
    const tagContactId = path.match(/^\/contacts\/([0-9a-f-]{36})\/tags$/i)?.[1];
    const domainCompanyId = path.match(/^\/companies\/([0-9a-f-]{36})\/domains$/i)?.[1];
    const source = contactId
      ? data.contacts.find((item) => item.id === contactId)
      : activityId
        ? data.activities.find((item) => item.id === activityId)
        : companyId
          ? data.companies.find((item) => item.id === companyId)
          : null;
    const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "expected"));
    const relationExpected = tagContactId
      ? {
          tagIds: data.contactPersonTags
            .filter((link) => link.contactId === tagContactId)
            .map((link) => link.tagId),
        }
      : domainCompanyId
        ? {
            domainIds: data.companyDomains
              .filter((link) => link.companyId === domainCompanyId)
              .map((link) => link.domainId),
          }
        : null;
    const payload =
      source && (contactId || activityId || companyId)
        ? {
            ...changes,
            expected:
              input.expected ??
              Object.fromEntries(
                Object.keys(changes).map((key) => [
                  key,
                  (source as unknown as Record<string, unknown>)[key],
                ]),
              ),
          }
        : relationExpected
          ? { ...changes, expected: input.expected ?? relationExpected }
          : body;
    try {
      const result = await request<T>(`/org${path}`, org.id, payload);
      if (
        contactId ||
        path.startsWith("/companies") ||
        path.startsWith("/domains") ||
        path.startsWith("/person-tags") ||
        path.endsWith("/tags")
      )
        await qc.invalidateQueries({ queryKey: ["contact-data", org.id, "core"] });
      else if (activityId || path === "/activities") {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["contact-data", org.id, "activities"] }),
          qc.invalidateQueries({ queryKey: ["contact-data", org.id, "core"] }),
        ]);
      } else if (path.includes("/favorite") || path.startsWith("/reminders"))
        await qc.invalidateQueries({ queryKey: ["contact-data", org.id, "personal"] });
      else await qc.invalidateQueries({ queryKey: ["contact-data", org.id] });
      if (path.includes("email") || path.includes("reminders"))
        await qc.invalidateQueries({ queryKey: ["inbox", org.id] });
      if (path.startsWith("/library"))
        await qc.invalidateQueries({ queryKey: ["library", org.id] });
      if (/^\/contacts\/[^/]+\/(delete|restore)$/.test(path)) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["deleted-contacts", org.id] }),
          qc.invalidateQueries({ queryKey: ["contact-data", org.id] }),
          qc.invalidateQueries({ queryKey: ["inbox", org.id] }),
        ]);
      }
      setNow(Date.now());
      return result;
    } catch (cause) {
      if (
        (path.startsWith("/person-tags/") || path.startsWith("/domains/")) &&
        cause instanceof ApiError &&
        cause.status === 409
      ) {
        setError(
          "Taggen ble endret av noen andre. Sammenlign den nye beskrivelsen med utkastet ditt.",
        );
        void qc.invalidateQueries({ queryKey: ["contact-data", org.id, "core"] });
      } else if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        cause.details.current &&
        typeof cause.details.current === "object"
      ) {
        setScalarConflict({
          path,
          changes,
          current: cause.details.current as Record<string, unknown>,
        });
        void qc.invalidateQueries({ queryKey: ["contact-data", org.id] });
      } else setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }
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
            : b.updatedAt.localeCompare(a.updatedAt),
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
  function selectTeam(id: string) {
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
    state.select(id);
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
  async function openClipboardContact() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError("Utklippstavlen er tom. Kopier kontaktinformasjon og prøv igjen.");
        return;
      }
      setPaste(text);
      setCreateOpen(true);
    } catch {
      setError("Kunne ikke lese utklippstavlen. Gi nettleseren tilgang og prøv igjen.");
    }
  }
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
  const contactNav: [Page, string, typeof LayoutGrid][] = [
    ["contacts", "Kontaktlogg", LayoutGrid],
    ["contacted", "Sist kontaktet", CalendarDays],
    ...(data.contacts.some((contact) => contact.status === "duplicate")
      ? ([["duplicates", "Duplikate kontakter", Copy]] as [Page, string, typeof LayoutGrid][])
      : []),
    ...(deletedContacts.length
      ? ([["deleted", "Slettede kontakter", Trash2]] as [Page, string, typeof LayoutGrid][])
      : []),
  ];
  const overviewNav: [Page, string, typeof LayoutGrid][] = [
    ["library", "Sitater", BookOpen],
    ["organizations", "Organisasjoner", Building2],
  ];
  const inboxCount =
    dueReminders.length +
    (inboxQuery.data?.suggestions.length ?? 0) +
    (inboxQuery.data?.requests.length ?? 0) +
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
        setPaste("");
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
      title: "Kopier kontaktlogg som YAML",
      detail: "Eksporter hele teamets kontaktlogg",
      searchText: "eksport typst kopier",
      icon: FileText,
      run: () =>
        void readOrgText(org.id, "/org/export/contact-log.yaml")
          .then(copyText)
          .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))),
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
      title: "Profil",
      detail: state.user?.name ?? undefined,
      searchText: "min profil konto innstillinger",
      icon: UserRound,
      run: () => go("profile"),
    },
    {
      id: "page:team_settings",
      group: "pages" as const,
      title: "Teaminnstillinger",
      searchText: "team AI LOI",
      icon: Settings2,
      run: () => go("team_settings"),
    },
    ...(state.classSpace?.role === "admin"
      ? [
          {
            id: "page:class_settings",
            group: "pages" as const,
            title: "Klasseinnstillinger",
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
  const favorites = data.favoriteContactIds
    .map((id) => data.contacts.find((contact) => contact.id === id))
    .filter((contact): contact is Contact => !!contact && contact.status !== "duplicate");
  const activeSidebarItem =
    selectedId && favorites.some((contact) => contact.id === selectedId)
      ? `favorite:${selectedId}`
      : page;
  const shortcutNavigation = [
    ...contactNav.map(([id]) => id),
    ...overviewNav.map(([id]) => id),
    ...favorites.map((contact) => `favorite:${contact.id}`),
    "profile",
    "team_settings",
    ...(state.classSpace?.role === "admin" ? ["class_settings"] : []),
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
        document.querySelector('[role="dialog"], [role="menu"]') ||
        commandOpen ||
        createOpen ||
        shortcutHelpOpen ||
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
        setPaste("");
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
  return (
    <div className="min-h-screen lg:flex">
      <aside className="glass workspace-sidebar flex w-full shrink-0 flex-col p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:overflow-hidden">
        <div className="mb-4 flex items-center justify-between gap-2 px-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Users size={18} />
            </div>
            <strong className="truncate">{productSettings.data?.businessName || "Contac"}</strong>
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
              setPaste("");
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
            title="Kontakter"
            items={contactNav}
            activeItem={activeSidebarItem}
            onSelect={go}
          />
          <SidebarNavSection
            title="Oversikt"
            items={overviewNav}
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
            onClick={() => setShortcutHelpOpen(true)}
          >
            <Keyboard size={16} /> Tastatursnarveier <kbd className="ml-auto text-xs">?</kbd>
          </button>
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition-colors ${page === "profile" ? "bg-card font-medium text-foreground shadow-sm" : "hover:bg-card/70"}`}
            onClick={() => go("profile")}
          >
            <Avatar
              name={state.user?.name ?? "Bruker"}
              src={profileAvatarUrl(state.user?.avatarPath)}
              className="size-8"
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{state.user?.name ?? "Bruker"}</span>
              <span className="block text-xs text-muted-foreground">Profil</span>
            </span>
          </button>
          <Select
            value={org.id}
            onValueChange={selectTeam}
            items={state.organizations.map((o) => ({ value: o.id, label: o.name }))}
            aria-label="Team"
          />
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${page === "team_settings" ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}
            onClick={() => go("team_settings")}
          >
            <Settings2 size={16} /> Teaminnstillinger
          </button>
          {state.classSpace?.role === "admin" && (
            <button
              type="button"
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${page === "class_settings" ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}
              onClick={() => go("class_settings")}
            >
              <GraduationCap size={16} /> Klasseinnstillinger
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-card/70 hover:text-foreground"
              onClick={() => void auth.signOut()}
            >
              <LogOut size={16} /> Logg ut
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
        {selectedId ? (
          selectedDeletedContact ? (
            <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card">
              <h1 className="text-2xl font-semibold">{selectedDeletedContact.name} er slettet</h1>
              <p className="text-sm text-muted-foreground">
                Kontakten og historikken er bevart. Gjenopprett for å fortsette arbeidet.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelectedId(null)}>
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
              onBack={() => {
                setComposerShortcut(null);
                setSelectedId(null);
                setFocusedActivityId(null);
                setFocusedPassage(null);
                setFocusedQuery(null);
              }}
              onOpen={(id) => {
                setSelectedId(id);
                setFocusedActivityId(null);
              }}
              onDelete={setDeletingContact}
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
        ) : page === "profile" || page === "team_settings" || page === "class_settings" ? (
          <Settings section={page} state={state} mutate={mutate} busy={busy} />
        ) : page === "organizations" ? (
          <OrganizationMap
            key={organizationTarget.nonce}
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
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
        <DialogContent className="max-w-lg">
          <DialogTitle>Tastatursnarveier</DialogTitle>
          <DialogDescription>Snarveier virker når du ikke skriver i et felt.</DialogDescription>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 text-sm">
            <span>Forrige / neste side</span>
            <kbd>W/K · S/J</kbd>
            <span>Ny kontakt</span>
            <kbd>C</kbd>
            <span>Innboks</span>
            <kbd>I</kbd>
            <span>Kontakt: ansvarlig / meg / tagger / status</span>
            <kbd>A / I / L / S</kbd>
            <span>Kontakt: favoritt / ring / e-post / slett</span>
            <kbd>F / R / E / D</kbd>
            <span>Kontekstmeny på kontakt</span>
            <kbd>Høyreklikk / Shift+F10</kbd>
            <span>Vis denne hjelpen</span>
            <kbd>?</kbd>
            <span>Åpne kommandomeny</span>
            <kbd>⌘K / Ctrl+K</kbd>
            <span>Lukk meny eller dialog</span>
            <kbd>Esc</kbd>
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
          <div className="mt-4 space-y-1">
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
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    void mutate(`/contacts/${shortcutChooser.contactId}`, { status: option.value });
                    closeShortcutChooser();
                  }}
                >
                  {option.label}
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogTitle>Ny kontakt</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void openClipboardContact()}
          >
            <ClipboardPaste size={16} /> Lim inn kontaktinformasjon
          </Button>
          <CreateContact
            key={paste}
            data={data}
            initial={parseContactPaste(paste)}
            mutate={mutate}
            onCreated={(id, openDetail) => {
              setCreateOpen(false);
              setPaste("");
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
      {inboxOpen && (
        <aside
          id="sidebar-inbox"
          ref={inboxPanelRef}
          tabIndex={-1}
          aria-label="Innboks"
          className="fixed inset-y-0 right-0 z-[70] flex w-full flex-col border-l border-border bg-card shadow-2xl outline-none sm:max-w-md lg:right-auto lg:left-60 lg:w-[min(30rem,calc(100vw-15rem))]"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="font-semibold">Innboks</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Påminnelser, e-postforslag og forespørsler på ett sted.
              </p>
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
              contacts={data.contacts}
              teams={state.organizations}
              onRefresh={() => qc.invalidateQueries({ queryKey: ["contact-data", org.id] })}
            />
            {data.reminders.length === 0 ? (
              !inboxQuery.data?.suggestions.length &&
              !inboxQuery.data?.requests.length &&
              !classInboxQuery.data?.length ? (
                <p className="py-5 text-sm text-muted-foreground">Innboksen er tom.</p>
              ) : null
            ) : (
              <div className="mt-4 space-y-4">
                {[
                  { title: "Klare nå", items: dueReminders },
                  {
                    title: "Kommende",
                    items: data.reminders.filter((reminder) => !dueReminders.includes(reminder)),
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
                            <div key={reminder.id} className="rounded-xl border border-border p-3">
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
        </aside>
      )}
      <Dialog open={!!scalarConflict} onOpenChange={(open) => !open && setScalarConflict(null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Endringen ble ikke lagret</DialogTitle>
          <DialogDescription>
            Noen endret samme felt. Sammenlign verdiene før du prøver igjen.
          </DialogDescription>
          {scalarConflict && (
            <>
              <div className="mt-4 space-y-3">
                {Object.entries(scalarConflict.changes).map(([field, local]) => (
                  <div
                    key={field}
                    className="grid gap-2 rounded-xl border border-border p-3 text-sm sm:grid-cols-2"
                  >
                    <div>
                      <strong>Din endring · {field}</strong>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        {local == null || local === ""
                          ? "(tomt)"
                          : typeof local === "object"
                            ? JSON.stringify(local)
                            : String(local)}
                      </p>
                    </div>
                    <div>
                      <strong>Nyeste lagrede verdi</strong>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        {scalarConflict.current[field] == null ||
                        scalarConflict.current[field] === ""
                          ? "(tomt)"
                          : typeof scalarConflict.current[field] === "object"
                            ? JSON.stringify(scalarConflict.current[field])
                            : String(scalarConflict.current[field])}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setScalarConflict(null)}>
                  Behold nyeste
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    const conflict = scalarConflict;
                    const expected = Object.fromEntries(
                      Object.keys(conflict.changes).map((key) => [key, conflict.current[key]]),
                    );
                    void mutate(conflict.path, { ...conflict.changes, expected })
                      .then(() => setScalarConflict(null))
                      .catch(() => {});
                  }}
                >
                  Bruk min endring
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function NoTeam() {
  const state = useOrg();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await request("/organizations", undefined, { name });
      await state.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-content-center gap-4 p-5">
      <h1 className="text-2xl font-semibold">Velkommen, {state.user?.name}</h1>
      {state.classSpace?.role === "admin" ? (
        <form className="space-y-3" onSubmit={(e) => void create(e)}>
          <p>Opprett klassens første team.</p>
          <Input
            required
            placeholder="Teamnavn"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit">Opprett team</Button>
        </form>
      ) : (
        <p>Åpne invitasjonslenken fra teamet for å bli med.</p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </main>
  );
}
function DeletedContactsPage({
  contacts,
  companies,
  loading,
  busy,
  onOpen,
  onRestore,
}: {
  contacts: Contact[];
  companies: Company[];
  loading: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">Slettede kontakter</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gjenoppretting tar med kontaktens tidligere felter og samtaler.
      </p>
      {loading && <p className="mt-6 text-sm text-muted-foreground">Laster …</p>}
      {!loading && !contacts.length && (
        <p className="mt-6 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Ingen slettede kontakter.
        </p>
      )}
      <div className="mt-5 space-y-2">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
          >
            <button
              type="button"
              className="min-w-0 text-left hover:text-primary"
              onClick={() => onOpen(contact.id)}
            >
              <span className="block font-medium">{contact.name}</span>
              <span className="block text-xs text-muted-foreground">
                {companies.find((company) => company.id === contact.companyId)?.name ??
                  "Organisasjon ukjent"}
                {contact.deletedAt ? ` · Slettet ${dateTimeLabel(contact.deletedAt)}` : ""}
              </span>
            </button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onRestore(contact.id)}
            >
              Gjenopprett
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryPage({
  onOpen,
  initialSearch,
  onSearchChange,
}: {
  onOpen: (contactId: string, activityId: string | null) => void;
  initialSearch: string;
  onSearchChange: (value: string) => void;
}) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [search, setSearch] = useState(initialSearch);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const library = useQuery({
    queryKey: ["library", org?.id],
    queryFn: () => request<LibraryItem[]>("/org/library", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const entries = (library.data ?? []).filter((item) =>
    `${item.quote} ${item.contactName ?? ""}`
      .toLocaleLowerCase("nb-NO")
      .includes(search.toLocaleLowerCase("nb-NO")),
  );
  async function remove(id: string) {
    if (!org) return;
    try {
      await request(`/org/library/${id}/delete`, org.id, {});
      await qc.invalidateQueries({ queryKey: ["library", org.id] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke fjerne sitatet.");
    }
  }
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="sr-only">Sitater</h1>
      <Input
        className="max-w-sm"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          onSearchChange(event.target.value);
        }}
        placeholder="Søk i sitater …"
        aria-label="Søk i sitater"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-risk">
          {error}
        </p>
      )}
      {library.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Laster sitater …</p>
      ) : entries.length ? (
        <div className="mt-5 columns-1 gap-3 sm:columns-2 xl:columns-3">
          {entries.map((item) => (
            <Card key={item.id} className="mb-3 break-inside-avoid p-5">
              <blockquote className="whitespace-pre-wrap border-l-2 border-primary pl-3 text-sm leading-relaxed">
                {item.quote}
              </blockquote>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {item.sourceKind === "note" ? "Notat" : "Aktivitet"} ·{" "}
                  {item.contactName ?? "Slettet kontakt"}
                </span>
                {item.sourceDeleted ? (
                  <Badge variant="neutral">Kilden er slettet</Badge>
                ) : item.sourceEdited ? (
                  <Badge variant="neutral">Endret etter lagring</Badge>
                ) : null}
              </div>
              <div className="mt-4 flex gap-2">
                {!item.sourceDeleted && item.contactId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpen(item.contactId!, item.activityId)}
                  >
                    Åpne kilde
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void remove(item.id)}>
                  Fjern sitat
                </Button>
              </div>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                disabled={item.sourceDeleted || !item.contactId || !item.contactNumber}
                title={
                  item.sourceDeleted || !item.contactId || !item.contactNumber
                    ? "Kilden eller kontaktnummeret er ikke tilgjengelig"
                    : undefined
                }
                onClick={() => {
                  if (!item.contactId || !item.contactNumber) return;
                  void copyText(
                    typstQuoteSnippet({
                      quote: item.quote,
                      contactNumbers: [item.contactNumber],
                      contactId: item.contactId,
                      activityId: item.activityId,
                      libraryId: item.id,
                    }),
                  ).then(
                    () => setCopiedId(item.id),
                    () => setError("Kunne ikke kopiere Typst-sitatet."),
                  );
                }}
              >
                {copiedId === item.id ? "Typst-sitat kopiert" : "Kopier Typst-sitat"}
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="mt-5 p-8 text-center text-sm text-muted-foreground">
          Ingen sitater ennå. Marker tekst i en aktivitet eller et notat og velg «Legg til i
          sitater».
        </Card>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Notatsitater forblir utenfor AI-sammendrag.
      </p>
    </div>
  );
}
function ActivityFeed({
  data,
  currentUserId,
  onOpenActivity,
  initialFilters,
  onFiltersChange,
}: {
  data: Data;
  currentUserId: string;
  onOpenActivity: (contactId: string, activityId: string) => void;
  initialFilters: WorkspaceLocation["feed"];
  onFiltersChange: React.Dispatch<React.SetStateAction<WorkspaceLocation["feed"]>>;
}) {
  const [assigneeId, setAssigneeId] = useState(initialFilters.assignee ?? currentUserId);
  const [conversationsOnly, setConversationsOnly] = useState(initialFilters.conversationsOnly);
  const [search, setSearch] = useState(initialFilters.search);
  const currentMember = data.members.find((member) => member.userId === currentUserId);
  const entries = data.activities
    .filter((activity) => !conversationsOnly || activity.kind !== "missed_phone")
    .map((activity) => {
      const contacts = data.activityContacts
        .filter((link) => link.activityId === activity.id)
        .map((link) => data.contacts.find((contact) => contact.id === link.contactId))
        .filter((contact): contact is Contact => !!contact && contact.status !== "duplicate");
      const matchingContacts = contacts.filter((contact) =>
        assigneeId === "all"
          ? true
          : assigneeId === "unassigned"
            ? !contact.assigneeId
            : contact.assigneeId === assigneeId,
      );
      return { activity, contacts, matchingContacts };
    })
    .filter(({ activity, contacts, matchingContacts }) => {
      if (!matchingContacts.length) return false;
      const term = search.trim().toLocaleLowerCase("nb-NO");
      if (!term) return true;
      return [
        activity.summary,
        activity.transcript,
        ...contacts.flatMap((contact) => [
          contact.name,
          data.companies.find((company) => company.id === contact.companyId)?.name ?? "",
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase("nb-NO")
        .includes(term);
    })
    .sort(
      (a, b) =>
        b.activity.occurredAt.localeCompare(a.activity.occurredAt) ||
        b.activity.createdAt.localeCompare(a.activity.createdAt),
    );
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="sr-only">Sist kontaktet</h1>
      <div className="grid gap-3 sm:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)_auto] sm:items-end">
        <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
          Ansvarlig for kontakten
          <Select
            className="w-full"
            value={assigneeId}
            onValueChange={(value) => {
              setAssigneeId(value);
              onFiltersChange((current) => ({ ...current, assignee: value }));
            }}
            aria-label="Filtrer aktiviteter etter kontaktansvarlig"
            items={[
              {
                value: currentUserId,
                label: `Mine kontakter${currentMember?.name ? ` · ${currentMember.name}` : ""}`,
                icon: <UserRound size={16} />,
              },
              { value: "all", label: "Alle kontakter", icon: <Users size={16} /> },
              ...data.members
                .filter((member) => member.userId !== currentUserId)
                .map((member) => ({
                  value: member.userId,
                  label: member.name || "Medlem",
                  icon: (
                    <Avatar
                      name={member.name || "Medlem"}
                      src={profileAvatarUrl(member.avatarPath)}
                      className="size-5"
                    />
                  ),
                })),
              { value: "unassigned", label: "Uten ansvarlig", icon: <UserRound size={16} /> },
            ]}
          />
        </label>
        <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
          Søk
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              onFiltersChange((current) => ({ ...current, search: event.target.value }));
            }}
            placeholder="Søk i samtaler, kontakter og organisasjoner …"
            aria-label="Søk i aktiviteter"
          />
        </label>
        <label className="flex h-9 items-center gap-2 whitespace-nowrap text-sm">
          <Checkbox
            checked={conversationsOnly}
            onCheckedChange={(checked) => {
              setConversationsOnly(checked);
              onFiltersChange((current) => ({ ...current, conversationsOnly: checked }));
            }}
            aria-label="Bare samtaler"
          />
          Bare samtaler
        </label>
      </div>
      {entries.length ? (
        <div className="mt-6 space-y-3">
          {entries.map(({ activity, contacts, matchingContacts }) => {
            const actor = data.members.find((member) => member.userId === activity.createdBy);
            const label =
              activity.kind === "meeting"
                ? "Møte"
                : activity.kind === "phone"
                  ? "Telefonsamtale"
                  : activity.kind === "email"
                    ? "E-post"
                    : activity.missedOutcome
                      ? missedOutcomeLabels[activity.missedOutcome]
                      : "Ubesvart anrop";
            const Icon =
              activity.kind === "meeting"
                ? Users
                : activity.kind === "phone"
                  ? PhoneCall
                  : activity.kind === "email"
                    ? Mail
                    : Phone;
            return (
              <Card key={activity.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Icon size={18} />
                    </span>
                    <div>
                      <h2 className="font-semibold">{label}</h2>
                      <p className="text-xs text-muted-foreground">
                        {dateTimeLabel(activity.occurredAt)}
                        {actor && ` · Registrert av ${actor.name || "Medlem"}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenActivity(matchingContacts[0]!.id, activity.id)}
                  >
                    Åpne i kontakt
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {contacts.map((contact) => {
                    const company = data.companies.find((item) => item.id === contact.companyId);
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        className="rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-left text-xs hover:border-primary/30 hover:text-primary"
                        onClick={() => onOpenActivity(contact.id, activity.id)}
                      >
                        {contact.name}
                        {company ? ` · ${company.name}` : ""}
                      </button>
                    );
                  })}
                </div>
                {activity.summary ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                    {activity.summary}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Ingen notater.</p>
                )}
                {activity.transcript && (
                  <details className="mt-3 border-t border-border pt-3">
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      Vis transkripsjon
                    </summary>
                    <p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
                      {activity.transcript}
                    </p>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="mt-6 p-8 text-center text-sm text-muted-foreground">
          Ingen aktiviteter for dette utvalget. Velg en annen ansvarlig eller vis ubesvarte anrop.
        </Card>
      )}
    </div>
  );
}
type BoardDrag = {
  gestureId: number;
  id: string;
  source: Status;
  target: Status | null;
  phase: "dragging" | "settling";
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  destinationLeft: number;
  destinationTop: number;
};
type PendingBoardDrag = Omit<
  BoardDrag,
  "target" | "phase" | "destinationLeft" | "destinationTop"
> & {
  pointerId: number;
  startX: number;
  startY: number;
};
const boardSpring = { type: "spring" as const, stiffness: 380, damping: 32 };

function ContactBoard({
  rows,
  visibleStatuses,
  data,
  onOpen,
  mutate,
  highlightId,
}: {
  rows: Contact[];
  visibleStatuses?: string[];
  data: Data;
  onOpen: (id: string) => void;
  mutate: (path: string, body: unknown) => Promise<unknown>;
  highlightId: string | null;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingBoardDrag | null>(null);
  const dragRef = useRef<BoardDrag | null>(null);
  const frameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const gestureIdRef = useRef(0);
  const writesRef = useRef(new Map<string, Promise<void>>());
  const suppressClickRef = useRef(false);
  const [drag, setDragState] = useState<BoardDrag | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, Status>>({});

  function setDrag(next: BoardDrag | null) {
    dragRef.current = next;
    setDragState(next);
  }
  function targetAt(x: number, y: number): Status | null {
    const section = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-status-column]");
    const value = section?.dataset.statusColumn;
    return statuses.some(([status]) => status === value) ? (value as Status) : null;
  }
  function stopScroll() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
  useEffect(
    () => () => {
      stopScroll();
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    },
    [],
  );
  function scrollWhileDragging() {
    const current = dragRef.current;
    const board = boardRef.current;
    if (!current || current.phase !== "dragging" || !board) {
      frameRef.current = null;
      return;
    }
    const rect = board.getBoundingClientRect();
    if (current.y >= rect.top && current.y <= rect.bottom) {
      const edge = 72;
      const left = Math.max(0, (rect.left + edge - current.x) / edge);
      const right = Math.max(0, (current.x - (rect.right - edge)) / edge);
      const amount = Math.min(1, right) * 15 - Math.min(1, left) * 15;
      if (amount) {
        board.scrollLeft += amount;
        const target = targetAt(current.x, current.y);
        if (target !== current.target) setDrag({ ...current, target });
      }
    }
    const column = document
      .elementFromPoint(current.x, current.y)
      ?.closest<HTMLElement>("[data-status-column]");
    const cards = column?.querySelector<HTMLElement>("[data-column-scroll]");
    if (cards) {
      const cardRect = cards.getBoundingClientRect();
      if (current.x >= cardRect.left && current.x <= cardRect.right) {
        const edge = 64;
        const top = Math.max(0, (cardRect.top + edge - current.y) / edge);
        const bottom = Math.max(0, (current.y - (cardRect.bottom - edge)) / edge);
        cards.scrollTop += Math.min(1, bottom) * 13 - Math.min(1, top) * 13;
      }
    }
    frameRef.current = requestAnimationFrame(scrollWhileDragging);
  }
  function onPointerDown(e: PointerEvent<HTMLButtonElement>, contact: Contact) {
    if (e.button !== 0 || !e.isPrimary || dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pendingRef.current = {
      gestureId: ++gestureIdRef.current,
      id: contact.id,
      source: optimistic[contact.id] ?? contact.status,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const pending = pendingRef.current;
    if (!pending || pending.pointerId !== e.pointerId) return;
    const current = dragRef.current;
    if (!current && Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < 6) return;
    e.preventDefault();
    if (!current) suppressClickRef.current = true;
    setDrag({
      gestureId: pending.gestureId,
      id: pending.id,
      source: pending.source,
      target: targetAt(e.clientX, e.clientY),
      phase: "dragging",
      x: e.clientX,
      y: e.clientY,
      offsetX: pending.offsetX,
      offsetY: pending.offsetY,
      width: pending.width,
      height: pending.height,
      destinationLeft: 0,
      destinationTop: 0,
    });
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(scrollWhileDragging);
  }
  function finishDrag(e: PointerEvent<HTMLButtonElement>) {
    if (pendingRef.current?.pointerId !== e.pointerId) return;
    pendingRef.current = null;
    stopScroll();
    const current = dragRef.current;
    if (!current || current.phase !== "dragging") return;
    const target = e.type === "pointercancel" ? null : targetAt(e.clientX, e.clientY);
    const destination =
      target && target !== current.source
        ? document.querySelector<HTMLElement>(`[data-drop-preview="${target}"]`)
        : document.querySelector<HTMLElement>(`[data-board-card="${current.id}"]`);
    const rect = destination?.getBoundingClientRect();
    setDrag({
      ...current,
      target,
      phase: "settling",
      destinationLeft: rect?.left ?? current.x - current.offsetX,
      destinationTop: rect?.top ?? current.y - current.offsetY,
    });
    // Settle independently of Motion's completion callback: a rapid second drag can
    // otherwise consume a completion event from the previous overlay animation.
    settleTimerRef.current = window.setTimeout(() => finishAnimation(current.gestureId), 380);
    // The browser fires click after pointerup; keep it from opening the card.
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }
  function finishAnimation(gestureId: number) {
    const current = dragRef.current;
    if (!current || current.phase !== "settling" || current.gestureId !== gestureId) return;
    settleTimerRef.current = null;
    setDrag(null);
    if (current.target && current.target !== current.source) {
      const { id, target } = current;
      setOptimistic((value) => ({ ...value, [id]: target! }));
      // Keep writes for a contact in drag order. Refetches from earlier writes
      // must not move a later, still pending drag back to an old column.
      const write = (writesRef.current.get(id) ?? Promise.resolve())
        .catch(() => {})
        .then(() => mutate(`/contacts/${id}`, { status: target }))
        .then(() => {});
      writesRef.current.set(id, write);
      void write.then(
        () => clearOptimistic(id, write),
        () => clearOptimistic(id, write),
      );
    }
  }
  function clearOptimistic(id: string, write: Promise<void>) {
    if (writesRef.current.get(id) !== write) return;
    writesRef.current.delete(id);
    setOptimistic((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
  }
  const draggedContact = drag ? data.contacts.find((contact) => contact.id === drag.id) : null;

  return (
    <LayoutGroup id="contact-board">
      <div
        ref={boardRef}
        className="mt-6 flex min-h-[65vh] gap-3 overflow-x-auto overflow-y-hidden pb-4 lg:min-h-0 lg:flex-1"
      >
        {statuses
          .filter(([key]) => !visibleStatuses?.length || visibleStatuses.includes(key))
          .map(([key, label]) => {
            const cards = rows.filter(
              (contact) => (optimistic[contact.id] ?? contact.status) === key,
            );
            const preview = drag?.target === key && drag.source !== key;
            const statusColor = contactStatusColor(key);
            return (
              <section
                key={key}
                data-status-column={key}
                className="flex h-[72dvh] w-80 shrink-0 flex-col rounded-2xl border-t-2 bg-muted/50 p-2 transition-colors duration-200 lg:h-full"
                style={{
                  borderTopColor: statusColor,
                  backgroundColor: preview
                    ? `color-mix(in srgb, ${statusColor} 16%, var(--muted))`
                    : undefined,
                }}
              >
                <h2 className="flex shrink-0 items-center justify-between px-2 py-2 text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <ContactStatusIcon status={key} size={18} />
                    {label}
                  </span>
                  <span className="text-muted-foreground">{cards.length}</span>
                </h2>
                <div
                  data-column-scroll
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-1 pr-1"
                >
                  {cards.map((contact) => (
                    <motion.div
                      key={contact.id}
                      data-board-card={contact.id}
                      data-contact-item={contact.id}
                      layout="position"
                      transition={boardSpring}
                      className={`rounded-xl transition-shadow hover:ring-2 hover:ring-primary/35 focus-within:ring-2 focus-within:ring-primary/60 ${drag?.id === contact.id ? "opacity-0" : ""} ${highlightId === contact.id ? "new-contact-flash" : ""}`}
                    >
                      <ContactCard
                        contact={
                          optimistic[contact.id]
                            ? { ...contact, status: optimistic[contact.id] }
                            : contact
                        }
                        data={data}
                        onOpen={() => onOpen(contact.id)}
                        onPointerDown={(e) => onPointerDown(e, contact)}
                        onPointerMove={onPointerMove}
                        onPointerUp={finishDrag}
                        onPointerCancel={finishDrag}
                        onClickCapture={(e) => {
                          if (suppressClickRef.current) {
                            e.preventDefault();
                            e.stopPropagation();
                            suppressClickRef.current = false;
                          }
                        }}
                      />
                    </motion.div>
                  ))}
                  <AnimatePresence>
                    {preview && (
                      <motion.div
                        key="drop-preview"
                        data-drop-preview={key}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={boardSpring}
                        aria-hidden
                        className="rounded-xl border border-border bg-muted p-3 shadow-sm"
                        style={{ minHeight: drag.height }}
                      >
                        <div className="h-3 w-3/4 rounded bg-border" />
                        <div className="mt-3 h-2 w-1/2 rounded bg-border/80" />
                        <div className="mt-5 h-2 w-2/3 rounded bg-border/80" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>
            );
          })}
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {drag && draggedContact && (
              <motion.div
                key={drag.gestureId}
                initial={{ rotate: 0, scale: 1, opacity: 0.95 }}
                animate={{
                  x: drag.phase === "settling" ? drag.destinationLeft - (drag.x - drag.offsetX) : 0,
                  y: drag.phase === "settling" ? drag.destinationTop - (drag.y - drag.offsetY) : 0,
                  rotate: drag.phase === "settling" ? 0 : 3,
                  scale: drag.phase === "settling" ? 1 : 1.035,
                  opacity: 1,
                }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={
                  drag.phase === "settling"
                    ? boardSpring
                    : {
                        x: { duration: 0 },
                        y: { duration: 0 },
                        rotate: boardSpring,
                        scale: boardSpring,
                      }
                }
                className="pointer-events-none fixed z-[100] shadow-xl"
                style={{
                  left: drag.x - drag.offsetX,
                  top: drag.y - drag.offsetY,
                  width: drag.width,
                }}
              >
                <ContactCardContent contact={draggedContact} data={data} />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </LayoutGroup>
  );
}
function ContactCard({
  contact: c,
  data,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClickCapture,
}: {
  contact: Contact;
  data: Data;
  onOpen: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="w-full cursor-grab touch-none rounded-xl text-left active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onOpen}
      onClickCapture={onClickCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <ContactCardContent contact={c} data={data} />
    </button>
  );
}
function ContactCardContent({ contact: c, data }: { contact: Contact; data: Data }) {
  const company = data.companies.find((x) => x.id === c.companyId);
  const assignee = data.members.find((member) => member.userId === c.assigneeId);
  return (
    <div className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-card transition hover:border-primary/30 hover:shadow-card-hover">
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2 text-sm font-semibold">
          <ContactStatusIcon status={c.status} />
          <span>{c.name}</span>
        </span>
        <span className="shrink-0" title={assignee?.name ?? "Uten ansvarlig"}>
          <Avatar
            name={assignee?.name ?? "Uten ansvarlig"}
            src={profileAvatarUrl(assignee?.avatarPath)}
            className="size-6"
          />
        </span>
      </span>
      <span className="block truncate text-xs text-muted-foreground">{company?.name}</span>
      {c.stikkord && (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/85">
          {c.stikkord.slice(0, 300)}
          {c.stikkord.length > 300 ? "…" : ""}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {data.contactPersonTags
          .filter((x) => x.contactId === c.id)
          .map((x) => {
            const tag = data.personTags.find((t) => t.id === x.tagId);
            return (
              tag && (
                <Badge key={x.tagId} variant="neutral">
                  {tag.name}
                </Badge>
              )
            );
          })}
      </div>
    </div>
  );
}
function CreateContact({
  data,
  initial,
  mutate,
  onCreated,
  busy,
}: {
  data: Data;
  initial: ReturnType<typeof parseContactPaste>;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onCreated: (id: string, openDetail: boolean) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [companyText, setCompanyText] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const nameSuggestion = remainingSuggestion(initial.suggestion, companyText);
  const companySuggestion = remainingSuggestion(initial.suggestion, name);
  const companies = data.companies
    .filter((c) =>
      c.name.toLocaleLowerCase("nb-NO").includes(companyText.toLocaleLowerCase("nb-NO")),
    )
    .slice(0, 8);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const openDetail = submitter instanceof HTMLButtonElement && submitter.value === "open";
    const row = await mutate<{ id: string }>("/contacts", {
      name,
      companyId: companyId || undefined,
      companyName: companyId ? undefined : companyText,
      email: email || null,
      phone: phone || null,
    });
    onCreated(row.id, openDetail);
  }
  return (
    <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
      <label className="block text-sm">
        Navn *<Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {nameSuggestion && !name && (
        <button
          type="button"
          className="rounded-lg bg-primary-soft px-2 py-1 text-xs text-primary"
          onClick={() => setName(nameSuggestion)}
        >
          Bruk «{nameSuggestion}» som navn
        </button>
      )}
      <label className="block text-sm">
        Organisasjon *
        <Input
          required
          value={companyText}
          onChange={(e) => {
            setCompanyText(e.target.value);
            setCompanyId("");
          }}
          placeholder="Søk eller opprett"
        />
      </label>
      {companySuggestion && !companyText && (
        <button
          type="button"
          className="rounded-lg bg-primary-soft px-2 py-1 text-xs text-primary"
          onClick={() => setCompanyText(companySuggestion)}
        >
          Bruk «{companySuggestion}» som organisasjon
        </button>
      )}
      {!!companyText && !companyId && (
        <div className="max-h-32 overflow-y-auto rounded-xl border bg-card p-1">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-muted"
              onClick={() => {
                setCompanyId(company.id);
                setCompanyText(company.name);
              }}
            >
              {company.name}
            </button>
          ))}
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Ingen treff? «{companyText}» opprettes når du lagrer.
          </p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          E-post
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="text-sm">
          Telefon
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="submit"
          name="createAction"
          value="stay"
          disabled={busy || !name.trim() || !companyText.trim()}
        >
          Legg til
        </Button>
        <Button
          type="submit"
          name="createAction"
          value="open"
          variant="outline"
          disabled={busy || !name.trim() || !companyText.trim()}
        >
          Legg til og åpne
        </Button>
      </div>
    </form>
  );
}
function InlineText({
  value,
  onSave,
  className = "",
  disabled = false,
  ariaLabel,
}: {
  value: string | null;
  onSave: (next: string, expected: string | null) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const base = useRef(value);
  useEffect(() => {
    if (!focused) setDraft(value ?? "");
  }, [value, focused]);
  return (
    <Input
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`border-transparent bg-transparent hover:bg-card focus:bg-card ${className}`}
      onFocus={() => {
        base.current = value;
        setFocused(true);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(e) => {
        setFocused(false);
        if (!disabled && e.target.value !== (base.current ?? ""))
          onSave(e.target.value, base.current);
      }}
    />
  );
}
const detailFieldClass =
  "h-8 min-w-0 border-transparent bg-transparent px-1 shadow-none hover:border-transparent hover:bg-muted/40 focus:border-transparent focus:bg-muted/40 focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 data-[popup-open]:border-transparent data-[popup-open]:ring-0";
function ContactDetailField({
  icon: Icon,
  label,
  children,
  compact = false,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`grid min-h-12 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 transition-colors hover:border-primary/25 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30 ${compact ? "grid-cols-[16px_64px_minmax(0,1fr)]" : "grid-cols-[18px_104px_minmax(0,1fr)]"} ${className}`}
    >
      <Icon size={compact ? 15 : 16} className="text-muted-foreground" aria-hidden />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}
function ContactList({
  rows,
  data,
  mutate,
  onOpen,
  lastActivity,
  highlightId,
}: {
  rows: Contact[];
  data: Data;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onOpen: (id: string) => void;
  lastActivity: (id: string, includeMissed?: boolean) => Activity | undefined;
  highlightId: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const assignees = assigneeOptions(data.members);
  const tagNames = new Map(data.personTags.map((tag) => [tag.id, tag.name]));
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-[28%] px-4 py-3 font-medium">Kontakt</th>
            <th className="w-48 px-3 py-3 font-medium">Ansvarlig</th>
            <th className="w-52 px-3 py-3 font-medium">Status</th>
            <th className="w-[27%] px-3 py-3 font-medium">Stikkord / siste samtale</th>
            <th className="w-44 px-3 py-3 font-medium">Tagger</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const summary = c.stikkord || lastActivity(c.id)?.summary || "";
            const tags = data.contactPersonTags
              .filter((link) => link.contactId === c.id)
              .flatMap((link) => {
                const name = tagNames.get(link.tagId);
                return name ? [{ id: link.tagId, name }] : [];
              });
            return (
              <tr
                key={c.id}
                data-contact-item={c.id}
                className={`border-b border-border/70 align-top last:border-b-0 hover:bg-primary/5 focus-within:bg-primary/8 ${highlightId === c.id ? "new-contact-flash" : ""}`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    aria-label={`Åpne kontakt: ${c.name}`}
                    className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => onOpen(c.id)}
                  >
                    <span className="block font-medium text-foreground">{c.name}</span>
                    {c.description && (
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {c.description}
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={c.assigneeId ?? ""}
                    aria-label={`Ansvarlig for ${c.name}`}
                    onValueChange={(assigneeId) =>
                      void mutate(`/contacts/${c.id}`, { assigneeId: assigneeId || null })
                    }
                    items={assignees}
                    disabled={c.status === "duplicate"}
                  />
                </td>
                <td className="px-3 py-3">
                  {c.status === "duplicate" ? (
                    <ContactStatusBadge status="duplicate" />
                  ) : (
                    <Select
                      value={c.status}
                      aria-label={`Status for ${c.name}`}
                      onValueChange={(status) => void mutate(`/contacts/${c.id}`, { status })}
                      items={statusOptions}
                    />
                  )}
                </td>
                <td className="px-3 py-3">
                  {summary ? (
                    <button
                      type="button"
                      aria-expanded={expanded === c.id}
                      className={`w-full rounded-lg text-left leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${expanded === c.id ? "" : "line-clamp-2"}`}
                      onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    >
                      {summary}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Ingen samtale registrert</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {tags.length ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Tagger for ${c.name}`}>
                      {tags.map((tag) => (
                        <li key={tag.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {tag.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">Ingen</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">Ingen kontakter her ennå.</p>
      )}
    </div>
  );
}
function ConversationParticipantsPicker({
  people,
  selectedIds,
  onChange,
}: {
  people: Contact[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("nb-NO");
  const shown = people.filter((person) =>
    `${person.name} ${person.description ?? ""} ${person.email ?? ""}`
      .toLocaleLowerCase("nb-NO")
      .includes(term),
  );
  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setSearch("");
        }}
      >
        <PopoverTrigger
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm transition-colors hover:border-primary/25 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Er andre med i samtalen?"
        >
          <Users size={16} className="text-muted-foreground" />
          Er andre med i samtalen?
          {selectedIds.length > 0 && (
            <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-xs text-primary">
              {selectedIds.length}
            </span>
          )}
          <ChevronDown size={14} className="text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2">
          <p className="px-1 pb-2 text-xs text-muted-foreground">Personer i samme organisasjon</p>
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="Søk etter person …"
            aria-label="Søk etter andre deltakere"
          />
          <div className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">
            {shown.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={selectedIds.includes(person.id)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked
                        ? [...selectedIds, person.id]
                        : selectedIds.filter((id) => id !== person.id),
                    )
                  }
                  aria-label={person.name}
                />
                <span className="min-w-0">
                  <span className="block truncate">{person.name}</span>
                  {person.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {people.length === 0 ? "Ingen andre kontakter i organisasjonen." : "Ingen treff."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const person = people.find((candidate) => candidate.id === id);
            return person ? (
              <button
                key={id}
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-1 text-xs text-primary hover:bg-primary-soft/70"
                aria-label={`Fjern ${person.name} fra samtalen`}
                onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== id))}
              >
                {person.name}
                <X size={12} />
              </button>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
function CallTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return (
    <p className="text-xs text-primary">
      Pågår · {String(Math.floor(seconds / 60)).padStart(2, "0")}:
      {String(seconds % 60).padStart(2, "0")}
    </p>
  );
}
function ActivityComposer({
  contact,
  related,
  assigneeName,
  mutate,
  busy,
  notificationPermission,
  onEnableNotifications,
  shortcutRequest,
}: {
  contact: Contact;
  related: Contact[];
  assigneeName?: string;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  onEnableNotifications: () => void;
  shortcutRequest?: number;
}) {
  const { user } = useOrg();
  const [mode, setMode] = useState<"phone" | "meeting" | null>(null);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [startedAt, setStartedAt] = useState("");
  const [outcome, setOutcome] = useState<MissedOutcome | null>(null);
  const [summary, setSummary] = useState("");
  const [transcript, setTranscript] = useState("");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [nextStatus, setNextStatus] = useState<Status | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderAt, setReminderAt] = useState(nextReminderTime);
  const [reminderMessage, setReminderMessage] = useState("");
  const [phoneCopyMessage, setPhoneCopyMessage] = useState("");
  const [fileError, setFileError] = useState("");

  function start(nextMode: "phone" | "meeting") {
    setMode(nextMode);
    setStartedAt(new Date().toISOString());
    setOutcome(null);
    setSummary("");
    setTranscript("");
    setExtraIds([]);
    setNextStatus(null);
    setReminderEnabled(false);
    setReminderAt(nextReminderTime());
    setReminderMessage("");
    setPhoneCopyMessage("");
    setFileError("");
  }
  useEffect(() => {
    if (shortcutRequest) start("phone");
  }, [shortcutRequest]);
  useEffect(() => {
    if (!shortcutRequest || mode !== "phone") return;
    const timer = window.setTimeout(() => {
      const composer = document.querySelector<HTMLElement>("[data-call-composer]");
      composer?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
      composer?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [shortcutRequest, mode]);
  async function importTranscript(file: File | undefined) {
    if (!file) return;
    if (!/\.(txt|md|srt|vtt)$/i.test(file.name)) {
      setFileError("Velg en tekstfil (TXT, MD, SRT eller VTT).");
      return;
    }
    const content = await file.text();
    if (content.length + transcript.length > 200_000) {
      setFileError("Transkripsjonen kan ikke være lengre enn 200 000 tegn.");
      return;
    }
    setTranscript((current) => (current ? `${current}\n\n${content}` : content));
    setFileError("");
  }
  async function saveActivity(status?: Status) {
    if (!mode) return;
    try {
      await mutate("/activities", {
        contactIds: [contact.id, ...(outcome ? [] : extraIds)],
        kind: outcome ? "missed_phone" : mode,
        summary: summary.trim(),
        transcript: outcome ? "" : transcript.trim(),
        missedOutcome: outcome ?? undefined,
        occurredAt: startedAt,
        nextStatus: status,
        reminder:
          outcome && reminderEnabled
            ? { dueAt: reminderAt, message: reminderMessage.trim() }
            : undefined,
      });
      setMode(null);
      if (contact.assigneeId && contact.assigneeId !== user?.id) {
        setTakeoverOpen(true);
      }
    } catch {
      // The page-level mutation displays the error and keeps this draft for retry.
    }
  }

  const completed = mode === "meeting" || !outcome;
  const statusChoices: { value: Status; title: string; explanation: string }[] = [
    {
      value: "ikke_kontakt_igjen",
      title: "Ikke kontakt igjen",
      explanation: "Personen ønsker ikke å bli kontaktet på nytt",
    },
    {
      value: "avsluttet",
      title: "Avsluttet",
      explanation: "Vi har fått det vi trenger, og trenger ikke ringe på nytt",
    },
    {
      value: "kan_kontaktes_igjen",
      title: "Kan kontaktes igjen",
      explanation: "Relevant for videre kontakt, for eksempel som potensiell kunde",
    },
  ];
  const chosenStatus = statusChoices.find((choice) => choice.value === nextStatus);
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {!mode ? (
          <motion.div
            key="activity-start"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-4 flex flex-wrap gap-2"
          >
            <Button onClick={() => start("phone")}>
              <PhoneCall size={16} /> Start telefonsamtale
            </Button>
            <Button variant="outline" onClick={() => start("meeting")}>
              <Users size={16} /> Registrer møte
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="activity-composer"
            data-call-composer={mode === "phone" ? "" : undefined}
            layout="size"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ layout: { type: "spring", stiffness: 280, damping: 34 } }}
            className="mt-4 space-y-4 rounded-xl bg-muted/50 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {mode === "phone" ? <PhoneCall size={16} /> : <Users size={16} />}
                  {mode === "phone" ? "Telefonsamtale startet" : "Nytt møte"}
                </p>
                <p className="text-xs text-muted-foreground">Startet {dateTimeLabel(startedAt)}</p>
                {mode === "phone" && !outcome && <CallTimer startedAt={startedAt} />}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
                Avbryt
              </Button>
            </div>
            {mode === "phone" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Telefonnummer</p>
                  <p className="break-all text-xl font-semibold tabular-nums">
                    {contact.phone?.trim() || "Telefonnummer mangler"}
                  </p>
                  {phoneCopyMessage && (
                    <p role="status" className="mt-1 text-xs text-muted-foreground">
                      {phoneCopyMessage}
                    </p>
                  )}
                </div>
                {contact.phone?.trim() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void copyText(contact.phone!.trim()).then(
                        () => setPhoneCopyMessage("Nummer kopiert"),
                        () => setPhoneCopyMessage("Kunne ikke kopiere nummeret"),
                      )
                    }
                  >
                    <Copy size={15} /> Kopier nummer
                  </Button>
                )}
              </div>
            )}
            {mode === "phone" && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Fikk du ikke snakket med personen?
                </p>
                <div className="flex flex-wrap gap-2">
                  {outcome && (
                    <Button variant="outline" size="sm" onClick={() => setOutcome(null)}>
                      Samtale gjennomført
                    </Button>
                  )}
                  {(Object.entries(missedOutcomeLabels) as [MissedOutcome, string][]).map(
                    ([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={outcome === value}
                        className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${outcome === value ? "border-primary bg-primary-soft font-medium text-primary" : "border-border bg-card hover:border-primary/30"}`}
                        onClick={() => {
                          setOutcome(value);
                          setReminderEnabled(false);
                        }}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            <label className="block text-sm font-medium">
              {completed ? "Notater og sammendrag" : "Notat (valgfritt)"}
              <Textarea
                className="mt-2 min-h-32 bg-card"
                placeholder={
                  completed
                    ? "Skriv notater under samtalen eller oppsummer det viktigste …"
                    : "Hva skjedde?"
                }
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={20_000}
              />
            </label>
            <AnimatePresence mode="wait" initial={false}>
              {completed ? (
                <motion.div
                  key="conversation-fields"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-sm font-medium" htmlFor="activity-transcript">
                        Transkripsjon (valgfritt)
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:border-primary/30">
                        <Upload size={14} /> Last opp tekstfil
                        <input
                          type="file"
                          accept=".txt,.md,.srt,.vtt,text/plain,text/markdown"
                          className="sr-only"
                          onChange={(event) => {
                            void importTranscript(event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <Textarea
                      id="activity-transcript"
                      className="mt-2 min-h-28 bg-card"
                      placeholder="Lim inn transkripsjon, eller last opp TXT, MD, SRT eller VTT …"
                      value={transcript}
                      onChange={(event) => setTranscript(event.target.value)}
                      maxLength={200_000}
                    />
                    {fileError && (
                      <p role="alert" className="mt-1 text-xs text-risk">
                        {fileError}
                      </p>
                    )}
                  </div>
                  <ConversationParticipantsPicker
                    people={related}
                    selectedIds={extraIds}
                    onChange={setExtraIds}
                  />
                  <div>
                    <p className="mb-2 text-sm font-medium">
                      Hva skal statusen være etter samtalen?
                    </p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {statusChoices.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          aria-pressed={nextStatus === choice.value}
                          className={`rounded-xl border p-3 text-left transition-colors ${nextStatus === choice.value ? "border-primary bg-primary-soft" : "border-border bg-card hover:border-primary/30"}`}
                          onClick={() => setNextStatus(choice.value)}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <ContactStatusIcon status={choice.value} size={16} /> {choice.title}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {choice.explanation}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="missed-call-fields"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <p className="text-sm font-medium">Vil du bli påminnet om å prøve igjen?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant={reminderEnabled ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setReminderEnabled((enabled) => !enabled)}
                      aria-pressed={reminderEnabled}
                    >
                      {reminderEnabled ? "Fjern påminnelse" : "Legg til påminnelse"}
                    </Button>
                  </div>
                  <AnimatePresence initial={false}>
                    {reminderEnabled && (
                      <motion.div
                        key="reminder-fields"
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: "auto", y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -6 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 pt-3">
                          <ReminderTimeField value={reminderAt} onChange={setReminderAt} />
                          <Input
                            value={reminderMessage}
                            onChange={(event) => setReminderMessage(event.target.value)}
                            maxLength={2000}
                            placeholder="Ring opp igjen (valgfritt)"
                            aria-label="Påminnelsesmelding"
                          />
                          <BrowserNotificationPrompt
                            permission={notificationPermission}
                            onEnable={onEnableNotifications}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="grid gap-2 border-t border-border pt-3 md:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-primary bg-primary-soft p-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-soft/70 disabled:opacity-50"
                onClick={() =>
                  void saveActivity(completed ? (nextStatus ?? undefined) : "follow_up")
                }
              >
                <span className="flex items-center gap-2">
                  {chosenStatus && <ContactStatusIcon status={chosenStatus.value} size={16} />}
                  {completed
                    ? chosenStatus
                      ? `Legg til aktivitet og flytt til ${chosenStatus.title}`
                      : "Legg til aktivitet"
                    : "Flytt til Follow up / Ring igjen og legg til aktivitet"}
                </span>
              </button>
              {(outcome || nextStatus) && (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-border bg-card p-3 text-left text-sm font-medium transition-colors hover:border-primary/30 disabled:opacity-50"
                  onClick={() => void saveActivity()}
                >
                  Legg til aktivitet uten statusendring
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog open={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <DialogContent>
          <DialogTitle>Ta over som ansvarlig?</DialogTitle>
          <DialogDescription>
            Aktiviteten er lagt til. {assigneeName || "En annen person"} er ansvarlig for å følge
            opp denne kontakten. Vil du ta over ansvaret?
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setTakeoverOpen(false)}>
              Behold ansvarlig
            </Button>
            <Button
              disabled={busy || !user?.id}
              onClick={async () => {
                if (!user?.id) return;
                try {
                  await mutate(`/contacts/${contact.id}`, { assigneeId: user.id });
                  setTakeoverOpen(false);
                } catch {
                  // The page-level mutation displays the error; keep the prompt open.
                }
              }}
            >
              Ta over
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function ContactReminderCard({
  contactId,
  reminders,
  mutate,
  busy,
  notificationPermission,
  onEnableNotifications,
}: {
  contactId: string;
  reminders: Reminder[];
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  onEnableNotifications: () => void;
}) {
  const [dueAt, setDueAt] = useState(nextReminderTime);
  const [message, setMessage] = useState("");
  async function createReminder() {
    try {
      await mutate("/reminders", { contactId, dueAt, message: message.trim() });
      setDueAt(nextReminderTime());
      setMessage("");
    } catch {
      // The page-level mutation displays the error and keeps the entered reminder.
    }
  }
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Legg til påminnelse</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Blir sendt til innboksen. Kun du ser denne påminnelsen.
      </p>
      <div className="mt-3 space-y-2">
        <ReminderTimeField value={dueAt} onChange={setDueAt} />
        <Input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2000}
          placeholder="Ring opp igjen (valgfritt)"
          aria-label="Påminnelsesmelding"
        />
        <Button size="sm" disabled={busy} onClick={() => void createReminder()}>
          Legg til påminnelse
        </Button>
        <BrowserNotificationPrompt
          permission={notificationPermission}
          onEnable={onEnableNotifications}
        />
      </div>
      {reminders.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Dine påminnelser</p>
          {reminders.map((reminder) => (
            <p key={reminder.id} className="mt-1 text-xs">
              {dateTimeLabel(reminder.dueAt)}
              {reminder.message ? ` · ${reminder.message}` : ""}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
function ContactOrganizationPicker({
  contact,
  companies,
  mutate,
  disabled,
}: {
  contact: Contact;
  companies: Company[];
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const current = companies.find((company) => company.id === contact.companyId);
  const query = search.trim().toLocaleLowerCase("nb-NO");
  const matches = companies.filter((company) =>
    company.name.toLocaleLowerCase("nb-NO").includes(query),
  );
  const existing = companies.find(
    (company) => company.name.trim().toLocaleLowerCase("nb-NO") === query,
  );
  async function select(companyId: string) {
    if (companyId === contact.companyId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await mutate(`/contacts/${contact.id}`, { companyId });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke velge organisasjon.");
    } finally {
      setSaving(false);
    }
  }
  async function create() {
    if (!search.trim()) return;
    setSaving(true);
    setError("");
    try {
      const company = await mutate<{ id: string }>("/companies", { name: search.trim() });
      await mutate(`/contacts/${contact.id}`, { companyId: company.id });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke opprette organisasjonen.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSearch("");
          setError("");
        }
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={`${detailFieldClass} flex w-full items-center justify-between rounded-lg text-left text-sm`}
        aria-label="Organisasjon"
      >
        <span className="truncate">{current?.name ?? "Velg organisasjon"}</span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <Input
          autoFocus
          role="combobox"
          aria-label="Søk eller opprett organisasjon"
          aria-expanded={open}
          aria-controls="contact-organization-options"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (existing) void select(existing.id);
            else if (search.trim()) void create();
          }}
        />
        <div
          id="contact-organization-options"
          role="listbox"
          className="mt-2 max-h-56 overflow-y-auto"
        >
          {matches.map((company) => (
            <button
              key={company.id}
              type="button"
              role="option"
              aria-selected={company.id === contact.companyId}
              disabled={saving}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => void select(company.id)}
            >
              {company.name}
            </button>
          ))}
        </div>
        {search.trim() && !existing && (
          <Button
            className="mt-2 w-full"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void create()}
          >
            <Plus size={14} /> Opprett «{search.trim()}»
          </Button>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-risk">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ContactDetail({
  contact: c,
  missing,
  data,
  favorite,
  mutate,
  onBack,
  onOpen,
  onDelete,
  composerShortcut,
  busy,
  focusedActivityId,
  focusedPassage,
  focusedQuery,
  notificationPermission,
  onEnableNotifications,
}: {
  contact: Contact | null;
  missing: boolean;
  data: Data;
  favorite: boolean;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onBack: () => void;
  onOpen: (id: string) => void;
  onDelete: (contact: Contact) => void;
  composerShortcut: { contactId: string; kind: "phone" | "email"; nonce: number } | null;
  busy: boolean;
  focusedActivityId: string | null;
  focusedPassage: string | null;
  focusedQuery: string | null;
  notificationPermission: NotificationPermission | "unsupported";
  onEnableNotifications: () => void;
}) {
  const state = useOrg();
  const { peers } = useTeamRealtime();
  const contactQueryClient = useQueryClient();
  const [compare, setCompare] = useState<string | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<{ activityId: string; quote: string } | null>(
    null,
  );
  const duplicates = useQuery({
    queryKey: ["duplicates", state.org?.id, c?.id, c?.updatedAt],
    queryFn: () => request<Contact[]>(`/org/contacts/${c!.id}/duplicates`, state.org!.id),
    enabled: !!c && c.status !== "duplicate" && !!state.org,
    refetchInterval: 60_000,
  });
  const library = useQuery({
    queryKey: ["library", state.org?.id],
    queryFn: () => request<LibraryItem[]>("/org/library", state.org!.id),
    enabled: !!state.org,
    refetchInterval: 60_000,
  });
  const contactId = c?.id;
  useEffect(() => {
    if (!focusedActivityId || !contactId) return;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(
        focusedActivityId === "note"
          ? "[data-note-source]"
          : focusedActivityId === "additional_info"
            ? "[data-additional-info]"
            : `[data-activity-id="${focusedActivityId}"]`,
      );
      (target?.querySelector<HTMLElement>("[data-search-match]") ?? target)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [focusedActivityId, focusedPassage, focusedQuery, contactId]);
  if (!c)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">
          {missing ? "Kontakten finnes ikke i dette teamet" : "Laster kontakt …"}
        </h1>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Tilbake
        </Button>
      </div>
    );
  const company = data.companies.find((x) => x.id === c.companyId);
  const personTagIds = data.contactPersonTags
    .filter((tag) => tag.contactId === c.id)
    .map((tag) => tag.tagId);
  const domainIds = data.companyDomains
    .filter((link) => link.companyId === c.companyId)
    .map((link) => link.domainId);
  const aiField = (
    field:
      | "email"
      | "phone"
      | "description"
      | "companyId"
      | "personTagIds"
      | "domainIds"
      | "stikkord",
    currentValue: string | string[] | null,
  ) =>
    c.status === "duplicate" ? null : (
      <ContactAiFieldSuggestions
        contactId={c.id}
        field={field}
        currentValue={currentValue}
        companies={data.companies}
        domains={data.domains}
        tags={data.personTags}
      />
    );
  const timeline = data.activities
    .filter((a) => data.activityContacts.some((x) => x.activityId === a.id && x.contactId === c.id))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const related = data.contacts.filter(
    (x) =>
      !!c.companyId && x.id !== c.id && x.companyId === c.companyId && x.status !== "duplicate",
  );
  const timelineIds = new Set(timeline.map((activity) => activity.id));
  const contactLibrary = (library.data ?? []).filter(
    (item) => item.contactId === c.id || (!!item.activityId && timelineIds.has(item.activityId)),
  );
  const viewingPeers = peers.filter(
    (peer, index, rows) =>
      peer.contactId === c.id &&
      peer.userId !== state.user?.id &&
      rows.findIndex((item) => item.userId === peer.userId && item.contactId === c.id) === index,
  );
  const affectedContactNames = deletingActivity
    ? data.activityContacts
        .filter((link) => link.activityId === deletingActivity.id)
        .map((link) => data.contacts.find((contact) => contact.id === link.contactId)?.name)
        .filter((name): name is string => !!name)
    : [];
  const captureActivityQuote = (element: HTMLElement, activityId: string) => {
    const selection = window.getSelection();
    const quote = selection?.toString().trim() ?? "";
    if (
      !quote ||
      !element.contains(selection?.anchorNode ?? null) ||
      !element.contains(selection?.focusNode ?? null)
    ) {
      setSelectedQuote(null);
      return;
    }
    setSelectedQuote({ activityId, quote });
  };
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Tilbake
      </Button>
      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {!focusedActivityId && focusedPassage && (
            <p className="rounded-xl bg-primary/10 p-3 text-sm">
              <mark className="bg-primary/20">Søketreff: {focusedPassage}</mark>
            </p>
          )}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">
                  {c.name}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    #{c.contactNumber}
                  </span>
                </h1>
                <p className="text-muted-foreground">{company?.name}</p>
              </div>
              {c.status !== "duplicate" && (
                <div data-contact-detail-actions className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={favorite ? "Fjern fra favoritter" : "Legg til i favoritter"}
                    aria-pressed={favorite}
                    onClick={() =>
                      void mutate(`/contacts/${c.id}/favorite`, { favorite: !favorite })
                    }
                  >
                    <Star size={16} className={favorite ? "fill-current text-primary" : ""} />
                    {favorite ? "Favoritt" : "Legg til favoritter"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDelete(c)}
                  >
                    <Trash2 size={16} /> Slett kontakt
                  </Button>
                </div>
              )}
            </div>
            {viewingPeers.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Users size={14} aria-hidden />
                {viewingPeers.map((peer) => {
                  const member = data.members.find((item) => item.userId === peer.userId);
                  const name = member?.name ?? "Teammedlem";
                  return (
                    <span
                      key={peer.userId}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1"
                    >
                      <Avatar
                        name={name}
                        src={profileAvatarUrl(member?.avatarPath)}
                        className="size-5"
                      />
                      {name}
                      {peer.editingId ? " redigerer" : " ser på"}
                    </span>
                  );
                })}
              </div>
            )}
            {c.status === "duplicate" && (
              <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
                Dette er et arkivert duplikat.{" "}
                <button
                  className="text-primary underline"
                  onClick={() => c.duplicateOfId && onOpen(c.duplicateOfId)}
                >
                  Åpne hovedkontakt
                </button>
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ContactDetailField icon={UserRound} label="Navn">
                <InlineText
                  value={c.name}
                  className={detailFieldClass}
                  disabled={c.status === "duplicate"}
                  ariaLabel="Navn"
                  onSave={(name, old) =>
                    void mutate(`/contacts/${c.id}`, { name, expected: { name: old } })
                  }
                />
              </ContactDetailField>
              <ContactDetailField icon={Building2} label="Organisasjon">
                <div>
                  <ContactOrganizationPicker
                    contact={c}
                    companies={data.companies}
                    mutate={mutate}
                    disabled={c.status === "duplicate"}
                  />
                  {aiField("companyId", c.companyId)}
                </div>
              </ContactDetailField>
              <ContactDetailField icon={Mail} label="E-post">
                <div>
                  <InlineText
                    value={c.email}
                    className={detailFieldClass}
                    disabled={c.status === "duplicate"}
                    ariaLabel="E-post"
                    onSave={(email, old) =>
                      void mutate(`/contacts/${c.id}`, { email, expected: { email: old } })
                    }
                  />
                  {aiField("email", c.email)}
                </div>
              </ContactDetailField>
              <ContactDetailField icon={Phone} label="Telefon">
                <div>
                  <InlineText
                    value={c.phone}
                    className={detailFieldClass}
                    disabled={c.status === "duplicate"}
                    ariaLabel="Telefon"
                    onSave={(phone, old) =>
                      void mutate(`/contacts/${c.id}`, { phone, expected: { phone: old } })
                    }
                  />
                  {aiField("phone", c.phone)}
                </div>
              </ContactDetailField>
              <ContactDetailField
                icon={AlignLeft}
                label="Kort beskrivelse"
                className="sm:col-span-2"
              >
                <div>
                  <InlineText
                    value={c.description}
                    className={detailFieldClass}
                    disabled={c.status === "duplicate"}
                    ariaLabel="Kort beskrivelse"
                    onSave={(description, old) =>
                      void mutate(`/contacts/${c.id}`, {
                        description,
                        expected: { description: old },
                      })
                    }
                  />
                  {aiField("description", c.description)}
                </div>
              </ContactDetailField>
              <ContactDetailField icon={Tags} label="Persontagger" className="sm:col-span-2">
                <div className="flex flex-wrap gap-2 py-1">
                  {data.personTags.map((tag) => {
                    const selected = data.contactPersonTags.some(
                      (x) => x.contactId === c.id && x.tagId === tag.id,
                    );
                    return (
                      <button
                        key={tag.id}
                        disabled={c.status === "duplicate"}
                        aria-pressed={selected}
                        aria-label={`${selected ? "Fjern" : "Legg til"} ${tag.name}`}
                        title={
                          tag.description
                            ? `${tag.name}: ${tag.description}`
                            : `${tag.name}: ingen beskrivelse`
                        }
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 ${selected ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover" : "border-border bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
                        onClick={() =>
                          void mutate(`/contacts/${c.id}/tags`, {
                            tagIds: selected
                              ? data.contactPersonTags
                                  .filter((x) => x.contactId === c.id && x.tagId !== tag.id)
                                  .map((x) => x.tagId)
                              : [
                                  ...data.contactPersonTags
                                    .filter((x) => x.contactId === c.id)
                                    .map((x) => x.tagId),
                                  tag.id,
                                ],
                          })
                        }
                      >
                        {selected && <X size={11} strokeWidth={2.5} aria-hidden />}
                        {tag.name}
                      </button>
                    );
                  })}
                  {c.status !== "duplicate" && (
                    <PersonTagEditor
                      contactId={c.id}
                      tags={data.personTags}
                      selectedIds={data.contactPersonTags
                        .filter((tag) => tag.contactId === c.id)
                        .map((tag) => tag.tagId)}
                      mutate={mutate}
                      busy={busy}
                    />
                  )}
                </div>
                {aiField("personTagIds", personTagIds)}
              </ContactDetailField>
              <ContactDetailField icon={TagIcon} label="Domener" className="sm:col-span-2">
                <div className="flex flex-wrap gap-1.5 py-1">
                  {domainIds.map((id) => {
                    const domain = data.domains.find((item) => item.id === id);
                    return domain ? (
                      <Badge key={id} variant="neutral">
                        {domain.name}
                      </Badge>
                    ) : null;
                  })}
                  {!domainIds.length && (
                    <span className="text-xs text-muted-foreground">Ingen domener</span>
                  )}
                </div>
                {aiField("domainIds", domainIds)}
              </ContactDetailField>
            </div>
          </Card>
          <SharedNote
            key={c.id}
            contact={c}
            mutate={mutate}
            focused={focusedActivityId === "note"}
            focusedPassage={focusedActivityId === "note" ? focusedPassage : null}
            focusedQuery={focusedQuery}
          />
          <AdditionalInformation
            contactId={c.id}
            entries={data.additionalInfo.filter((entry) => entry.contactId === c.id)}
            contacts={data.contacts}
            onOpen={onOpen}
            mutate={mutate}
            busy={busy}
            disabled={c.status === "duplicate"}
            focusedPassage={focusedActivityId === "additional_info" ? focusedPassage : null}
          />
          <StikkordEditor
            contact={c}
            mutate={mutate}
            busy={busy}
            suggestions={aiField("stikkord", c.stikkord)}
          />
          {c.status !== "duplicate" && (
            <ContactAiPanel
              contact={c}
              companies={data.companies}
              domains={data.domains}
              tags={data.personTags}
            />
          )}
          {c.status !== "duplicate" && (
            <EmailComposer
              contact={c}
              shortcutRequest={
                composerShortcut?.kind === "email" ? composerShortcut.nonce : undefined
              }
              onActivity={() =>
                contactQueryClient.invalidateQueries({ queryKey: ["contact-data", state.org?.id] })
              }
            />
          )}
          <Card className="p-5">
            <h2 className="font-semibold">Aktivitet</h2>
            {c.status !== "duplicate" && (
              <ActivityComposer
                contact={c}
                shortcutRequest={
                  composerShortcut?.kind === "phone" ? composerShortcut.nonce : undefined
                }
                related={related}
                assigneeName={
                  data.members.find((member) => member.userId === c.assigneeId)?.name ?? undefined
                }
                mutate={mutate}
                busy={busy}
                notificationPermission={notificationPermission}
                onEnableNotifications={onEnableNotifications}
              />
            )}
            <div className="mt-4 space-y-3">
              {timeline.map((a) => {
                const editing = editingActivityId === a.id;
                const longActivity =
                  a.summary.length + a.transcript.length > 600 ||
                  `${a.summary}\n${a.transcript}`.split("\n").length > 12;
                const expanded =
                  editing || focusedActivityId === a.id || expandedActivityIds.includes(a.id);
                const presentation = activityPresentation(a);
                const ActivityIcon = presentation.icon;
                return (
                  <div
                    key={a.id}
                    data-activity-id={a.id}
                    className={`rounded-xl border border-l-[3px] border-border bg-card p-4 shadow-sm ${presentation.borderClass} ${focusedActivityId === a.id ? "activity-focus-flash" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3
                        className={`flex items-center gap-2.5 text-lg font-semibold tracking-tight sm:text-xl ${presentation.titleClass}`}
                      >
                        <span
                          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${presentation.badgeClass}`}
                        >
                          <ActivityIcon size={19} strokeWidth={2.2} aria-hidden />
                        </span>
                        {presentation.label}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {editing ? (
                          <DateTimePicker
                            key={`${a.id}:${a.occurredAt}`}
                            value={a.occurredAt}
                            disabled={c.status === "duplicate"}
                            onChange={(occurredAt) => mutate(`/activities/${a.id}`, { occurredAt })}
                          />
                        ) : (
                          <span className="mr-1 inline-flex items-center gap-1.5 whitespace-nowrap">
                            <CalendarDays size={14} aria-hidden /> {dateTimeLabel(a.occurredAt)}
                          </span>
                        )}
                        {c.status !== "duplicate" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-primary"
                            aria-label={
                              editing ? "Lukk redigering av aktivitet" : "Rediger aktivitet"
                            }
                            title={editing ? "Ferdig" : "Rediger aktivitet"}
                            aria-pressed={editing}
                            onClick={() => setEditingActivityId(editing ? null : a.id)}
                          >
                            {editing ? <Check size={17} /> : <Pencil size={17} />}
                          </Button>
                        )}
                        {editing && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-risk"
                            aria-label="Slett aktivitet"
                            title="Slett aktivitet"
                            disabled={busy}
                            onClick={() => setDeletingActivity(a)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </div>
                    {a.kind === "email" &&
                      (() => {
                        const email = data.emailActivities.find((row) => row.activityId === a.id);
                        return email ? (
                          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                            <HighlightedText
                              text={`Fra: ${email.fromEmail} · Til: ${email.toEmails.join(", ")}${email.ccEmails.length ? ` · Kopi: ${email.ccEmails.join(", ")}` : ""}\nEmne: ${email.subject || "Uten emne"}`}
                              passage={focusedActivityId === a.id ? focusedPassage : null}
                              query={focusedActivityId === a.id ? focusedQuery : null}
                            />
                          </p>
                        ) : null;
                      })()}
                    {longActivity && !expanded && (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                        {[a.summary, a.transcript]
                          .filter(Boolean)
                          .join("\n\n")
                          .slice(0, 220)
                          .trimEnd()}
                        …
                      </p>
                    )}
                    {longActivity && !editing && focusedActivityId !== a.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        aria-expanded={expanded}
                        aria-controls={`activity-content-${a.id}`}
                        onClick={() =>
                          setExpandedActivityIds((current) =>
                            expanded ? current.filter((id) => id !== a.id) : [...current, a.id],
                          )
                        }
                      >
                        <ChevronDown size={15} className={expanded ? "rotate-180" : ""} />
                        {expanded ? "Vis mindre" : "Vis hele aktiviteten"}
                      </Button>
                    )}
                    <div id={`activity-content-${a.id}`} hidden={longActivity && !expanded}>
                      <div
                        onMouseUp={(event) =>
                          !editing && captureActivityQuote(event.currentTarget, a.id)
                        }
                        onTouchEnd={(event) =>
                          !editing && captureActivityQuote(event.currentTarget, a.id)
                        }
                      >
                        <LiveText
                          kind="summary"
                          id={a.id}
                          initialText={a.summary}
                          highlightPassage={focusedActivityId === a.id ? focusedPassage : null}
                          highlightQuery={focusedActivityId === a.id ? focusedQuery : null}
                          disabled={c.status === "duplicate"}
                          readOnly={!editing}
                          className={
                            editing
                              ? "mt-3 min-h-20"
                              : "mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground"
                          }
                          onSelect={(event) => {
                            const field = event.currentTarget;
                            const quote = field.value
                              .slice(field.selectionStart, field.selectionEnd)
                              .trim();
                            setSelectedQuote(quote ? { activityId: a.id, quote } : null);
                          }}
                        />
                      </div>
                      {selectedQuote?.activityId === a.id && (
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await mutate("/library", {
                                sourceKind: "activity",
                                contactId: c.id,
                                activityId: a.id,
                                quote: selectedQuote.quote,
                              });
                              setSelectedQuote(null);
                            } catch {
                              // The page-level mutation displays the error.
                            }
                          }}
                        >
                          <BookOpen size={14} /> Legg til i sitater
                        </Button>
                      )}
                      {a.kind !== "missed_phone" && (editing || !!a.transcript) && (
                        <section className="mt-3">
                          <h4 className="text-sm font-medium">Transkripsjon</h4>
                          <div
                            onMouseUp={(event) =>
                              !editing && captureActivityQuote(event.currentTarget, a.id)
                            }
                            onTouchEnd={(event) =>
                              !editing && captureActivityQuote(event.currentTarget, a.id)
                            }
                          >
                            <LiveText
                              kind="transcript"
                              id={a.id}
                              initialText={a.transcript}
                              highlightPassage={focusedActivityId === a.id ? focusedPassage : null}
                              highlightQuery={focusedActivityId === a.id ? focusedQuery : null}
                              disabled={c.status === "duplicate"}
                              readOnly={!editing}
                              className={
                                editing
                                  ? "mt-2 min-h-40"
                                  : "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground"
                              }
                              onSelect={(event) => {
                                const field = event.currentTarget;
                                const quote = field.value
                                  .slice(field.selectionStart, field.selectionEnd)
                                  .trim();
                                setSelectedQuote(quote ? { activityId: a.id, quote } : null);
                              }}
                            />
                          </div>
                        </section>
                      )}
                      <ActivityAttachments
                        activity={a}
                        files={data.activityFiles.filter((file) => file.activityId === a.id)}
                        mutate={mutate}
                        disabled={c.status === "duplicate" || !editing}
                      />
                      {editing &&
                        data.activityContacts.filter((link) => link.activityId === a.id).length >
                          1 && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <FileText size={14} /> Eksporteres under
                            <Select
                              className="w-48"
                              value={a.exportOwnerContactId ?? c.id}
                              onValueChange={(contactId) =>
                                void mutate(`/activities/${a.id}/export-owner`, { contactId })
                              }
                              items={data.activityContacts
                                .filter((link) => link.activityId === a.id)
                                .map((link) =>
                                  data.contacts.find((person) => person.id === link.contactId),
                                )
                                .filter(
                                  (person): person is Contact =>
                                    !!person && person.status !== "duplicate",
                                )
                                .map((person) => ({ value: person.id, label: person.name }))}
                              aria-label="Eksporteier for delt aktivitet"
                              disabled={busy || c.status === "duplicate"}
                            />
                          </div>
                        )}
                      {editing && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <ShieldCheck size={14} /> Ekstern AI
                          <Select
                            className="w-44"
                            value={
                              a.allowExternalAiOverride === null
                                ? "inherit"
                                : a.allowExternalAiOverride
                                  ? "allow"
                                  : "block"
                            }
                            onValueChange={(value) =>
                              void mutate(`/activities/${a.id}`, {
                                allowExternalAiOverride:
                                  value === "inherit" ? null : value === "allow",
                              })
                            }
                            items={[
                              { value: "inherit", label: "Arv fra kontakter" },
                              { value: "allow", label: "Tillat for aktivitet" },
                              { value: "block", label: "Blokker for aktivitet" },
                            ]}
                            aria-label="Ekstern AI for aktivitet"
                            disabled={c.status === "duplicate"}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {!timeline.length && (
                <p className="text-sm text-muted-foreground">Ingen aktivitet registrert.</p>
              )}
            </div>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold">Egenskaper</h2>
            <div className="mt-3 space-y-2">
              <ContactDetailField icon={ListFilter} label="Status" compact>
                <Select
                  value={c.status}
                  className={detailFieldClass}
                  aria-label="Status"
                  onValueChange={(value) => void mutate(`/contacts/${c.id}`, { status: value })}
                  items={statusOptions}
                  disabled={c.status === "duplicate"}
                />
              </ContactDetailField>
              <ContactDetailField icon={UserRound} label="Ansvarlig" compact>
                <Select
                  value={c.assigneeId ?? ""}
                  className={detailFieldClass}
                  aria-label="Ansvarlig"
                  onValueChange={(value) =>
                    void mutate(`/contacts/${c.id}`, { assigneeId: value || null })
                  }
                  items={assigneeOptions(data.members)}
                  disabled={c.status === "duplicate"}
                />
              </ContactDetailField>
              <ContactDetailField icon={ShieldCheck} label="Ekstern AI" compact>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={c.allowExternalAi}
                    onCheckedChange={(checked) =>
                      void mutate(`/contacts/${c.id}`, { allowExternalAi: checked })
                    }
                    disabled={c.status === "duplicate"}
                    aria-label="Tillat ekstern AI for kontakt"
                  />
                  {c.allowExternalAi ? "Tillatt" : "Ikke tillatt"}
                </label>
              </ContactDetailField>
            </div>
          </Card>
          {contactLibrary.length > 0 && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <BookOpen size={16} className="text-primary" /> Sitater ({contactLibrary.length})
              </h2>
              <div className="mt-3 space-y-2">
                {contactLibrary.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-xl border border-border p-3 text-left text-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                    onClick={() =>
                      document
                        .querySelector<HTMLElement>(
                          item.activityId
                            ? `[data-activity-id="${item.activityId}"]`
                            : "[data-note-source]",
                        )
                        ?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                  >
                    <span className="block whitespace-pre-wrap break-words">{item.quote}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {item.sourceKind === "note" ? "Notat" : "Aktivitet"}
                      {item.sourceDeleted
                        ? " · Kilde slettet"
                        : item.sourceEdited
                          ? " · Kilde endret"
                          : ""}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {c.status !== "duplicate" && (
            <ContactReminderCard
              contactId={c.id}
              reminders={data.reminders.filter((reminder) => reminder.contactId === c.id)}
              mutate={mutate}
              busy={busy}
              notificationPermission={notificationPermission}
              onEnableNotifications={onEnableNotifications}
            />
          )}
          {c.status !== "duplicate" && c.status !== "ikke_kontaktet" && (
            <CrossTeamOverlap contactId={c.id} updatedAt={c.updatedAt} />
          )}
          {related.length > 0 && (
            <Card className="p-4">
              <h2 className="font-semibold">{company?.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Relaterte kontakter ({related.length})
              </p>
              <div className="mt-3 space-y-1">
                {related.map((x) => (
                  <button
                    key={x.id}
                    className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => onOpen(x.id)}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
            </Card>
          )}
          {c.status !== "duplicate" && !!duplicates.data?.length && (
            <Card className="p-4">
              <h2 className="font-semibold">Mulige duplikater</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Navn + organisasjon, telefon eller e-post.
              </p>
              <div className="mt-3 space-y-2">
                {duplicates.data?.map((x) => (
                  <div key={x.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{x.name}</span>
                    <Button size="sm" variant="outline" onClick={() => setCompare(x.id)}>
                      Sammenlign
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
      <div className="h-[65vh] min-h-[28rem]" aria-hidden="true" />
      <Dialog open={!!compare} onOpenChange={(open) => !open && setCompare(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogTitle>Sammenlign kontakter</DialogTitle>
          {compare && (
            <DuplicateCompare
              left={c}
              right={data.contacts.find((x) => x.id === compare)!}
              data={data}
              mutate={mutate}
              onDone={() => {
                setCompare(null);
                onBack();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!deletingActivity} onOpenChange={(open) => !open && setDeletingActivity(null)}>
        <DialogContent>
          <DialogTitle>Slett aktivitet?</DialogTitle>
          <DialogDescription>
            {affectedContactNames.length > 1
              ? `Aktiviteten er delt med ${affectedContactNames.join(", ")}. Den slettes fra alle disse kontaktloggene.`
              : `Aktiviteten slettes fra kontaktloggen til ${affectedContactNames[0] ?? c.name}.`}{" "}
            Dette kan ikke angres.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletingActivity(null)} disabled={busy}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!deletingActivity) return;
                try {
                  await mutate(`/activities/${deletingActivity.id}/delete`, {});
                  setDeletingActivity(null);
                } catch {
                  // mutate shows the error in the page banner; keep the dialog open.
                }
              }}
            >
              Slett aktivitet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function AdditionalInformation({
  contactId,
  entries,
  contacts,
  onOpen,
  mutate,
  busy,
  disabled,
  focusedPassage,
}: {
  contactId: string;
  entries: AdditionalInfo[];
  contacts: Contact[];
  onOpen: (id: string) => void;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  disabled: boolean;
  focusedPassage: string | null;
}) {
  const [editing, setEditing] = useState<{ id: string; draft: string; expected: string } | null>(
    null,
  );
  async function save(entryId: string) {
    if (!editing || editing.id !== entryId || !editing.draft.trim()) return;
    try {
      await mutate(`/contacts/${contactId}/additional-info/${entryId}`, {
        markdown: editing.draft.trim(),
        expected: { markdown: editing.expected },
      });
      setEditing(null);
    } catch {
      // Keep the draft visible; the page-level banner explains the failure.
    }
  }
  return (
    <Card className="p-5" data-additional-info>
      <h2 className="font-semibold">Tilleggsinformasjon</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Informasjon lagt til av en agent eller fra en henvisning. Teamets notat er separat.
      </p>
      {focusedPassage && (
        <p className="mt-3 rounded-xl bg-primary/10 p-3 text-sm">
          <mark className="bg-primary/20">Søketreff: {focusedPassage}</mark>
        </p>
      )}
      {entries.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">Ingen tilleggsinformasjon ennå.</p>
      )}
      <div className="mt-3 space-y-3">
        {entries.map((entry) => {
          const source = contacts.find((item) => item.id === entry.sourceContactId);
          const active = editing?.id === entry.id;
          return (
            <section key={entry.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {entry.source === "agent" ? "Lagt til av agent" : "Henvisning fra kontakt"}
                  {entry.source === "referral" && source && (
                    <button
                      type="button"
                      className="ml-1 text-primary underline"
                      onClick={() => onOpen(source.id)}
                    >
                      {source.name}
                    </button>
                  )}
                  {entry.source === "referral" && !source && " · kildekontakt utilgjengelig"}
                </div>
                {!active && !disabled && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({ id: entry.id, draft: entry.markdown, expected: entry.markdown })
                    }
                  >
                    <Pencil size={14} /> Rediger
                  </Button>
                )}
              </div>
              {active ? (
                <div className="mt-2 space-y-2">
                  {entry.markdown !== editing.expected && (
                    <p className="rounded-lg bg-warn-soft p-2 text-xs">
                      Oppdatert av et annet teammedlem. Avbryt eller kopier utkastet før du prøver
                      igjen.
                    </p>
                  )}
                  <Textarea
                    autoFocus
                    value={editing.draft}
                    onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
                    maxLength={20000}
                    aria-label="Rediger tilleggsinformasjon som Markdown"
                    className="min-h-32"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !editing.draft.trim()}
                      onClick={() => void save(entry.id)}
                    >
                      Lagre
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                      Avbryt
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 break-words text-sm leading-6 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:font-semibold [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc">
                  <ReactMarkdown skipHtml>{entry.markdown}</ReactMarkdown>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}
function StikkordEditor({
  contact,
  mutate,
  busy,
  suggestions,
}: {
  contact: Contact;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  suggestions: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact.stikkord ?? "");
  const [expected, setExpected] = useState(contact.stikkord);
  const [newer, setNewer] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!editing) {
      setDraft(contact.stikkord ?? "");
      setExpected(contact.stikkord);
    }
  }, [contact.stikkord, editing]);
  async function save() {
    setError("");
    try {
      await mutate(`/contacts/${contact.id}`, {
        stikkord: draft.trim() || null,
        expected: { stikkord: expected },
      });
      setEditing(false);
      setNewer(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const current = cause.details.current as { stikkord?: string | null } | undefined;
        setNewer(current?.stikkord ?? "");
        setExpected(current?.stikkord ?? null);
      } else setError(cause instanceof Error ? cause.message : "Kunne ikke lagre stikkord.");
    }
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Stikkord</h2>
        {!editing && contact.status !== "duplicate" && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rediger stikkord"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={draft}
            maxLength={300}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Stikkord"
            placeholder="Korte stikkord om kontakten"
          />
          <p className="text-right text-xs text-muted-foreground">{draft.length}/300</p>
          {newer !== null && (
            <div className="rounded-xl border border-warn bg-warn-soft p-3 text-sm">
              <p className="font-medium">Nyere lagret tekst</p>
              <p className="mt-1 whitespace-pre-wrap">{newer || "(tomt)"}</p>
              <p className="mt-2 text-xs">Utkastet ditt er beholdt. Lagre igjen for å bruke det.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-risk">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || draft.trim() === (expected ?? "")}
              onClick={() => void save()}
            >
              Lagre
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setNewer(null);
              }}
            >
              Avbryt
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm">
          {contact.stikkord || <span className="text-muted-foreground">Ingen stikkord ennå.</span>}
        </p>
      )}
      {suggestions}
    </Card>
  );
}

function SharedNote({
  contact,
  mutate,
  focused,
  focusedPassage,
  focusedQuery,
}: {
  contact: Contact;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  focused: boolean;
  focusedPassage: string | null;
  focusedQuery: string | null;
}) {
  const qc = useQueryClient();
  const { org } = useOrg();
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const draft = draftEdit ?? contact.sharedNote;
  const [baseSavedAt, setBaseSavedAt] = useState(contact.sharedNoteSavedAt);
  const [quote, setQuote] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = !!contact.sharedNoteSavedAt;
  async function save(expectedSavedAt = baseSavedAt) {
    if (saving || draft === contact.sharedNote || !org) return;
    setSaving(true);
    setSaveError("");
    try {
      const savedNote = await request<Contact>(`/org/contacts/${contact.id}/note`, org.id, {
        text: draft,
        expectedSavedAt,
      });
      await qc.invalidateQueries({ queryKey: ["contact-data", org.id] });
      setBaseSavedAt(savedNote.sharedNoteSavedAt);
      setDraftEdit(null);
      setConflict(false);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("Note changed")) {
        setConflict(true);
        if (org) await qc.invalidateQueries({ queryKey: ["contact-data", org.id] });
      } else {
        setSaveError(cause instanceof Error ? cause.message : "Kunne ikke lagre notatet.");
      }
    } finally {
      setSaving(false);
    }
  }
  if (saved)
    return (
      <Card data-note-source className={`p-5 ${focused ? "activity-focus-flash" : ""}`}>
        <h2 className="font-semibold">Notat</h2>
        <p className="text-xs text-muted-foreground">
          Blir ikke inkludert i kontaktloggen eller til AI.
        </p>
        <p className="text-xs text-muted-foreground">Endringer lagres fortløpende for teamet.</p>
        {focusedPassage && (
          <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-primary/5 p-3 text-sm">
            <HighlightedText
              text={contact.sharedNote}
              passage={focusedPassage}
              query={focusedQuery}
            />
          </p>
        )}
        <LiveText
          kind="note"
          id={contact.id}
          initialText={contact.sharedNote}
          highlightPassage={focusedPassage}
          highlightQuery={focusedQuery}
          disabled={contact.status === "duplicate"}
          className="mt-3 min-h-28"
          onSelect={(event) => {
            const field = event.currentTarget;
            setQuote(field.value.slice(field.selectionStart, field.selectionEnd).trim());
          }}
        />
        {quote && contact.status !== "duplicate" && (
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await mutate("/library", { sourceKind: "note", contactId: contact.id, quote });
                setQuote("");
              } catch {
                /* The page-level mutation displays the error. */
              }
            }}
          >
            <BookOpen size={14} /> Legg til i sitater
          </Button>
        )}
      </Card>
    );
  return (
    <Card data-note-source className={`p-5 ${focused ? "activity-focus-flash" : ""}`}>
      <h2 className="font-semibold">Notat</h2>
      <p className="text-xs text-muted-foreground">
        Blir ikke inkludert i kontaktloggen eller til AI.
      </p>
      <p className="text-xs text-muted-foreground">
        {saved
          ? "Endringer lagres når feltet mister fokus."
          : "Første notat lagres når du trykker Lagre."}
      </p>
      <Textarea
        value={draft}
        onChange={(e) => {
          if (draftEdit === null) setBaseSavedAt(contact.sharedNoteSavedAt);
          setDraftEdit(e.target.value);
        }}
        className="mt-3 min-h-28"
        onBlur={() => {
          if (saved && !conflict && draft !== contact.sharedNote) void save();
        }}
        onSelect={(event) => {
          const field = event.currentTarget;
          setQuote(field.value.slice(field.selectionStart, field.selectionEnd).trim());
        }}
        disabled={contact.status === "duplicate"}
      />
      {saveError && (
        <p role="alert" className="mt-2 text-xs text-risk">
          {saveError}
        </p>
      )}
      {conflict && (
        <div className="mt-3 rounded-xl border border-warn bg-warn-soft p-3 text-sm">
          <p className="font-medium">
            Notatet ble endret av noen andre. Din tekst er beholdt i feltet over.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Nyeste lagrede versjon:</p>
          <p className="mt-1 whitespace-pre-wrap">{contact.sharedNote || "(tomt notat)"}</p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraftEdit(null);
                setBaseSavedAt(contact.sharedNoteSavedAt);
                setConflict(false);
              }}
            >
              Bruk nyeste
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void save(contact.sharedNoteSavedAt)}
            >
              Lagre min tekst over nyeste
            </Button>
          </div>
        </div>
      )}
      {!saved && contact.status !== "duplicate" && (
        <Button
          className="mt-3"
          size="sm"
          disabled={saving || !draft.trim()}
          onClick={() => void save()}
        >
          Lagre notat
        </Button>
      )}
      {quote && saved && draft === contact.sharedNote && !conflict && (
        <Button
          className="mt-3"
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await mutate("/library", { sourceKind: "note", contactId: contact.id, quote });
              setQuote("");
            } catch {
              /* The page-level mutation displays the error. */
            }
          }}
        >
          <BookOpen size={14} /> Legg til i sitater
        </Button>
      )}
    </Card>
  );
}
function ActivityAttachments({
  activity,
  files,
  mutate,
  disabled,
}: {
  activity: Activity;
  files: ActivityFile[];
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  disabled: boolean;
}) {
  const { org } = useOrg();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  async function attach(file: File | undefined) {
    if (!file || !org) return;
    if (
      !["application/pdf", "image/png", "image/jpeg"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Velg PDF, PNG eller JPEG på maks 10 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadFile(org.id, file);
      await mutate(`/activities/${activity.id}/files`, { fileId: uploaded.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke laste opp dokumentet.");
    } finally {
      setUploading(false);
    }
  }
  async function open(fileId: string) {
    if (!org) return;
    const preview = window.open("", "_blank");
    try {
      const { url } = await request<{ url: string }>(`/org/files/${fileId}/url`, org.id);
      if (preview) {
        preview.opener = null;
        preview.location.replace(url);
      } else {
        window.location.assign(url);
      }
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : "Kunne ikke åpne dokumentet.");
    }
  }
  if (disabled && !files.length && !error) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Vedlegg</span>
        {!disabled && (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
            <Upload size={13} /> {uploading ? "Laster opp …" : "Legg til PDF eller bilde"}
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                void attach(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-risk">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs"
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-primary"
                onClick={() => void open(file.id)}
              >
                <FileText size={14} /> {file.name}
              </button>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Fjern ${file.name}`}
                  onClick={() =>
                    void mutate(`/activities/${activity.id}/files/${file.id}/remove`, {})
                  }
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function DuplicateCompare({
  left,
  right,
  data,
  mutate,
  onDone,
}: {
  left: Contact;
  right: Contact;
  data: Data;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onDone: () => void;
}) {
  const [primaryId, setPrimaryId] = useState(left.id);
  const [fields, setFields] = useState<string[]>([]);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const primary = primaryId === left.id ? left : right;
  const duplicate = primaryId === left.id ? right : left;
  const sourceActivities = data.activities.filter((a) =>
    data.activityContacts.some(
      (link) => link.activityId === a.id && link.contactId === duplicate.id,
    ),
  );
  const options = ["name", "companyId", "email", "phone", "description"] as const;
  const labels = {
    name: "Navn",
    companyId: "Organisasjon",
    email: "E-post",
    phone: "Telefon",
    description: "Beskrivelse",
  };
  const display = (contact: Contact, field: (typeof options)[number]) =>
    field === "companyId"
      ? (data.companies.find((x) => x.id === contact.companyId)?.name ?? "—")
      : String(contact[field] || "—");
  async function merge() {
    await mutate("/duplicates/merge", {
      primaryId,
      duplicateId: duplicate.id,
      fields,
      activityIds,
    });
    onDone();
  }
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Velg hvilken kontakt som beholdes. Den andre arkiveres som duplikat. Velg felt og
        aktiviteter som skal flyttes.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[left, right].map((c) => (
          <button
            key={c.id}
            className={`rounded-xl border p-3 text-left ${primaryId === c.id ? "border-primary bg-primary-soft" : "border-border"}`}
            onClick={() => {
              setPrimaryId(c.id);
              setFields([]);
              setActivityIds([]);
            }}
          >
            <span className="font-medium">{c.name}</span>
            <span className="block text-xs">
              {data.companies.find((x) => x.id === c.companyId)?.name}
            </span>
            <span className="mt-2 block text-xs">
              {primaryId === c.id ? "Beholdes" : "Arkiveres"}
            </span>
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {options.map((field) => (
          <label
            key={field}
            className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2 border-b py-2 text-xs"
          >
            <span className="font-medium">{labels[field]}</span>
            <span className="break-words text-muted-foreground">{display(primary, field)}</span>
            <span className="break-words">
              <Checkbox
                disabled={!duplicate[field]}
                checked={fields.includes(field)}
                onCheckedChange={(checked) =>
                  setFields(checked ? [...fields, field] : fields.filter((x) => x !== field))
                }
                aria-label={`Kopier ${labels[field]} fra duplikatet`}
              />{" "}
              {display(duplicate, field)}{" "}
              {duplicate[field] && (
                <span className="text-muted-foreground">
                  · {primary[field] ? "Erstatt" : "Fyll tomt felt"}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      <div>
        <h3 className="font-medium">Aktiviteter på duplikatet</h3>
        {sourceActivities.map((a) => (
          <label key={a.id} className="mt-2 flex gap-2 rounded-lg bg-muted p-2 text-sm">
            <Checkbox
              checked={activityIds.includes(a.id)}
              onCheckedChange={(checked) =>
                setActivityIds(
                  checked ? [...activityIds, a.id] : activityIds.filter((x) => x !== a.id),
                )
              }
              aria-label={`Flytt aktivitet fra ${dateLabel(a.occurredAt)}`}
            />
            <span>
              {dateLabel(a.occurredAt)} · {a.kind} · {a.summary || "Uten sammendrag"}
            </span>
          </label>
        ))}
      </div>
      <Button onClick={() => void merge()} variant="destructive">
        Bekreft duplikat
      </Button>
    </div>
  );
}
type OrganizationSelection =
  | { kind: "all" }
  | { kind: "domain"; id: string }
  | { kind: "company"; id: string };

const graphSpring = { type: "spring" as const, stiffness: 230, damping: 19, mass: 0.85 };

function wrapMapDescription(description: string): string[] {
  const words = description
    .trim()
    .split(/\s+/)
    .flatMap((word) => word.match(/.{1,31}/g) ?? []);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + word.length + 1 <= 31) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

function OrganizationGraph({
  data,
  companies,
  selection,
  onSelect,
  onOpenNode,
  onCloseNode,
  activeNode,
  viewportHeight,
  viewportWidth,
  fitToken,
  zoomAction,
}: {
  data: Data;
  companies: Company[];
  selection: OrganizationSelection;
  onSelect: (selection: OrganizationSelection) => void;
  onOpenNode: (kind: "company" | "contact", id: string, anchor: Element) => void;
  onCloseNode: () => void;
  activeNode: { kind: "company" | "contact"; id: string } | null;
  viewportHeight: number;
  viewportWidth: number;
  fitToken: number;
  zoomAction: { sequence: number; factor: number };
}) {
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? { duration: 0 } : graphSpring;
  const domains = data.domains.filter((domain) =>
    selection.kind === "domain"
      ? domain.id === selection.id
      : selection.kind === "company"
        ? data.companyDomains.some(
            (link) => link.companyId === selection.id && link.domainId === domain.id,
          )
        : true,
  );
  const companyPeople = companies.map((company) => ({
    company,
    people: data.contacts.filter(
      (contact) => contact.companyId === company.id && contact.status !== "duplicate",
    ),
  }));
  const domainRadius = domains.length > 1 ? Math.max(170, domains.length * 55) : 0;
  const companyRadius = Math.max(domainRadius + 290, companies.length * 155);
  const contactHeight = (description: string) =>
    Math.max(72, 50 + wrapMapDescription(description).length * 15);
  const rowHeights = companyPeople.map(({ people }) =>
    Array.from({ length: Math.ceil(people.length / 3) }, (_, row) =>
      Math.max(
        72,
        ...people
          .slice(row * 3, row * 3 + 3)
          .map((person) => contactHeight(person.description?.trim() || "Ingen kort beskrivelse")),
      ),
    ),
  );
  const maxContactReach = Math.max(
    0,
    ...rowHeights.map((heights) => heights.reduce((total, height) => total + height + 30, 0)),
  );
  const graphRadius = companyRadius + 300 + maxContactReach;
  const graphWidth = graphRadius * 2;
  const graphHeight = graphWidth;
  const center = graphRadius;
  const angle = (index: number, count: number) =>
    -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);
  const polar = (radius: number, radians: number) => ({
    x: center + Math.cos(radians) * radius,
    y: center + Math.sin(radians) * radius,
  });
  type GraphNode = {
    id: string;
    entityId: string;
    kind: "domain" | "company" | "contact";
    label: string;
    subtitle?: string;
    x: number;
    y: number;
    color?: Color;
    status?: Company["status"];
  };
  type GraphEdge = {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
  };
  const domainPositions = new Map(
    domains.map((domain, index) => [domain.id, polar(domainRadius, angle(index, domains.length))]),
  );
  const nodes: GraphNode[] = domains.map((domain) => ({
    id: `domain:${domain.id}`,
    entityId: domain.id,
    kind: "domain",
    label: domain.name,
    ...domainPositions.get(domain.id)!,
    color: domain.color,
  }));
  const edges: GraphEdge[] = [];
  companyPeople.forEach(({ company, people }, index) => {
    const radians = angle(index, companies.length);
    const position = polar(companyRadius, radians);
    nodes.push({
      id: `company:${company.id}`,
      entityId: company.id,
      kind: "company",
      label: company.name,
      ...position,
      status: company.status,
    });
    for (const domain of domains) {
      if (
        !data.companyDomains.some(
          (link) => link.companyId === company.id && link.domainId === domain.id,
        )
      )
        continue;
      const start = domainPositions.get(domain.id)!;
      edges.push({
        id: `domain:${domain.id}:company:${company.id}`,
        x1: start.x,
        y1: start.y,
        x2: position.x,
        y2: position.y,
        color: colors[domain.color],
      });
    }
    people.forEach((contact, contactIndex) => {
      const row = Math.floor(contactIndex / 3);
      const countInRow = Math.min(3, people.length - row * 3);
      const column = contactIndex % 3;
      const lateral = (column - (countInRow - 1) / 2) * 265;
      const radius =
        companyRadius +
        210 +
        rowHeights[index].slice(0, row).reduce((total, height) => total + height + 30, 0);
      const x = center + Math.cos(radians) * radius - Math.sin(radians) * lateral;
      const y = center + Math.sin(radians) * radius + Math.cos(radians) * lateral;
      nodes.push({
        id: `contact:${contact.id}`,
        entityId: contact.id,
        kind: "contact",
        label: contact.name,
        subtitle: contact.description?.trim() || "Ingen kort beskrivelse",
        x,
        y,
      });
      edges.push({
        id: `company:${company.id}:contact:${contact.id}`,
        x1: position.x,
        y1: position.y,
        x2: x,
        y2: y,
        color: "var(--border)",
      });
    });
  });
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const dragging = useRef<{
    pointerId: number;
    x: number;
    y: number;
    viewX: number;
    viewY: number;
  } | null>(null);
  useEffect(() => {
    const scale = Math.min(
      1.2,
      Math.max(0.04, Math.min(viewportWidth, viewportHeight) / graphWidth),
    );
    setView({ x: 0, y: 0, scale });
  }, [
    viewportWidth,
    viewportHeight,
    graphWidth,
    selection.kind,
    selection.kind === "all" ? "" : selection.id,
    fitToken,
  ]);
  useEffect(() => {
    if (!zoomAction.sequence) return;
    setView((current) => ({
      ...current,
      scale: Math.min(3, Math.max(0.04, current.scale * zoomAction.factor)),
    }));
  }, [zoomAction]);
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey) {
        setView((current) => ({
          ...current,
          scale: Math.min(3, Math.max(0.04, current.scale * Math.exp(-event.deltaY / 500))),
        }));
      } else {
        const factor = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? viewportHeight : 1;
        setView((current) => ({
          ...current,
          x: current.x - event.deltaX * factor,
          y: current.y - event.deltaY * factor,
        }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [viewportHeight]);
  const transform = `translate(${viewportWidth / 2 + view.x} ${viewportHeight / 2 + view.y}) scale(${view.scale}) translate(${-center} ${-center})`;
  return (
    <svg
      ref={svgRef}
      className="block h-full w-full touch-none"
      width={viewportWidth}
      height={viewportHeight}
      viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
      role="group"
      aria-label={
        selection.kind === "domain"
          ? `Organisasjoner under ${domains[0]?.name ?? "domenet"}`
          : selection.kind === "company"
            ? `Kart for ${companies[0]?.name ?? "organisasjonen"}`
            : "Alle organisasjoner og domener"
      }
    >
      <defs>
        <pattern id="organization-graph-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="1" fill="var(--border)" />
        </pattern>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="url(#organization-graph-dots)"
        className={dragging.current ? "cursor-grabbing" : "cursor-grab"}
        onClick={onCloseNode}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragging.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            viewX: view.x,
            viewY: view.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragging.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setView((current) => ({
            ...current,
            x: drag.viewX + event.clientX - drag.x,
            y: drag.viewY + event.clientY - drag.y,
          }));
        }}
        onPointerUp={(event) => {
          if (dragging.current?.pointerId === event.pointerId) dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
      />
      <g transform={transform}>
        <AnimatePresence initial={false}>
          {edges.map((edge) => (
            <motion.line
              key={edge.id}
              initial={{ opacity: 0, x1: edge.x1, y1: edge.y1 - 20, x2: edge.x1, y2: edge.y1 }}
              animate={{
                opacity: 1,
                x1: edge.x1,
                y1: edge.y1,
                x2: edge.x2,
                y2: edge.y2,
              }}
              exit={{ opacity: 0, x2: edge.x1, y2: edge.y1 }}
              transition={transition}
              stroke={edge.color}
              strokeWidth={edge.id.startsWith("domain:") ? 2.5 : 2}
              strokeLinecap="round"
            />
          ))}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {nodes.map((node) => {
            const interactive = true;
            const width = node.kind === "company" ? 210 : node.kind === "domain" ? 160 : 220;
            const descriptionLines = node.subtitle ? wrapMapDescription(node.subtitle) : [];
            const height = node.kind === "contact" ? contactHeight(node.subtitle ?? "") : 50;
            const activate = (anchor: Element) => {
              if (node.kind === "domain") onSelect({ kind: "domain", id: node.entityId });
              else onOpenNode(node.kind as "company" | "contact", node.entityId, anchor);
            };
            return (
              <motion.g
                key={node.id}
                initial={{
                  opacity: 0,
                  x: node.x,
                  y: node.kind === "domain" ? 5 : node.y - 45,
                  scale: 0.72,
                }}
                animate={{ opacity: 1, x: node.x, y: node.y, scale: 1 }}
                exit={{ opacity: 0, y: node.kind === "domain" ? -15 : node.y - 35, scale: 0.72 }}
                whileHover={interactive && !reducedMotion ? { scale: 1.055 } : undefined}
                whileTap={interactive && !reducedMotion ? { scale: 0.97 } : undefined}
                transition={transition}
                className={interactive ? "cursor-pointer" : undefined}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={
                  interactive
                    ? node.kind === "contact"
                      ? `Vis kontaktkort for ${node.label}`
                      : `Vis ${node.label}`
                    : undefined
                }
                onClick={interactive ? (event) => activate(event.currentTarget) : undefined}
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          activate(event.currentTarget);
                        }
                      }
                    : undefined
                }
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              >
                <rect
                  x={-width / 2}
                  y="0"
                  width={width}
                  height={height}
                  rx="12"
                  fill={
                    node.kind === "domain"
                      ? "var(--card)"
                      : node.kind === "company"
                        ? node.status === "ingen"
                          ? "var(--card)"
                          : "var(--primary-soft)"
                        : "var(--muted)"
                  }
                  stroke={
                    node.kind === "domain"
                      ? colors[node.color ?? "blue"]
                      : node.kind === "company"
                        ? companyStatusColors[node.status ?? "ingen"]
                        : node.kind === "contact" &&
                            activeNode?.kind === "contact" &&
                            activeNode.id === node.entityId
                          ? "var(--primary)"
                          : "var(--border)"
                  }
                  strokeWidth={node.kind === "domain" || node.kind === "company" ? 2 : 1.5}
                />
                <text
                  x="0"
                  y={node.subtitle ? (node.kind === "contact" ? 28 : 25) : height / 2 + 5}
                  textAnchor="middle"
                  fontSize={node.kind === "contact" ? 14 : 15}
                  fontWeight={node.kind === "company" || node.kind === "contact" ? 600 : 500}
                  fill="var(--foreground)"
                  className="pointer-events-none"
                >
                  {node.label.length > (node.kind === "company" ? 26 : 25)
                    ? `${node.label.slice(0, node.kind === "company" ? 25 : 24)}…`
                    : node.label}
                </text>
                {node.subtitle && (
                  <text
                    x="0"
                    y={node.kind === "contact" ? 50 : 43}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--muted-foreground)"
                    className="pointer-events-none"
                  >
                    {node.kind === "contact"
                      ? descriptionLines.map((line, index) => (
                          <tspan key={`${node.id}:${index}`} x="0" dy={index ? 15 : 0}>
                            {line}
                          </tspan>
                        ))
                      : node.subtitle}
                  </text>
                )}
              </motion.g>
            );
          })}
        </AnimatePresence>
        <AnimatePresence>
          {companies.length === 0 && (
            <motion.text
              key="empty"
              x={graphWidth / 2}
              y={graphHeight / 2 + 35}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
            >
              Ingen organisasjoner i dette utvalget.
            </motion.text>
          )}
        </AnimatePresence>
      </g>
    </svg>
  );
}

function OrganizationMap({
  initialFocus,
  onFocusChange,
  loaded,
  data,
  mutate,
  onOpenContact,
  busy,
}: {
  initialFocus: MapFocus;
  onFocusChange: (focus: MapFocus) => void;
  loaded: boolean;
  data: Data;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onOpenContact: (id: string) => void;
  busy: boolean;
}) {
  const [selection, setSelection] = useState<OrganizationSelection>(
    initialFocus.kind !== "all" && initialFocus.id
      ? { kind: initialFocus.kind, id: initialFocus.id }
      : { kind: "all" },
  );
  const [activeNode, setActiveNode] = useState<{
    kind: "company" | "contact";
    id: string;
    anchor: Element;
  } | null>(null);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");
  const [domainColor, setDomainColor] = useState<Color>("blue");
  const [loiCompanyId, setLoiCompanyId] = useState<string | null>(null);
  const [summaryScope, setSummaryScope] = useState<{
    kind: "company" | "domain";
    id: string;
    name: string;
  } | null>(null);
  const graphRef = useRef<HTMLElement>(null);
  const [viewportHeight, setViewportHeight] = useState(560);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [fitToken, setFitToken] = useState(0);
  const [zoomAction, setZoomAction] = useState({ sequence: 0, factor: 1 });

  useEffect(() => {
    if (!loaded || selection.kind === "all") return;
    const valid =
      selection.kind === "domain"
        ? data.domains.some((domain) => domain.id === selection.id)
        : data.companies.some((company) => company.id === selection.id);
    if (!valid) {
      setSelection({ kind: "all" });
      onFocusChange({ kind: "all", id: null });
    }
  }, [loaded, selection, data.domains, data.companies, onFocusChange]);

  useEffect(() => {
    const element = graphRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewportHeight(Math.max(560, element.clientHeight));
      setViewportWidth(Math.max(320, element.clientWidth));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function chooseSelection(next: OrganizationSelection) {
    setActiveNode(null);
    setSelection(next);
    onFocusChange(next.kind === "all" ? { kind: "all", id: null } : next);
  }
  const selectedCompany =
    selection.kind === "company"
      ? (data.companies.find((candidate) => candidate.id === selection.id) ?? null)
      : null;
  const selectedDomain =
    selection.kind === "domain"
      ? (data.domains.find((candidate) => candidate.id === selection.id) ?? null)
      : null;
  const graphCompanies = data.companies.filter((candidate) =>
    selection.kind === "company"
      ? candidate.id === selection.id
      : selection.kind === "domain"
        ? data.companyDomains.some(
            (link) => link.companyId === candidate.id && link.domainId === selection.id,
          )
        : true,
  );
  const popupCompany =
    activeNode?.kind === "company"
      ? (data.companies.find((candidate) => candidate.id === activeNode.id) ?? null)
      : null;
  const popupContact =
    activeNode?.kind === "contact"
      ? (data.contacts.find((candidate) => candidate.id === activeNode.id) ?? null)
      : null;
  const popupCompanyDomains = popupCompany
    ? data.domains.filter((domain) =>
        data.companyDomains.some(
          (link) => link.companyId === popupCompany.id && link.domainId === domain.id,
        ),
      )
    : [];
  const popupPeople = popupCompany
    ? data.contacts.filter(
        (contact) => contact.companyId === popupCompany.id && contact.status !== "duplicate",
      )
    : [];
  const loiCompany = loiCompanyId
    ? (data.companies.find((candidate) => candidate.id === loiCompanyId) ?? null)
    : null;
  function openCreateDomain() {
    setNewDomain("");
    setNewDomainDescription("");
    setDomainDialogOpen(true);
  }

  async function createDomain(event: FormEvent) {
    event.preventDefault();
    if (!newDomain.trim() || !newDomainDescription.trim()) return;
    const tag = await mutate<Domain>("/domains", {
      name: newDomain.trim(),
      description: newDomainDescription.trim(),
      color: domainColor,
    });
    setNewDomain("");
    setNewDomainDescription("");
    setDomainDialogOpen(false);
    chooseSelection({ kind: "domain", id: tag.id });
  }
  async function toggleDomain(id: string) {
    if (!popupCompany) return;
    const currentIds = popupCompanyDomains.map((domain) => domain.id);
    await mutate(`/companies/${popupCompany.id}/domains`, {
      domainIds: currentIds.includes(id)
        ? currentIds.filter((domainId) => domainId !== id)
        : [...currentIds, id],
      expected: { domainIds: currentIds },
    });
  }

  return (
    <div className="relative flex min-h-[720px] min-w-0 flex-1 flex-col gap-4 lg:min-h-0">
      <h1 className="sr-only">Organisasjoner</h1>
      <section
        ref={graphRef}
        className="relative min-h-[560px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-card"
        aria-label="Relasjoner"
      >
        <OrganizationGraph
          data={data}
          companies={graphCompanies}
          selection={selection}
          onSelect={chooseSelection}
          onOpenNode={(kind, id, anchor) =>
            setActiveNode((current) =>
              current?.kind === kind && current.id === id ? null : { kind, id, anchor },
            )
          }
          onCloseNode={() => setActiveNode(null)}
          activeNode={activeNode}
          viewportHeight={viewportHeight}
          viewportWidth={viewportWidth}
          fitToken={fitToken}
          zoomAction={zoomAction}
        />
        {selection.kind !== "all" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute left-3 top-3 bg-card shadow-card"
            onClick={() => chooseSelection({ kind: "all" })}
          >
            <ArrowLeft size={15} /> Vis alt
          </Button>
        )}
        {selection.kind === "all" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute bottom-3 left-3 bg-card shadow-card"
            onClick={openCreateDomain}
          >
            <Plus size={15} /> Nytt domene
          </Button>
        )}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-card">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Zoom ut"
            onClick={() =>
              setZoomAction((current) => ({ sequence: current.sequence + 1, factor: 0.8 }))
            }
          >
            −
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setFitToken((current) => current + 1)}
          >
            Tilpass kart
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Zoom inn"
            onClick={() =>
              setZoomAction((current) => ({ sequence: current.sequence + 1, factor: 1.25 }))
            }
          >
            +
          </Button>
        </div>
      </section>
      {selectedDomain && (
        <div className="absolute bottom-5 left-5 z-10 w-[min(360px,calc(100%-40px))] max-h-[40vh] overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-card">
          <TagDescription tag={selectedDomain} pathPrefix="/domains" mutate={mutate} busy={busy} />
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            onClick={() =>
              setSummaryScope({ kind: "domain", id: selectedDomain.id, name: selectedDomain.name })
            }
          >
            <Sparkles size={14} /> Oppsummer samtaler fra {selectedDomain.name}
          </Button>
        </div>
      )}
      <Popover
        open={!!activeNode}
        onOpenChange={(open) => {
          if (!open) setActiveNode(null);
        }}
      >
        <PopoverContent
          anchor={activeNode?.anchor}
          side="right"
          align="start"
          className="max-h-[min(620px,calc(100vh-24px))] w-[min(360px,calc(100vw-24px))] overflow-y-auto p-4"
        >
          {popupCompany && (
            <div>
              <div className="flex flex-wrap items-center gap-2 pr-5">
                <h2 className="min-w-0 flex-1 text-lg font-semibold">{popupCompany.name}</h2>
                <Select
                  value={popupCompany.status}
                  aria-label={`Status for ${popupCompany.name}`}
                  className="w-auto max-w-full shrink-0"
                  onValueChange={(status) =>
                    void mutate(`/companies/${popupCompany.id}`, {
                      status,
                      expected: { status: popupCompany.status },
                    })
                  }
                  items={companyStatuses.map(([value, label]) => ({
                    value,
                    label,
                    icon: (
                      <span
                        className="block size-2.5 rounded-full"
                        style={{ backgroundColor: companyStatusColors[value] }}
                      />
                    ),
                  }))}
                />
              </div>
              <p className="mt-4 text-xs font-medium text-muted-foreground">Domener</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.domains.map((domain) => {
                  const linked = popupCompanyDomains.some((item) => item.id === domain.id);
                  return (
                    <button
                      key={domain.id}
                      type="button"
                      aria-pressed={linked}
                      disabled={busy}
                      className={`rounded-lg border px-2 py-1 text-xs transition-colors ${linked ? "font-semibold text-foreground shadow-sm ring-1 ring-inset ring-primary/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                      style={{
                        borderColor: colors[domain.color],
                        backgroundColor: linked
                          ? `color-mix(in srgb, ${colors[domain.color]} 24%, var(--card))`
                          : undefined,
                      }}
                      onClick={() => void toggleDomain(domain.id)}
                    >
                      <span
                        className="mr-1.5 inline-block size-2 rounded-full"
                        style={{ backgroundColor: colors[domain.color] }}
                      />
                      {domain.name}
                    </button>
                  );
                })}
                {!data.domains.length && (
                  <span className="text-xs text-muted-foreground">Ingen domener ennå.</span>
                )}
              </div>
              <p className="mt-4 text-xs font-medium text-muted-foreground">
                Kontakter ({popupPeople.length})
              </p>
              <div className="mt-2 space-y-1">
                {popupPeople.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => onOpenContact(person.id)}
                  >
                    {person.name}
                  </button>
                ))}
                {!popupPeople.length && (
                  <p className="text-xs text-muted-foreground">Ingen kontakter ennå.</p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSummaryScope({
                      kind: "company",
                      id: popupCompany.id,
                      name: popupCompany.name,
                    })
                  }
                >
                  <Sparkles size={14} /> Oppsummer samtaler fra {popupCompany.name}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLoiCompanyId(popupCompany.id)}
                >
                  <FileText size={14} /> Intensjonsavtale
                </Button>
              </div>
            </div>
          )}
          {popupContact && (
            <div>
              <h2 className="pr-6 text-lg font-semibold">{popupContact.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.companies.find((candidate) => candidate.id === popupContact.companyId)?.name}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-5">
                {popupContact.description?.trim() || "Ingen kort beskrivelse er lagt til."}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.contactPersonTags
                  .filter((link) => link.contactId === popupContact.id)
                  .map((link) => {
                    const tag = data.personTags.find((candidate) => candidate.id === link.tagId);
                    return tag ? (
                      <Badge key={tag.id} variant="neutral">
                        {tag.name}
                      </Badge>
                    ) : null;
                  })}
              </div>
              <div className="mt-3">
                <ContactStatusBadge status={popupContact.status} />
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-3">
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => onOpenContact(popupContact.id)}
                >
                  Gå til kontakt
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Dialog open={domainDialogOpen} onOpenChange={setDomainDialogOpen}>
        <DialogContent>
          <DialogTitle>Nytt domene</DialogTitle>
          <DialogDescription>Velg navn og farge for domenet.</DialogDescription>
          <form className="mt-5 space-y-4" onSubmit={(event) => void createDomain(event)}>
            <Input
              autoFocus
              placeholder="Navn"
              aria-label="Domenenavn"
              required
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
            />
            <Textarea
              required
              maxLength={500}
              placeholder="Når skal et selskap knyttes til dette domenet?"
              aria-label="Beskrivelse av domenet"
              value={newDomainDescription}
              onChange={(event) => setNewDomainDescription(event.target.value)}
            />
            <div className="grid grid-cols-5 gap-3" role="group" aria-label="Farge">
              {(Object.keys(colors) as Color[]).map((color) => (
                <button
                  key={color}
                  type="button"
                  title={colorLabels[color]}
                  aria-label={`Velg ${colorLabels[color]} farge`}
                  aria-pressed={domainColor === color}
                  onClick={() => setDomainColor(color)}
                  className={`aspect-square w-full rounded-lg transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${domainColor === color ? "ring-2 ring-foreground ring-offset-2" : ""}`}
                  style={{ backgroundColor: colors[color] }}
                />
              ))}
            </div>
            <Button type="submit" disabled={busy}>
              Opprett domene
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!summaryScope}
        onOpenChange={(open) => {
          if (!open) setSummaryScope(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {summaryScope && (
            <>
              <DialogTitle>Oppsummer samtaler</DialogTitle>
              <div className="mt-4">
                <GroupAiSummary key={`${summaryScope.kind}:${summaryScope.id}`} {...summaryScope} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!loiCompanyId}
        onOpenChange={(open) => {
          if (!open) setLoiCompanyId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-[min(92vw,1200px)] overflow-y-auto">
          {loiCompany && (
            <>
              <DialogTitle>Intensjonsavtale · {loiCompany.name}</DialogTitle>
              <div className="mt-4">
                <LoiPanel
                  key={loiCompany.id}
                  company={loiCompany}
                  members={data.members}
                  contacts={data.contacts
                    .filter(
                      (person) =>
                        person.companyId === loiCompany.id && person.status !== "duplicate",
                    )
                    .map((person) => ({ id: person.id, name: person.name }))}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function PersonTagEditor({
  contactId,
  tags,
  selectedIds,
  mutate,
  busy,
}: {
  contactId: string;
  tags: Tag[];
  selectedIds: string[];
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      const created = await mutate<Tag>("/person-tags", {
        name: name.trim(),
        description: description.trim(),
      });
      await mutate(`/contacts/${contactId}/tags`, {
        tagIds: [...selectedIds, created.id],
      });
      setName("");
      setDescription("");
    } catch {
      // The workspace error banner explains the failed save.
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className="rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
      >
        <Plus size={12} className="mr-1 inline" /> Ny/rediger tagger
      </PopoverTrigger>
      <PopoverContent className="max-h-[min(600px,calc(100vh-32px))] w-[min(380px,calc(100vw-24px))] overflow-y-auto p-3">
        <p className="text-sm font-medium">Persontagger</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Beskriv når taggene skal brukes for AI-forslag.
        </p>
        <div className="mt-3 space-y-2">
          {tags.map((tag) => (
            <TagDescription
              key={tag.id}
              tag={tag}
              pathPrefix="/person-tags"
              mutate={mutate}
              busy={busy}
            />
          ))}
        </div>
        <form
          className="mt-4 space-y-2 border-t border-border pt-3"
          onSubmit={(event) => void create(event)}
        >
          <p className="text-sm font-medium">Ny persontagg</p>
          <Input
            required
            maxLength={100}
            placeholder="Navn"
            aria-label="Navn på ny persontagg"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Textarea
            required
            maxLength={500}
            placeholder="Når skal denne taggen brukes?"
            aria-label="Beskrivelse av ny persontagg"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={busy || !name.trim() || !description.trim()}>
            Opprett og legg til
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function TagDescription({
  tag,
  pathPrefix,
  mutate,
  busy,
}: {
  tag: Tag | Domain;
  pathPrefix: "/person-tags" | "/domains";
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [expected, setExpected] = useState<string | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate(`${pathPrefix}/${tag.id}`, {
        description: draft.trim(),
        expected: { description: expected },
      });
      setEditing(false);
    } catch {
      // Keep the draft for comparison when another member has changed this tag.
    }
  }
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant="neutral">{tag.name}</Badge>
          {!editing && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {tag.description || "Mangler beskrivelse · AI bruker ikke denne taggen."}
            </p>
          )}
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(tag.description ?? "");
              setExpected(tag.description);
              setEditing(true);
            }}
          >
            <Pencil size={14} /> Rediger
          </Button>
        )}
      </div>
      {editing && (
        <form className="mt-3 space-y-2" onSubmit={(event) => void save(event)}>
          {tag.description !== expected && (
            <div className="rounded-lg bg-warn-soft p-2 text-xs">
              <p>Nyere beskrivelse fra teamet: {tag.description || "Ingen beskrivelse"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setExpected(tag.description)}
                >
                  Behold mitt utkast og prøv igjen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft(tag.description ?? "");
                    setExpected(tag.description);
                  }}
                >
                  Bruk nyeste beskrivelse
                </Button>
              </div>
            </div>
          )}
          <Textarea
            autoFocus
            required
            maxLength={500}
            aria-label={`Beskrivelse for ${tag.name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
              Lagre beskrivelse
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Avbryt
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Settings({
  section,
  state,
  mutate,
  busy,
}: {
  section: "profile" | "team_settings" | "class_settings";
  state: ReturnType<typeof useOrg>;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
}) {
  const [teamName, setTeamName] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  async function createTeam(e: FormEvent) {
    e.preventDefault();
    try {
      const row = await request<{ id: string }>("/organizations", undefined, { name: teamName });
      await state.refresh();
      state.select(row.id);
      setTeamName("");
      setMessage("Team opprettet. Lag en invitasjon til teamet.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }
  async function invite() {
    const result = await mutate<{ inviteUrl: string }>("/invitations", {});
    setInviteUrl(result.inviteUrl);
  }
  async function recovery() {
    const result = await request<{ recoveryCode: string }>("/profile/recovery-code", undefined, {});
    setCode(result.recoveryCode);
  }
  const inviteCard = state.org && (
    <Card className="p-5">
      <h2 className="font-semibold">Inviter til {state.org.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Lenken kan brukes én gang og utløper om sju dager. Del den bare med den som skal bli med.
      </p>
      <Button className="mt-4" disabled={busy} onClick={() => void invite()}>
        Lag invitasjonslenke
      </Button>
      {inviteUrl && (
        <div className="mt-3 flex gap-2">
          <Input readOnly value={inviteUrl} />
          <Button variant="outline" onClick={() => void copyText(inviteUrl)}>
            Kopier
          </Button>
        </div>
      )}
    </Card>
  );
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="sr-only">
        {section === "profile"
          ? "Profil"
          : section === "team_settings"
            ? "Teaminnstillinger"
            : "Klasseinnstillinger"}
      </h1>
      {section === "profile" && <ProfileEditor />}
      {section === "profile" && <ProfileAgentAccess />}
      {section === "profile" && (
        <Card className="p-5">
          <h2 className="font-semibold">Profil</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.user?.name}. Gjenopprettingskoden fungerer som passord på alle enheter. Når du
            lager en ny kode, slutter den gamle å virke.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void recovery()}>
            Lag ny gjenopprettingskode
          </Button>
          {code && (
            <div className="mt-3 rounded-xl bg-warn-soft p-3">
              <code className="break-all text-sm">{code}</code>
              <Button
                className="ml-2"
                size="sm"
                variant="outline"
                onClick={() => void copyText(code)}
              >
                Kopier
              </Button>
            </div>
          )}
        </Card>
      )}
      {section === "team_settings" && state.org && <TeamLoiSettings />}
      {section === "team_settings" && inviteCard}
      {section === "team_settings" && state.org && (
        <Card className="p-5">
          <h2 className="font-semibold">Rapportmal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Last ned Typst-malen for rapporten. Siter kontakter med teamets kontaktnummer, for
            eksempel <code>#cite-contact(1, 2)</code>.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              setReportError("");
              void downloadOrgFile(
                state.org!.id,
                "/org/export/report-template.zip",
                "contac-report-v1.zip",
              ).catch((cause) =>
                setReportError(
                  cause instanceof Error ? cause.message : "Kunne ikke laste ned malen.",
                ),
              );
            }}
          >
            Last ned Typst-rapportmal
          </Button>
          <Button
            className="mt-4 ml-2"
            variant="outline"
            onClick={() => {
              setReportError("");
              setReportMessage("");
              void readOrgText(state.org!.id, "/org/export/contact-log.yaml")
                .then(copyText)
                .then(() => setReportMessage("Kontaktloggen er kopiert som YAML."))
                .catch((cause) =>
                  setReportError(
                    cause instanceof Error ? cause.message : "Kunne ikke kopiere kontaktloggen.",
                  ),
                );
            }}
          >
            Kopier kontaktlogg som YAML
          </Button>
          {reportMessage && (
            <p role="status" className="mt-2 text-sm">
              {reportMessage}
            </p>
          )}
          {reportError && (
            <p role="alert" className="mt-2 text-sm text-risk">
              {reportError}
            </p>
          )}
        </Card>
      )}
      {section === "team_settings" && state.org && <TeamAiSettings />}
      {section === "class_settings" && state.classSpace?.role === "admin" && (
        <Card className="p-5">
          <h2 className="font-semibold">Klasseadministrator · {state.classSpace.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Opprett team og send den første hemmelige invitasjonen.
          </p>
          <form className="mt-4 flex gap-2" onSubmit={(e) => void createTeam(e)}>
            <Input
              required
              placeholder="Teamnavn"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <Button type="submit">Opprett team</Button>
          </form>
          <div className="mt-3 text-sm">
            {state.organizations.map((o) => (
              <button
                key={o.id}
                className="mr-2 rounded-lg bg-muted px-3 py-1"
                onClick={() => state.select(o.id)}
              >
                {o.name}
              </button>
            ))}
          </div>
        </Card>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
