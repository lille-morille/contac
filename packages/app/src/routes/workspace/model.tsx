import { Mail, Phone, PhoneCall, Users, type LucideIcon } from "lucide-react";
import {
  ContactStatusIcon,
  contactStatuses as statuses,
  type ContactStatus as Status,
} from "../../components/contact-status.tsx";
import { Avatar } from "../../components/ui/avatar.tsx";
import { profileAvatarUrl } from "../../lib/api.ts";
export const statusOptions = statuses.map(([value, label]) => ({
  value,
  label,
  icon: <ContactStatusIcon status={value} />,
}));
export const companyStatuses = [
  ["ingen", "Ingen status"],
  ["kunde", "Kunde"],
  ["konkurrent", "Konkurrent"],
  ["samarbeidspartner", "Samarbeidspartner"],
  ["ekspert", "Ekspert"],
] as const;
export const companyStatusColors: Record<(typeof companyStatuses)[number][0], string> = {
  ingen: "var(--border)",
  kunde: "var(--mint)",
  konkurrent: "var(--coral)",
  samarbeidspartner: "var(--blue)",
  ekspert: "var(--orange)",
};
export const colors = {
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
export type Color = keyof typeof colors;
export const colorLabels: Record<Color, string> = {
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
export type Company = {
  id: string;
  name: string;
  domainsRevision: number;
  status: (typeof companyStatuses)[number][0];
  loiLogoFileId: string | null;
  loiLogoUrl: string | null;
};
export type Domain = {
  id: string;
  name: string;
  description: string | null;
  color: Color;
  revision: number;
};
export type Tag = { id: string; name: string; description: string | null };
export type Contact = {
  id: string;
  contactNumber: number;
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  description: string | null;
  sharedNote: string;
  sharedNoteSavedAt: string | null;
  sammendrag: string | null;
  sammendragGeneratedAt: string | null;
  stikkord: string | null;
  relevance: "low" | "medium" | "high" | null;
  relevanceManual: boolean;
  stikkordGeneratedAt: string | null;
  status: Status;
  assigneeId: string | null;
  createdBy: string;
  duplicateOfId: string | null;
  allowExternalAi: boolean;
  createdAt: string;
  updatedAt: string;
  sortUpdatedAt?: string;
  deletedAt: string | null;
};
export type Activity = {
  id: string;
  kind: "phone" | "missed_phone" | "meeting" | "email";
  summary: string;
  transcript: string;
  missedOutcome: MissedOutcome | null;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  exportOwnerContactId: string | null;
};
export type ActivityFile = {
  activityId: string;
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};
export type EmailActivity = {
  activityId: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
};
export type LibraryItem = {
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
export type MissedOutcome = "voicemail" | "busy" | "call_later" | "no_answer" | "no_signal";
export const missedOutcomeLabels: Record<MissedOutcome, string> = {
  voicemail: "Mobilsvar",
  busy: "Person opptatt",
  call_later: "Ring igjen senere",
  no_answer: "Ingen svar",
  no_signal: "Ingen dekning",
};
export function activityPresentation(activity: Activity): {
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
export type Reminder = { id: string; contactId: string; dueAt: string; message: string };
export type Filters = {
  status?: string[];
  assigneeId?: string[];
  companyId?: string[];
  domainId?: string[];
  tagId?: string[];
};
export function normalizeFilters(input: Record<string, unknown>): Filters {
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
export type SortKey = "updated" | "name" | "last_contacted" | "created";
export type ViewSettings = { layout: "board" | "list"; filters: Filters; sortKey: SortKey };
export const defaultViewSettings: ViewSettings = {
  layout: "board",
  filters: {},
  sortKey: "updated",
};
export type MapFocus = { kind: "all" | "company"; id: string | null };
export type WorkspaceLocation = {
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
export const workspacePages: Page[] = [
  "contacts",
  "contacted",
  "calendar",
  "search",
  "duplicates",
  "deleted",
  "organizations",
  "library",
  "export",
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
      ? "note"
      : uuid(params.get("activity")),
    passage: params.get("passage"),
    query: params.get("q") ?? "",
    mapFocus: uuid(params.get("mapCompany"))
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
export function readViewDrafts(key: string): Record<string, ViewSettings> {
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
export type Data = {
  companies: Company[];
  domains: Domain[];
  companyDomains: { companyId: string; domainId: string }[];
  personTags: Tag[];
  contactPersonTags: { contactId: string; tagId: string }[];
  contacts: Contact[];
  contactCreators: { userId: string; name: string | null; avatarPath: string | null }[];
  contactAssignees: { userId: string; name: string | null; avatarPath: string | null }[];
  activities: Activity[];
  activityContacts: { activityId: string; contactId: string }[];
  activityFiles: ActivityFile[];
  emailActivities: EmailActivity[];
  members: { userId: string; role: string; name: string | null; avatarPath: string | null }[];
  favoriteContactIds: string[];
  reminders: Reminder[];
};
export function assigneeOptions(
  members: Data["members"],
  former?: Data["contactAssignees"][number],
) {
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
    ...(former && !members.some((member) => member.userId === former.userId)
      ? [
          {
            value: former.userId,
            label: `${former.name || "Medlem"} (tidligere ansvarlig)`,
            icon: (
              <Avatar
                name={former.name || "Medlem"}
                src={profileAvatarUrl(former.avatarPath)}
                className="size-5"
              />
            ),
          },
        ]
      : []),
  ];
}
export type Page =
  | "contacts"
  | "contacted"
  | "calendar"
  | "search"
  | "duplicates"
  | "deleted"
  | "organizations"
  | "library"
  | "export"
  | "profile"
  | "team_settings"
  | "class_settings";
export const emptyData: Data = {
  companies: [],
  domains: [],
  companyDomains: [],
  personTags: [],
  contactPersonTags: [],
  contacts: [],
  contactCreators: [],
  contactAssignees: [],
  activities: [],
  activityContacts: [],
  activityFiles: [],
  emailActivities: [],
  members: [],
  favoriteContactIds: [],
  reminders: [],
};
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
export const dateTimeLabel = (date: string) =>
  new Date(date).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function nextReminderTime() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow.toISOString();
}
export type ReminderPreset = "hour" | "three_hours" | "tomorrow";
export const reminderPresets: { value: ReminderPreset; label: string }[] = [
  { value: "hour", label: "Om én time" },
  { value: "three_hours", label: "Om tre timer" },
  { value: "tomorrow", label: "I morgen" },
];
export function reminderPresetTime(preset: ReminderPreset) {
  const date = new Date();
  if (preset === "hour" || preset === "three_hours")
    date.setHours(date.getHours() + (preset === "hour" ? 1 : 3));
  else {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
  }
  return date.toISOString();
}
