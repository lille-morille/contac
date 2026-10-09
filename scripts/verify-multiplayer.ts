import assert from "node:assert/strict";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { createDb } from "../packages/core/src/db/client.ts";
import { createApp } from "../packages/api/src/app.ts";
import * as Y from "../packages/api/node_modules/yjs/dist/yjs.mjs";

const url = process.env.SUPABASE_URL!;
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { db, client } = createDb(process.env.DATABASE_URL!, 5);
const app = createApp({ db, supabase: admin }, process.env.APP_ORIGIN ?? "http://localhost:3000");
const clients: SupabaseClient[] = [];
const users: string[] = [];
const teams: string[] = [];
const suffix = crypto.randomUUID().slice(0, 8);
const password = `multiplayer-${crypto.randomUUID()}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function member(name: string) {
  const email = `${suffix}-${name}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(error);
  assert(data.user);
  users.push(data.user.id);
  await client`INSERT INTO public.profiles (id,email,full_name,profile_email,onboarded_at)
    VALUES (${data.user.id},${email},${name},${email},now())`;
  const sb = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await sb.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  assert(login.data.session);
  await sb.realtime.setAuth(login.data.session.access_token);
  clients.push(sb);
  return { id: data.user.id, sb, token: login.data.session.access_token };
}
async function call(token: string, teamId: string, path: string, body?: unknown) {
  const result = await app.request(`/v1/org${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-org-id": teamId,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: result.status, body: (await result.json()) as Record<string, unknown> };
}
async function subscribe(sb: SupabaseClient, topic: string, onEvent: (data: unknown) => void) {
  const channel = sb.channel(topic, { config: { private: true, presence: { enabled: true } } });
  channel.on("broadcast", { event: "changed" }, (event) => onEvent(event.payload));
  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 10_000);
    channel.subscribe((next) => {
      if (next === "SUBSCRIBED" || next === "CHANNEL_ERROR" || next === "TIMED_OUT") {
        clearTimeout(timer);
        resolve(next);
      }
    });
  });
  return { channel, status };
}
async function waitFor(events: Record<string, unknown>[], entity: string, operation = "insert") {
  for (let n = 0; n < 50; n++) {
    if (events.some((event) => event.entity === entity && event.operation === operation)) return;
    await pause(100);
  }
  throw new Error(`No ${operation} ${entity} signal`);
}
async function waitForNext(
  events: Record<string, unknown>[],
  entity: string,
  operation: string,
  previous: number,
) {
  for (let n = 0; n < 50; n++) {
    if (
      events.filter((event) => event.entity === entity && event.operation === operation).length >
      previous
    )
      return;
    await pause(100);
  }
  throw new Error(`No later ${operation} ${entity} signal`);
}

try {
  const [space] = await client`SELECT id FROM public.class_spaces LIMIT 1`;
  assert(space, "A local class must exist");
  const a = await member("multiplayer-a");
  const b = await member("multiplayer-b");
  const outsider = await member("multiplayer-outside");
  for (const name of ["alpha", "beta"]) {
    const [team] = await client`INSERT INTO public.organizations (class_id,name,slug)
      VALUES (${space.id},${`Test ${name}`},${`multiplayer-${suffix}-${name}`}) RETURNING id`;
    teams.push(team.id);
  }
  await client`INSERT INTO public.memberships (org_id,user_id,role) VALUES
    (${teams[0]},${a.id},'admin'), (${teams[0]},${b.id},'member'),
    (${teams[1]},${outsider.id},'member')`;
  const aEvents: Record<string, unknown>[] = [];
  const bEvents: Record<string, unknown>[] = [];
  const otherEvents: Record<string, unknown>[] = [];
  const aChannel = await subscribe(a.sb, `team:${teams[0]}`, (e) =>
    aEvents.push(e as Record<string, unknown>),
  );
  const bChannel = await subscribe(b.sb, `team:${teams[0]}`, (e) =>
    bEvents.push(e as Record<string, unknown>),
  );
  const otherChannel = await subscribe(outsider.sb, `team:${teams[1]}`, (e) =>
    otherEvents.push(e as Record<string, unknown>),
  );
  assert.equal(aChannel.status, "SUBSCRIBED");
  assert.equal(bChannel.status, "SUBSCRIBED");
  assert.equal(otherChannel.status, "SUBSCRIBED");
  await bChannel.channel
    .send({
      type: "broadcast",
      event: "changed",
      payload: {
        teamId: teams[0],
        entity: "contacts",
        id: "forged",
        operation: "delete",
        revision: "forged",
      },
    })
    .catch(() => "error");
  await pause(350);
  assert(
    !aEvents.some((event) => event.id === "forged"),
    "A client must not forge authoritative change signals",
  );
  const wrongChannel = await subscribe(outsider.sb, `team:${teams[0]}`, () => {
    throw new Error("Cross-team signal leaked");
  });
  assert.notEqual(wrongChannel.status, "SUBSCRIBED");
  const rolledBackId = crypto.randomUUID();
  await client
    .begin(async (tx) => {
      await tx`INSERT INTO public.companies (id, org_id, name, normalized_name)
      VALUES (${rolledBackId}, ${teams[0]}, 'Rolled back', ${`rolled-back-${suffix}`})`;
      throw new Error("intentional rollback");
    })
    .catch((cause) => {
      assert.equal((cause as Error).message, "intentional rollback");
    });
  await pause(350);
  assert(
    !aEvents.some((event) => event.id === rolledBackId),
    "A rolled-back write must not produce a change signal",
  );
  const company = await call(a.token, teams[0], "/companies", { name: "Multiplayer Test AS" });
  assert.equal(company.status, 201);
  await waitFor(aEvents, "companies");
  await waitFor(bEvents, "companies");
  assert(!otherEvents.some((event) => event.entity === "companies"));
  const contact = await call(a.token, teams[0], "/contacts", {
    name: "Multiplayer Person",
    companyId: company.body.id,
  });
  assert.equal(contact.status, 201);
  await waitFor(bEvents, "contacts");
  const contactId = String(contact.body.id);
  const second = await call(b.token, teams[0], "/contacts", {
    name: "Second Person",
    companyId: company.body.id,
    email: `incoming-${suffix}@example.test`,
  });
  assert.equal(second.status, 201);
  const inboxCount = bEvents.filter((event) => event.entity === "inbound_suggestions").length;
  const webhook = await app.request("/webhooks/inbound-email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.INBOUND_WEBHOOK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      providerMessageId: `multiplayer-${suffix}`,
      fromEmail: `external-${suffix}@example.test`,
      toEmails: [`incoming-${suffix}@example.test`],
      ccEmails: [],
      bccEmails: [],
      subject: "Test",
      body: "Webhook notification",
    }),
  });
  assert.equal(webhook.status, 202);
  await waitForNext(bEvents, "inbound_suggestions", "insert", inboxCount);
  assert(!otherEvents.some((event) => event.entity === "inbound_suggestions"));
  const tag = await call(a.token, teams[0], "/person-tags", {
    name: "Multiplayer test tag",
    description: "Used for verifying shared tag updates.",
  });
  assert.equal(tag.status, 201);
  assert.equal(
    (
      await call(a.token, teams[0], `/contacts/${contactId}/tags`, {
        tagIds: [tag.body.id],
        expected: { tagIds: [] },
      })
    ).status,
    200,
  );
  const staleTags = await call(b.token, teams[0], `/contacts/${contactId}/tags`, {
    tagIds: [],
    expected: { tagIds: [] },
  });
  assert.equal(staleTags.status, 409);
  assert.deepEqual((staleTags.body.current as Record<string, unknown>).tagIds, [tag.body.id]);
  assert.equal(
    await bChannel.channel.track({ userId: b.id, contactId, editingId: "note:" + contactId }),
    "ok",
  );
  for (
    let n = 0;
    n < 40 &&
    !Object.values(aChannel.channel.presenceState())
      .flat()
      .some((row) => (row as Record<string, unknown>).userId === b.id);
    n++
  )
    await pause(100);
  assert(
    Object.values(aChannel.channel.presenceState())
      .flat()
      .some((row) => (row as Record<string, unknown>).userId === b.id),
    "Teammate presence should be visible",
  );
  assert.equal((await call(outsider.token, teams[0], "/contact-data?part=core")).status, 403);
  assert.equal(
    (
      await call(b.token, teams[0], `/contacts/${contactId}`, {
        name: "Teammate edit",
        expected: { name: "Multiplayer Person" },
      })
    ).status,
    200,
  );
  const stale = await call(a.token, teams[0], `/contacts/${contactId}`, {
    name: "Stale edit",
    expected: { name: "Multiplayer Person" },
  });
  assert.equal(stale.status, 409);
  assert.equal((stale.body.current as Record<string, unknown>).name, "Teammate edit");
  assert.equal(
    (
      await call(a.token, teams[0], `/contacts/${contactId}`, {
        description: "Analytiker",
        expected: { description: null },
      })
    ).status,
    200,
    "An unrelated field must still save",
  );
  assert.equal(
    (
      await call(a.token, teams[0], `/contacts/${contactId}`, {
        status: "skal_ringe",
        expected: { status: "ikke_kontaktet" },
      })
    ).status,
    200,
    "Moving a contact must save",
  );
  const linkCount = bEvents.filter((event) => event.entity === "activity_contacts").length;
  const activity = await call(a.token, teams[0], "/activities", {
    contactIds: [contactId, second.body.id],
    kind: "meeting",
    summary: "Shared meeting",
    transcript: "First transcript",
  });
  assert.equal(activity.status, 201);
  await waitForNext(bEvents, "activity_contacts", "insert", linkCount);
  const activityId = String(activity.body.id);
  assert.equal(
    (
      await call(b.token, teams[0], `/activities/${activityId}`, {
        occurredAt: "2026-01-01T12:00:00.000Z",
        expected: { occurredAt: activity.body.occurredAt },
      })
    ).status,
    200,
  );
  for (const field of ["summary", "transcript"] as const) {
    const current = await call(a.token, teams[0], `/collab/${field}/${activityId}`);
    assert.equal(current.status, 200);
    const activityDoc = new Y.Doc();
    Y.applyUpdate(activityDoc, Buffer.from(String(current.body.state), "base64"));
    const before = Y.encodeStateVector(activityDoc);
    activityDoc.getText("content").insert(0, "Live: ");
    const changed = await call(b.token, teams[0], `/collab/${field}/${activityId}`, {
      update: Buffer.from(Y.encodeStateAsUpdate(activityDoc, before)).toString("base64"),
    });
    assert.equal(changed.status, 200);
    assert.match(String(changed.body.text), /^Live:/);
    activityDoc.destroy();
  }
  const deleteCount = bEvents.filter(
    (event) => event.entity === "contact_activities" && event.operation === "delete",
  ).length;
  assert.equal((await call(a.token, teams[0], `/activities/${activityId}/delete`, {})).status, 200);
  await waitForNext(bEvents, "contact_activities", "delete", deleteCount);
  const note = await call(a.token, teams[0], `/contacts/${contactId}/note`, {
    text: "Start",
    expectedSavedAt: null,
  });
  assert.equal(note.status, 200);
  const snapshot = await call(a.token, teams[0], `/collab/note/${contactId}`);
  assert.equal(snapshot.status, 200);
  const docEvents: Record<string, unknown>[] = [];
  const docChannel = b.sb.channel(`doc:${teams[0]}:note:${contactId}`, {
    config: { private: true },
  });
  docChannel.on("broadcast", { event: "update" }, (event) =>
    docEvents.push(event.payload as Record<string, unknown>),
  );
  assert.equal(
    await new Promise<string>((resolve) =>
      docChannel.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") resolve(status);
      }),
    ),
    "SUBSCRIBED",
  );
  const deniedDoc = outsider.sb.channel(`doc:${teams[0]}:note:${contactId}`, {
    config: { private: true },
  });
  assert.notEqual(
    await new Promise<string>((resolve) =>
      deniedDoc.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") resolve(status);
      }),
    ),
    "SUBSCRIBED",
  );
  const initial = new Uint8Array(Buffer.from(String(snapshot.body.state), "base64"));
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  Y.applyUpdate(docA, initial);
  Y.applyUpdate(docB, initial);
  const beforeA = Y.encodeStateVector(docA);
  const beforeB = Y.encodeStateVector(docB);
  docA.getText("content").insert(5, " A");
  docB.getText("content").insert(5, " B");
  const [editA, editB] = await Promise.all([
    call(a.token, teams[0], `/collab/note/${contactId}`, {
      update: Buffer.from(Y.encodeStateAsUpdate(docA, beforeA)).toString("base64"),
    }),
    call(b.token, teams[0], `/collab/note/${contactId}`, {
      update: Buffer.from(Y.encodeStateAsUpdate(docB, beforeB)).toString("base64"),
    }),
  ]);
  assert.equal(editA.status, 200);
  assert.equal(editB.status, 200);
  for (let n = 0; n < 40 && docEvents.length === 0; n++) await pause(100);
  assert(docEvents.length > 0, "A second editor must receive CRDT updates");
  const latest = await call(b.token, teams[0], `/contact-data?part=core`);
  const result = (latest.body.contacts as Record<string, unknown>[]).find(
    (row) => row.id === contactId,
  )!;
  assert.match(String(result.sharedNote), / A/);
  assert.match(String(result.sharedNote), / B/);
  const loi = await call(a.token, teams[0], "/lois", { companyId: company.body.id });
  assert.equal(loi.status, 201);
  const loiId = String(loi.body.id);
  const section = (loi.body.sections as { id: string; title: string; body: string }[])[0];
  assert(section.id);
  const sectionSnapshot = await call(a.token, teams[0], `/collab/loi-section/${section.id}`);
  assert.equal(sectionSnapshot.status, 200);
  const loiDoc = new Y.Doc();
  Y.applyUpdate(loiDoc, Buffer.from(String(sectionSnapshot.body.state), "base64"));
  const loiBefore = Y.encodeStateVector(loiDoc);
  loiDoc.getText("content").insert(0, "Samarbeid: ");
  assert.equal(
    (
      await call(b.token, teams[0], `/collab/loi-section/${section.id}`, {
        update: Buffer.from(Y.encodeStateAsUpdate(loiDoc, loiBefore)).toString("base64"),
      })
    ).status,
    200,
  );
  const loiSave = await call(a.token, teams[0], `/lois/${loiId}`, {
    ourSignerName: loi.body.ourSignerName,
    counterpartySignerName: loi.body.counterpartySignerName,
    documentDate: "5.10.2026",
    variables: loi.body.variables,
    sections: loi.body.sections,
    expected: {
      ourSignerName: loi.body.ourSignerName,
      counterpartySignerName: loi.body.counterpartySignerName,
      documentDate: loi.body.documentDate,
      variables: loi.body.variables,
      sections: loi.body.sections,
    },
  });
  assert.equal(loiSave.status, 200);
  assert.match(String((loiSave.body.sections as { body: string }[])[0].body), /^Samarbeid:/);
  assert.equal((await call(a.token, teams[0], `/collab/loi-signature/${loiId}`)).status, 200);
  const updateCount = bEvents.filter(
    (event) => event.entity === "contacts" && event.operation === "update",
  ).length;
  await client`UPDATE public.contacts SET description = 'Bakgrunnsjobb' WHERE id = ${contactId}`;
  await waitForNext(bEvents, "contacts", "update", updateCount);
  await b.sb.removeChannel(bChannel.channel);
  await client`UPDATE public.contacts SET description = 'Etter frakobling' WHERE id = ${contactId}`;
  const reconnected = await subscribe(b.sb, `team:${teams[0]}`, () => {});
  assert.equal(reconnected.status, "SUBSCRIBED");
  const recovered = await call(b.token, teams[0], "/contact-data?part=core");
  assert.equal(
    (recovered.body.contacts as Record<string, unknown>[]).find((row) => row.id === contactId)
      ?.description,
    "Etter frakobling",
  );
  assert.equal((await call(b.token, teams[0], "/contact-data?part=core")).status, 200);
  await Promise.all(clients.map((sb) => sb.removeAllChannels()));
  console.log(
    "Multiplayer verification passed: team signal authorization/isolation, create/edit/move/link/delete, webhook inbox signal, Presence, collaborative note/summary/transcript/LOI text, scalar/tag/view conflicts, direct DB changes, and reconnect/API recovery.",
  );
} finally {
  await Promise.all(clients.map((sb) => sb.removeAllChannels().catch(() => {})));
  for (const teamId of teams) await client`DELETE FROM public.organizations WHERE id = ${teamId}`;
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
  await client.end();
}
