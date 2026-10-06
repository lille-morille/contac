import { createHash, randomBytes } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import {
  agentEvents,
  agentRuns,
  classMemberships,
  classSpaces,
  conversations,
  invitations,
  memberships,
  messages,
  organizations,
  personTags,
  profiles,
  workspaceFiles,
} from "@contac/core/db";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { requireAuth } from "./middleware/auth.ts";
import { requireOrg } from "./middleware/org.ts";
import { registerContactRoutes } from "./contacts.ts";
import { registerActivityFeatureRoutes } from "./activity-features.ts";
import { registerEmailCrossTeamRoutes, registerInboundEmailRoute } from "./email-cross-team.ts";
import { registerSearchRoutes } from "./search.ts";
import { registerAiRoutes } from "./ai.ts";
import { registerContactExportRoutes } from "./contact-export.ts";
import { registerLoiRoutes } from "./loi.ts";
import { registerCollabRoutes } from "./collab.ts";
import { registerMcpRoutes } from "./mcp.ts";
import { registerTeamAdminRoutes } from "./team-admin.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const uuid = z.uuid();
const invitationInput = z.object({});
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const accountEmail = (id: string) => `${id}@accounts.contac.invalid`;
const accountCode = (id: string, password: string) => `cc1.${id}.${password}`;
const invitationIsActive = (
  invite: { acceptedAt: Date | null; expiresAt: Date | null } | undefined,
) =>
  !!invite && (invite.expiresAt === null || (!invite.acceptedAt && invite.expiresAt >= new Date()));

async function createAccount(deps: ApiDeps, name: string) {
  const email = accountEmail(crypto.randomUUID());
  const password = randomBytes(32).toString("base64url");
  const { data, error } = await deps.supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) throw new Error("Could not create account");
  try {
    await deps.db.insert(profiles).values({ id: data.user.id, email, fullName: name });
  } catch (cause) {
    await deps.supabase.auth.admin.deleteUser(data.user.id);
    throw cause;
  }
  return { userId: data.user.id, code: accountCode(email.split("@")[0], password) };
}

export function createApp(deps: ApiDeps, appOrigin: string) {
  const app = new Hono<ApiEnv>();
  app.use(
    "*",
    cors({
      origin: appOrigin,
      allowHeaders: ["Authorization", "Content-Type", "x-org-id"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );
  app.get("/health", (c) => c.json({ ok: true }));
  registerInboundEmailRoute(app, deps);
  app.get("/v1/setup", async (c) => {
    const [row] = await deps.db.select({ id: classSpaces.id }).from(classSpaces).limit(1);
    return c.json({ needsSetup: !row && !!deps.setupCode });
  });
  app.post("/v1/setup", async (c) => {
    const body = z
      .object({
        setupCode: z.string(),
        className: z.string().trim().min(2).max(100),
        name: z.string().trim().min(2).max(100),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success || !deps.setupCode || body.data.setupCode !== deps.setupCode)
      return c.json({ error: "Invalid setup code" }, 403);
    const [existing] = await deps.db.select({ id: classSpaces.id }).from(classSpaces).limit(1);
    if (existing) return c.json({ error: "Class already initialized" }, 409);
    const account = await createAccount(deps, body.data.name);
    try {
      await deps.db.transaction(async (tx) => {
        const [space] = await tx
          .insert(classSpaces)
          .values({ name: body.data.className })
          .returning();
        await tx
          .insert(classMemberships)
          .values({ classId: space.id, userId: account.userId, role: "admin" });
      });
    } catch (cause) {
      await deps.supabase.auth.admin.deleteUser(account.userId);
      throw cause;
    }
    return c.json({ recoveryCode: account.code }, 201);
  });
  app.get("/v1/invitations/:token", async (c) => {
    const [invite] = await deps.db
      .select({
        orgId: invitations.orgId,
        acceptedAt: invitations.acceptedAt,
        expiresAt: invitations.expiresAt,
        teamName: organizations.name,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.orgId))
      .where(eq(invitations.tokenHash, hash(c.req.param("token"))))
      .limit(1);
    if (!invite || !invitationIsActive(invite))
      return c.json({ error: "Invitation is invalid" }, 404);
    return c.json({ teamName: invite.teamName });
  });
  app.post("/v1/invitations/join", async (c) => {
    const body = z
      .object({ token: z.string().min(20), name: z.string().trim().min(2).max(100) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Name and invitation are required" }, 400);
    const [invite] = await deps.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hash(body.data.token)))
      .limit(1);
    if (!invite || !invitationIsActive(invite))
      return c.json({ error: "Invitation is invalid" }, 404);
    const account = await createAccount(deps, body.data.name);
    try {
      await deps.db.transaction(async (tx) => {
        if (invite.expiresAt !== null) {
          const [claimed] = await tx
            .update(invitations)
            .set({ acceptedAt: new Date() })
            .where(and(eq(invitations.id, invite.id), isNull(invitations.acceptedAt)))
            .returning();
          if (!claimed) throw new Error("Invitation already used");
        }
        const [team] = await tx
          .select({ classId: organizations.classId })
          .from(organizations)
          .where(eq(organizations.id, invite.orgId));
        await tx
          .insert(classMemberships)
          .values({ classId: team.classId, userId: account.userId, role: "member" })
          .onConflictDoNothing();
        await tx
          .insert(memberships)
          .values({ orgId: invite.orgId, userId: account.userId, role: "admin" });
      });
    } catch (cause) {
      await deps.supabase.auth.admin.deleteUser(account.userId);
      return c.json({ error: cause instanceof Error ? cause.message : "Could not join team" }, 409);
    }
    return c.json({ recoveryCode: account.code, orgId: invite.orgId }, 201);
  });
  app.use("/v1/*", requireAuth(deps));

  app.get("/v1/me", async (c) => {
    const user = c.get("user");
    await deps.db
      .insert(profiles)
      .values({ id: user.id, email: user.email })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { email: user.email, updatedAt: new Date() },
      });
    const [classRow] = await deps.db
      .select({
        classId: classMemberships.classId,
        role: classMemberships.role,
        name: classSpaces.name,
      })
      .from(classMemberships)
      .innerJoin(classSpaces, eq(classSpaces.id, classMemberships.classId))
      .where(eq(classMemberships.userId, user.id))
      .limit(1);
    const memberRows =
      classRow?.role === "admin"
        ? (
            await deps.db
              .select({
                id: organizations.id,
                name: organizations.name,
                slug: organizations.slug,
                role: memberships.role,
              })
              .from(organizations)
              .leftJoin(
                memberships,
                and(eq(memberships.orgId, organizations.id), eq(memberships.userId, user.id)),
              )
              .where(eq(organizations.classId, classRow.classId))
              .orderBy(asc(organizations.name))
          ).map((row) => ({ ...row, role: row.role ?? "owner" }))
        : await deps.db
            .select({
              id: organizations.id,
              name: organizations.name,
              slug: organizations.slug,
              role: memberships.role,
            })
            .from(memberships)
            .innerJoin(organizations, eq(memberships.orgId, organizations.id))
            .where(eq(memberships.userId, user.id))
            .orderBy(asc(organizations.name));
    const [profile] = await deps.db
      .select({
        name: profiles.fullName,
        profileEmail: profiles.profileEmail,
        avatarPath: profiles.avatarPath,
        onboardedAt: profiles.onboardedAt,
        selectedTeamId: profiles.agentTeamId,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    return c.json({
      user: {
        id: user.id,
        name: profile?.name,
        email: profile?.profileEmail,
        avatarPath: profile?.avatarPath,
        onboarded: !!profile?.onboardedAt,
      },
      class: classRow ?? null,
      organizations: memberRows,
      selectedTeamId: profile?.selectedTeamId ?? null,
    });
  });

  app.post("/v1/profile/avatar", async (c) => {
    const file = (await c.req.parseBody()).file;
    if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024)
      return c.json({ error: "Choose an image under 5 MiB" }, 400);
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const png =
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    const image = png
      ? { extension: "png", contentType: "image/png" }
      : jpeg
        ? { extension: "jpg", contentType: "image/jpeg" }
        : webp
          ? { extension: "webp", contentType: "image/webp" }
          : null;
    if (!image) return c.json({ error: "Use a PNG, JPEG, or WebP image" }, 400);
    const user = c.get("user");
    const path = `${user.id}/${crypto.randomUUID()}.${image.extension}`;
    const bucket = deps.supabase.storage.from("profile-avatars");
    const { error: uploadError } = await bucket.upload(path, file, {
      contentType: image.contentType,
      upsert: false,
    });
    if (uploadError) return c.json({ error: "Could not upload profile photo" }, 502);
    try {
      const [current] = await deps.db
        .select({ avatarPath: profiles.avatarPath })
        .from(profiles)
        .where(eq(profiles.id, user.id));
      await deps.db
        .insert(profiles)
        .values({ id: user.id, email: user.email, avatarPath: path })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { avatarPath: path, updatedAt: new Date() },
        });
      if (current?.avatarPath) await bucket.remove([current.avatarPath]);
      return c.json({ avatarPath: path });
    } catch (cause) {
      await bucket.remove([path]);
      throw cause;
    }
  });

  app.post("/v1/profile", async (c) => {
    const body = z
      .object({ name: z.string().trim().min(2).max(100), email: z.email().max(320) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter a valid name and email address" }, 400);
    const userId = c.get("user").id;
    const [current] = await deps.db.select().from(profiles).where(eq(profiles.id, userId));
    if (!current) return c.json({ error: "Profile not found" }, 404);
    if (!current.onboardedAt && !/^\S+\s+\S+/.test(body.data.name))
      return c.json({ error: "Enter your full name, including first and last name" }, 400);
    if (!current.onboardedAt && !current.avatarPath)
      return c.json({ error: "Add a profile photo to complete onboarding" }, 400);
    const email = body.data.email.trim().toLowerCase();
    const [emailOwner] = await deps.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.profileEmail, email));
    if (emailOwner && emailOwner.id !== userId)
      return c.json({ error: "Email address is already used by another account" }, 409);
    try {
      const row = await deps.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(profiles)
          .set({
            fullName: body.data.name,
            profileEmail: email,
            onboardedAt: current.onboardedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(profiles.id, userId))
          .returning({
            name: profiles.fullName,
            email: profiles.profileEmail,
            avatarPath: profiles.avatarPath,
            onboardedAt: profiles.onboardedAt,
          });
        return updated;
      });
      return c.json(row);
    } catch (cause) {
      if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505")
        return c.json({ error: "Email address is already used by another account" }, 409);
      throw cause;
    }
  });

  app.post("/v1/profile/recovery-code", async (c) => {
    const user = c.get("user");
    const password = randomBytes(32).toString("base64url");
    const { error } = await deps.supabase.auth.admin.updateUserById(user.id, { password });
    if (error) return c.json({ error: "Could not rotate recovery code" }, 502);
    c.header("Cache-Control", "no-store");
    return c.json({ recoveryCode: accountCode(user.email.split("@")[0], password) });
  });

  app.post(
    "/v1/organizations",
    zValidator("json", z.object({ name: z.string().trim().min(2).max(100) })),
    async (c) => {
      const user = c.get("user");
      const [admin] = await deps.db
        .select({ classId: classMemberships.classId })
        .from(classMemberships)
        .where(and(eq(classMemberships.userId, user.id), eq(classMemberships.role, "admin")))
        .limit(1);
      if (!admin) return c.json({ error: "Class admin access required" }, 403);
      const name = c.req.valid("json").name;
      const slug = `${
        name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "org"
      }-${randomBytes(3).toString("hex")}`;
      const org = await deps.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(organizations)
          .values({ name, slug, classId: admin.classId })
          .returning();
        await tx.insert(memberships).values({ orgId: created.id, userId: user.id, role: "admin" });
        await tx.insert(personTags).values(
          ["Portvokter", "Ildsjel", "Bruker", "Beslutningstaker"].map((name) => ({
            orgId: created.id,
            name,
            normalizedName: name.toLocaleLowerCase("nb-NO"),
          })),
        );
        return created;
      });
      return c.json(org, 201);
    },
  );
  registerTeamAdminRoutes(app, deps);

  app.post(
    "/v1/invitations/accept",
    zValidator("json", z.object({ token: z.string().min(20) })),
    async (c) => {
      const user = c.get("user");
      const tokenHash = hash(c.req.valid("json").token);
      const [invitation] = await deps.db
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);
      if (
        !invitation ||
        !invitationIsActive(invitation) ||
        (invitation.email && invitation.email.toLowerCase() !== user.email.toLowerCase())
      )
        return c.json({ error: "Invitation invalid" }, 400);
      await deps.db.transaction(async (tx) => {
        if (invitation.expiresAt !== null) {
          const [claimed] = await tx
            .update(invitations)
            .set({ acceptedAt: new Date() })
            .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
            .returning();
          if (!claimed) throw new Error("Invitation already used");
        }
        const [team] = await tx
          .select({ classId: organizations.classId })
          .from(organizations)
          .where(eq(organizations.id, invitation.orgId));
        await tx
          .insert(classMemberships)
          .values({ classId: team.classId, userId: user.id, role: "member" })
          .onConflictDoNothing();
        await tx
          .insert(memberships)
          .values({ orgId: invitation.orgId, userId: user.id, role: "admin" })
          .onConflictDoNothing();
      });
      return c.json({ orgId: invitation.orgId });
    },
  );

  app.use("/v1/org/*", requireOrg(deps));
  registerMcpRoutes(app, deps, appOrigin);
  registerCollabRoutes(app, deps);
  registerEmailCrossTeamRoutes(app, deps);
  app.get("/v1/org/members", async (c) => {
    const rows = await deps.db
      .select({
        userId: memberships.userId,
        role: memberships.role,
        email: profiles.email,
        fullName: profiles.fullName,
      })
      .from(memberships)
      .leftJoin(profiles, eq(memberships.userId, profiles.id))
      .where(eq(memberships.orgId, c.get("org").id));
    return c.json(rows);
  });
  app.post("/v1/org/invitations", zValidator("json", invitationInput), async (c) => {
    const org = c.get("org");
    const token = randomBytes(32).toString("base64url");
    await deps.db.insert(invitations).values({
      orgId: org.id,
      email: null,
      role: "admin",
      tokenHash: hash(token),
      invitedBy: c.get("user").id,
    });
    return c.json({ inviteUrl: `${appOrigin}/invite?token=${encodeURIComponent(token)}` }, 201);
  });
  registerContactRoutes(app, deps);
  registerActivityFeatureRoutes(app, deps);
  registerSearchRoutes(app, deps);
  registerAiRoutes(app, deps);
  registerContactExportRoutes(app, deps);
  registerLoiRoutes(app, deps);
  app.get("/v1/org/files", async (c) => {
    const rows = await deps.db
      .select()
      .from(workspaceFiles)
      .where(eq(workspaceFiles.orgId, c.get("org").id))
      .orderBy(desc(workspaceFiles.createdAt));
    return c.json(rows);
  });
  app.post("/v1/org/files", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "Choose a file" }, 400);
    if (file.size > 25 * 1024 * 1024) return c.json({ error: "File limit is 25 MiB" }, 400);
    const orgId = c.get("org").id;
    const path = `${orgId}/${crypto.randomUUID()}`;
    const { error } = await deps.supabase.storage
      .from("workspace-files")
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) return c.json({ error: "Storage upload failed" }, 502);
    try {
      const [row] = await deps.db
        .insert(workspaceFiles)
        .values({
          orgId,
          storagePath: path,
          name: file.name.slice(0, 255),
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          createdBy: c.get("user").id,
        })
        .returning();
      return c.json(row, 201);
    } catch (cause) {
      await deps.supabase.storage.from("workspace-files").remove([path]);
      throw cause;
    }
  });
  app.get("/v1/org/files/:id/url", async (c) => {
    const id = uuid.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid file" }, 400);
    const [file] = await deps.db
      .select()
      .from(workspaceFiles)
      .where(and(eq(workspaceFiles.id, id.data), eq(workspaceFiles.orgId, c.get("org").id)))
      .limit(1);
    if (!file) return c.json({ error: "File not found" }, 404);
    const { data, error } = await deps.supabase.storage
      .from("workspace-files")
      .createSignedUrl(file.storagePath, 60);
    if (error || !data) return c.json({ error: "Could not create download link" }, 502);
    return c.json({ url: data.signedUrl });
  });
  app.get("/v1/org/conversations", async (c) => {
    const rows = await deps.db
      .select()
      .from(conversations)
      .where(eq(conversations.orgId, c.get("org").id))
      .orderBy(desc(conversations.updatedAt));
    return c.json(rows);
  });
  app.post(
    "/v1/org/conversations",
    zValidator("json", z.object({ title: z.string().trim().min(1).max(120) })),
    async (c) => {
      const [row] = await deps.db
        .insert(conversations)
        .values({
          orgId: c.get("org").id,
          title: c.req.valid("json").title,
          createdBy: c.get("user").id,
        })
        .returning();
      return c.json(row, 201);
    },
  );
  app.get("/v1/org/conversations/:id", async (c) => {
    const id = uuid.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid conversation" }, 400);
    const orgId = c.get("org").id;
    const [conversation] = await deps.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id.data), eq(conversations.orgId, orgId)))
      .limit(1);
    if (!conversation) return c.json({ error: "Conversation not found" }, 404);
    const [messageRows, runs] = await Promise.all([
      deps.db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, id.data), eq(messages.orgId, orgId)))
        .orderBy(asc(messages.createdAt)),
      deps.db
        .select()
        .from(agentRuns)
        .where(and(eq(agentRuns.conversationId, id.data), eq(agentRuns.orgId, orgId)))
        .orderBy(desc(agentRuns.createdAt)),
    ]);
    return c.json({ conversation, messages: messageRows, runs });
  });
  app.post(
    "/v1/org/conversations/:id/messages",
    zValidator("json", z.object({ content: z.string().trim().min(1).max(20000) })),
    async (c) => {
      const id = uuid.safeParse(c.req.param("id"));
      if (!id.success) return c.json({ error: "Invalid conversation" }, 400);
      const orgId = c.get("org").id;
      const [conversation] = await deps.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, id.data), eq(conversations.orgId, orgId)))
        .limit(1);
      if (!conversation) return c.json({ error: "Conversation not found" }, 404);
      const [active] = await deps.db
        .select({ id: agentRuns.id })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.conversationId, id.data),
            eq(agentRuns.orgId, orgId),
            inArray(agentRuns.status, ["queued", "running"]),
          ),
        )
        .limit(1);
      if (active) return c.json({ error: "Agent is already working in this conversation" }, 409);
      const result = await deps.db.transaction(async (tx) => {
        const [message] = await tx
          .insert(messages)
          .values({
            orgId,
            conversationId: id.data,
            role: "user",
            content: c.req.valid("json").content,
            createdBy: c.get("user").id,
          })
          .returning();
        const [run] = await tx
          .insert(agentRuns)
          .values({ orgId, conversationId: id.data, triggerMessageId: message.id })
          .returning();
        await tx.insert(agentEvents).values({ orgId, runId: run.id, type: "queued" });
        await tx
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, id.data));
        return { message, run };
      });
      return c.json(result, 201);
    },
  );
  app.get("/v1/org/runs/:id/events", async (c) => {
    const id = uuid.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid run" }, 400);
    const orgId = c.get("org").id;
    const [run] = await deps.db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.id, id.data), eq(agentRuns.orgId, orgId)))
      .limit(1);
    if (!run) return c.json({ error: "Run not found" }, 404);
    const events = await deps.db
      .select()
      .from(agentEvents)
      .where(and(eq(agentEvents.runId, id.data), eq(agentEvents.orgId, orgId)))
      .orderBy(asc(agentEvents.createdAt));
    return c.json({ run, events });
  });
  return app;
}
export type AppType = ReturnType<typeof createApp>;
