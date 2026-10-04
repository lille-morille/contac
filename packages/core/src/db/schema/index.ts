import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", ["owner", "admin", "member"]);
export const runStatus = pgEnum("agent_run_status", ["queued", "running", "completed", "failed"]);
export const messageRole = pgEnum("message_role", ["user", "assistant"]);
export const contactStatus = pgEnum("contact_status", [
  "ikke_kontaktet",
  "avsluttet",
  "kan_kontaktes_igjen",
  "skal_ringe",
  "venter_pa_svar",
  "follow_up",
  "ikke_kontakt_igjen",
  "duplicate",
]);
export const companyStatus = pgEnum("company_status", [
  "ikke_relevant",
  "relevant",
  "potensiell_kunde",
  "signert_intensjonsavtale",
]);
export const contactActivityKind = pgEnum("contact_activity_kind", [
  "phone",
  "missed_phone",
  "meeting",
  "email",
]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  profileEmail: text("profile_email"),
  avatarPath: text("avatar_path"),
  avatarUrl: text("avatar_url"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export const classSpaces = pgTable("class_spaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});
export const classMemberships = pgTable(
  "class_memberships",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classSpaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<"admin" | "member">().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.classId, table.userId] }),
    index("class_memberships_user_idx").on(table.userId),
  ],
);
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classSpaces.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  inboundKey: text("inbound_key"),
  autoShareLogs: boolean("auto_share_logs").notNull().default(false),
  newContactsAllowExternalAi: boolean("new_contacts_allow_external_ai").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: membershipRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("memberships_org_user_unique").on(table.orgId, table.userId),
    index("memberships_user_idx").on(table.userId),
  ],
);
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email"),
    role: membershipRole("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("invitations_org_idx").on(table.orgId)],
);
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("conversations_org_idx").on(table.orgId)],
);
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (table) => [index("messages_conversation_idx").on(table.conversationId, table.createdAt)],
);
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    triggerMessageId: uuid("trigger_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    status: runStatus("status").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("agent_runs_claim_idx").on(table.status, table.lockedUntil),
    index("agent_runs_org_idx").on(table.orgId),
  ],
);
export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [index("agent_events_run_idx").on(table.runId, table.createdAt)],
);

export const workspaceFiles = pgTable(
  "workspace_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull().unique(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("workspace_files_org_idx").on(table.orgId)],
);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    status: companyStatus("status").notNull().default("relevant"),
    loiLogoFileId: uuid("loi_logo_file_id").references(() => workspaceFiles.id, {
      onDelete: "set null",
    }),
    loiLogoUrl: text("loi_logo_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("companies_org_name_unique").on(table.orgId, table.normalizedName)],
);
export const loiSettings = pgTable("loi_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull().default(""),
  templateSource: text("template_source").notNull().default(""),
  logoFileId: uuid("logo_file_id").references(() => workspaceFiles.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});
export type LoiSection = { id?: string; title: string; body: string };
export type LoiContentSnapshot = {
  sections: LoiSection[];
  variables: Record<string, string>;
  ourSignerName: string;
  counterpartySignerName: string;
  documentDate: string;
  organizationName: string;
  teamBusinessName: string;
};
export const lois = pgTable(
  "lois",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull(),
    ourSignerName: text("our_signer_name").notNull(),
    counterpartySignerName: text("counterparty_signer_name").notNull().default(""),
    documentDate: text("document_date").notNull(),
    variables: jsonb("variables").$type<Record<string, string>>().notNull().default({}),
    sections: jsonb("sections").$type<LoiSection[]>().notNull().default([]),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentBy: uuid("sent_by"),
    sentVersionId: uuid("sent_version_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("lois_org_company_idx").on(table.orgId, table.companyId, table.createdAt)],
);
export const loiVersions = pgTable(
  "loi_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    loiId: uuid("loi_id")
      .notNull()
      .references(() => lois.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => workspaceFiles.id),
    kind: text("kind").$type<"generated" | "signed">().notNull(),
    label: text("label").notNull(),
    contentSnapshot: jsonb("content_snapshot").$type<LoiContentSnapshot>(),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("loi_versions_loi_idx").on(table.loiId, table.createdAt)],
);
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("departments_company_name_unique").on(table.companyId, table.normalizedName),
  ],
);
export const domainTags = pgTable(
  "domain_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    color: text("color")
      .$type<
        | "blue"
        | "orange"
        | "mint"
        | "pink"
        | "violet"
        | "coral"
        | "yellow"
        | "lime"
        | "cyan"
        | "slate"
      >()
      .notNull()
      .default("blue"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("domain_tags_org_name_unique").on(table.orgId, table.normalizedName)],
);
export const companyDomains = pgTable(
  "company_domains",
  {
    orgId: uuid("org_id").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domainTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.domainId] })],
);
export const personTags = pgTable(
  "person_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("person_tags_org_name_unique").on(table.orgId, table.normalizedName)],
);
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    departmentId: uuid("department_id").references(() => departments.id),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    position: text("position"),
    description: text("description"),
    sharedNote: text("shared_note").notNull().default(""),
    sharedNoteSavedAt: timestamp("shared_note_saved_at", { withTimezone: true }),
    stikkord: text("stikkord"),
    stikkordSourceVersion: text("stikkord_source_version"),
    stikkordGeneratedAt: timestamp("stikkord_generated_at", { withTimezone: true }),
    status: contactStatus("status").notNull().default("ikke_kontaktet"),
    assigneeId: uuid("assignee_id"),
    allowExternalAi: boolean("allow_external_ai").notNull().default(true),
    duplicateOfId: uuid("duplicate_of_id"),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("contacts_org_status_idx").on(table.orgId, table.status),
    index("contacts_company_idx").on(table.companyId),
    index("contacts_updated_idx").on(table.orgId, table.updatedAt),
  ],
);
export const favoriteContacts = pgTable(
  "favorite_contacts",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.contactId] }),
    index("favorite_contacts_org_user_idx").on(table.orgId, table.userId, table.createdAt),
  ],
);
export const contactPersonTags = pgTable(
  "contact_person_tags",
  {
    orgId: uuid("org_id").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => personTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.tagId] })],
);
export const contactActivities = pgTable("contact_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  kind: contactActivityKind("kind").notNull(),
  summary: text("summary").notNull().default(""),
  transcript: text("transcript").notNull().default(""),
  missedOutcome: text("missed_outcome").$type<
    "voicemail" | "busy" | "call_later" | "no_answer" | "no_signal" | null
  >(),
  allowExternalAiOverride: boolean("allow_external_ai_override"),
  exportOwnerContactId: uuid("export_owner_contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export const collabDocuments = pgTable(
  "collab_documents",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind")
      .$type<"note" | "summary" | "transcript" | "loi-section" | "loi-signature">()
      .notNull(),
    entityId: uuid("entity_id").notNull(),
    stateBase64: text("state_base64").notNull(),
    materializedText: text("materialized_text").notNull(),
    version: integer("version").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.orgId, table.kind, table.entityId] })],
);
export const emailDrafts = pgTable(
  "email_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull(),
    fromEmail: text("from_email").notNull(),
    toEmails: jsonb("to_emails").$type<string[]>().notNull().default([]),
    ccEmails: jsonb("cc_emails").$type<string[]>().notNull().default([]),
    bccEmails: jsonb("bcc_emails").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    markedSentAt: timestamp("marked_sent_at", { withTimezone: true }),
    activityId: uuid("activity_id").references(() => contactActivities.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("email_drafts_org_contact_idx").on(table.orgId, table.contactId)],
);
export const inboundEmails = pgTable("inbound_emails", {
  id: uuid("id").defaultRandom().primaryKey(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classSpaces.id, { onDelete: "cascade" }),
  providerMessageId: text("provider_message_id").notNull().unique(),
  fromEmail: text("from_email").notNull(),
  toEmails: jsonb("to_emails").$type<string[]>().notNull().default([]),
  ccEmails: jsonb("cc_emails").$type<string[]>().notNull().default([]),
  bccEmails: jsonb("bcc_emails").$type<string[]>().notNull().default([]),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  senderUserId: uuid("sender_user_id"),
  routedAt: timestamp("routed_at", { withTimezone: true }),
  adminResolvedAt: timestamp("admin_resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
});
export const inboundSuggestions = pgTable(
  "inbound_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inboundId: uuid("inbound_id")
      .notNull()
      .references(() => inboundEmails.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"email" | "alert">().notNull(),
    status: text("status")
      .$type<"pending" | "accepted" | "dismissed">()
      .notNull()
      .default("pending"),
    activityId: uuid("activity_id").references(() => contactActivities.id),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("inbound_suggestions_unique").on(table.inboundId, table.orgId)],
);
export const emailActivities = pgTable(
  "email_activities",
  {
    activityId: uuid("activity_id")
      .primaryKey()
      .references(() => contactActivities.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    inboundId: uuid("inbound_id").references(() => inboundEmails.id),
    fromEmail: text("from_email").notNull(),
    toEmails: jsonb("to_emails").$type<string[]>().notNull().default([]),
    ccEmails: jsonb("cc_emails").$type<string[]>().notNull().default([]),
    bccEmails: jsonb("bcc_emails").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull().default(""),
  },
  (table) => [uniqueIndex("email_activities_org_inbound_unique").on(table.orgId, table.inboundId)],
);
export const logAccessRequests = pgTable(
  "log_access_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterOrgId: uuid("requester_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerOrgId: uuid("owner_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerContactId: uuid("owner_contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").notNull(),
    status: text("status").$type<"pending" | "approved">().notNull().default("pending"),
    approvedBy: uuid("approved_by"),
    createdAt: createdAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("log_access_unique").on(table.requesterOrgId, table.ownerContactId)],
);
export const activityFiles = pgTable(
  "activity_files",
  {
    orgId: uuid("org_id").notNull(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => contactActivities.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => workspaceFiles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.activityId, table.fileId] })],
);
export const libraryItems = pgTable("library_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  activityId: uuid("activity_id"),
  sourceKind: text("source_kind").$type<"activity" | "note">().notNull(),
  quote: text("quote").notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: createdAt(),
});
export const checkinSessions = pgTable("checkin_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  startedBy: uuid("started_by").notNull(),
  startedAt: createdAt(),
  endedBy: uuid("ended_by"),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  selectedActivityIds: jsonb("selected_activity_ids").$type<string[]>().notNull().default([]),
  summary: text("summary"),
  summarySourceVersions: jsonb("summary_source_versions").$type<Record<string, string>>(),
  summaryCreatedAt: timestamp("summary_created_at", { withTimezone: true }),
  summaryModel: text("summary_model"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
});
export const checkinAiSettings = pgTable("checkin_ai_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  emailDraftEnabled: boolean("email_draft_enabled").notNull().default(false),
  modes: jsonb("modes").$type<Record<string, string>>().notNull().default({}),
  encryptedToken: text("encrypted_token"),
  lowModel: text("low_model").notNull().default("openai/gpt-4.1-nano"),
  model: text("model"),
  updatedAt: updatedAt(),
});

export const searchChunks = pgTable(
  "search_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id").references(() => contactActivities.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").$type<"contact" | "activity" | "note">().notNull(),
    sourceKey: text("source_key").notNull(),
    sourceVersion: text("source_version").notNull(),
    body: text("body").notNull(),
    embedding: jsonb("embedding").$type<number[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("search_chunks_source_key_unique").on(table.sourceKey),
    index("search_chunks_org_idx").on(table.orgId),
  ],
);

export const aiSuggestions = pgTable("ai_suggestions", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  sourceVersion: text("source_version").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").$type<"pending" | "applied" | "dismissed">().notNull().default("pending"),
  createdAt: createdAt(),
});
export const aiEditLog = pgTable("ai_edit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  before: jsonb("before").$type<Record<string, unknown>>().notNull(),
  after: jsonb("after").$type<Record<string, unknown>>().notNull(),
  appliedBy: uuid("applied_by"),
  createdAt: createdAt(),
  revertedAt: timestamp("reverted_at", { withTimezone: true }),
});
export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  costUsd: text("cost_usd"),
  createdAt: createdAt(),
});
export const groupAiSummaries = pgTable("group_ai_summaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  targetKind: text("target_kind").$type<"company" | "domain">().notNull(),
  targetId: uuid("target_id").notNull(),
  summary: text("summary").notNull(),
  sourceVersion: text("source_version").notNull(),
  excludedCount: integer("excluded_count").notNull().default(0),
  generatedAt: createdAt(),
});
export const contactReminders = pgTable(
  "contact_reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    message: text("message").notNull().default(""),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("contact_reminders_owner_due_idx").on(table.orgId, table.userId, table.dueAt)],
);
export const activityContacts = pgTable(
  "activity_contacts",
  {
    orgId: uuid("org_id").notNull(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => contactActivities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.activityId, table.contactId] })],
);
export const savedContactViews = pgTable(
  "saved_contact_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    layout: text("layout").$type<"board" | "list">().notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
    sortKey: text("sort_key").notNull().default("updated"),
    revision: integer("revision").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("saved_views_org_name_unique").on(table.orgId, table.name)],
);
