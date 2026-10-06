import { classFeedback, classMemberships, profiles } from "@contac/core/db";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";

const feedbackInput = z.object({
  kind: z.enum(["ny_funksjonalitet", "justering", "bug_feil"]),
  content: z.string().trim().min(1).max(4000),
});
const idInput = z.uuid();

export function registerFeedbackRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  async function classFor(userId: string, adminOnly = false) {
    const [membership] = await deps.db
      .select({ classId: classMemberships.classId })
      .from(classMemberships)
      .where(
        adminOnly
          ? and(eq(classMemberships.userId, userId), eq(classMemberships.role, "admin"))
          : eq(classMemberships.userId, userId),
      )
      .limit(1);
    return membership?.classId ?? null;
  }

  app.post("/v1/feedback", async (c) => {
    const parsed = feedbackInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Velg type og skriv en tilbakemelding." }, 400);
    const userId = c.get("user").id;
    const classId = await classFor(userId);
    if (!classId) return c.json({ error: "Ingen tilgang til klassen." }, 403);
    const [feedback] = await deps.db
      .insert(classFeedback)
      .values({ classId, userId, ...parsed.data })
      .returning({ id: classFeedback.id });
    return c.json(feedback, 201);
  });

  app.get("/v1/feedback/inbox", async (c) => {
    const userId = c.get("user").id;
    const classId = await classFor(userId);
    if (!classId) return c.json({ error: "Ingen tilgang til klassen." }, 403);
    const rows = await deps.db
      .select({
        id: classFeedback.id,
        kind: classFeedback.kind,
        content: classFeedback.content,
        completedAt: classFeedback.completedAt,
      })
      .from(classFeedback)
      .where(
        and(
          eq(classFeedback.classId, classId),
          eq(classFeedback.userId, userId),
          isNotNull(classFeedback.completedAt),
          isNull(classFeedback.acknowledgedAt),
        ),
      )
      .orderBy(desc(classFeedback.completedAt));
    return c.json(rows);
  });

  app.post("/v1/feedback/inbox/:id/acknowledge", async (c) => {
    const id = idInput.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Ugyldig tilbakemelding." }, 400);
    const userId = c.get("user").id;
    const classId = await classFor(userId);
    if (!classId) return c.json({ error: "Ingen tilgang til klassen." }, 403);
    const [row] = await deps.db
      .update(classFeedback)
      .set({ acknowledgedAt: new Date() })
      .where(
        and(
          eq(classFeedback.id, id.data),
          eq(classFeedback.classId, classId),
          eq(classFeedback.userId, userId),
          isNotNull(classFeedback.completedAt),
          isNull(classFeedback.acknowledgedAt),
        ),
      )
      .returning({ id: classFeedback.id });
    if (!row) return c.json({ error: "Meldingen finnes ikke i innboksen." }, 404);
    return c.json({ ok: true });
  });

  app.get("/v1/class/feedback", async (c) => {
    const classId = await classFor(c.get("user").id, true);
    if (!classId) return c.json({ error: "Class admin access required" }, 403);
    const rows = await deps.db
      .select({
        id: classFeedback.id,
        kind: classFeedback.kind,
        content: classFeedback.content,
        createdAt: classFeedback.createdAt,
        completedAt: classFeedback.completedAt,
        senderName: profiles.fullName,
        senderEmail: profiles.profileEmail,
      })
      .from(classFeedback)
      .leftJoin(profiles, eq(profiles.id, classFeedback.userId))
      .where(eq(classFeedback.classId, classId))
      .orderBy(desc(classFeedback.createdAt));
    return c.json(rows);
  });

  app.post("/v1/class/feedback/:id/complete", async (c) => {
    const id = idInput.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Ugyldig tilbakemelding." }, 400);
    const userId = c.get("user").id;
    const classId = await classFor(userId, true);
    if (!classId) return c.json({ error: "Class admin access required" }, 403);
    const [row] = await deps.db
      .update(classFeedback)
      .set({ completedAt: new Date(), completedBy: userId })
      .where(
        and(
          eq(classFeedback.id, id.data),
          eq(classFeedback.classId, classId),
          isNull(classFeedback.completedAt),
        ),
      )
      .returning({ id: classFeedback.id });
    if (!row) return c.json({ error: "Tilbakemeldingen finnes ikke eller er fullført." }, 409);
    return c.json({ ok: true });
  });
}
