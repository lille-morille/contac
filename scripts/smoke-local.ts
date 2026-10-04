import { createClient } from "@supabase/supabase-js";

const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!sbUrl || !sbKey) throw new Error("Local Supabase env is missing");
const api = `http://127.0.0.1:${process.env.API_PORT ?? 8787}`;
const password = "local-smoke-password-1234";

async function makeUser(email = `smoke-${crypto.randomUUID()}@example.test`) {
  const sb = createClient(sbUrl!, sbKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error || !data.session) throw new Error(`Signup failed: ${error?.message ?? "no session"}`);
  return data.session.access_token;
}
async function call<T>(
  path: string,
  token: string,
  orgId?: string,
  body?: BodyInit,
  contentType?: string,
): Promise<T> {
  const response = await fetch(`${api}/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(orgId ? { "x-org-id": orgId } : {}),
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}
const json = (body: unknown) => JSON.stringify(body);
const a = await makeUser();
await call("/me", a);
const org = await call<{ id: string }>(
  "/organizations",
  a,
  undefined,
  json({ name: "Smoke Workspace" }),
  "application/json",
);
const realtime = createClient(sbUrl!, sbKey!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await realtime.realtime.setAuth(a);
let resolveEvent!: () => void;
const event = new Promise<void>((resolve) => {
  resolveEvent = resolve;
});
const channel = realtime
  .channel(`smoke-${crypto.randomUUID()}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "agent_runs", filter: `org_id=eq.${org.id}` },
    () => resolveEvent(),
  );
await new Promise<void>((resolve, reject) => {
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") resolve();
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
      reject(new Error(`Realtime ${status}`));
  });
});
await new Promise((resolve) => setTimeout(resolve, 2000));
const conversation = await call<{ id: string }>(
  "/org/conversations",
  a,
  org.id,
  json({ title: "Smoke conversation" }),
  "application/json",
);
await call(
  `/org/conversations/${conversation.id}/messages`,
  a,
  org.id,
  json({ content: "Hello agent" }),
  "application/json",
);
await Promise.race([
  event,
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Realtime insert was not delivered")), 10000),
  ),
]);
await realtime.removeChannel(channel);
realtime.realtime.disconnect();
const detail = await call<{ messages: unknown[]; runs: Array<{ status: string }> }>(
  `/org/conversations/${conversation.id}`,
  a,
  org.id,
);
if (detail.messages.length !== 1 || detail.runs[0]?.status !== "queued")
  throw new Error("Agent enqueue failed");
const form = new FormData();
form.set("file", new File(["smoke"], "smoke.txt", { type: "text/plain" }));
const file = await call<{ id: string }>("/org/files", a, org.id, form);
const signed = await call<{ url: string }>(`/org/files/${file.id}/url`, a, org.id);
if (!signed.url) throw new Error("Signed file URL missing");
const downloaded = await fetch(signed.url);
if (!downloaded.ok || (await downloaded.text()) !== "smoke")
  throw new Error("Signed file download failed");
const inviteeEmail = `smoke-${crypto.randomUUID()}@example.test`;
const b = await makeUser(inviteeEmail);
await call("/me", b);
const beforeInvite = await fetch(`${api}/v1/org/conversations`, {
  headers: { Authorization: `Bearer ${b}`, "x-org-id": org.id },
});
if (beforeInvite.status !== 403) throw new Error(`Uninvited user returned ${beforeInvite.status}`);
const invite = await call<{ inviteUrl: string }>(
  "/org/invitations",
  a,
  org.id,
  json({ email: inviteeEmail, role: "member" }),
  "application/json",
);
const token = new URL(invite.inviteUrl).searchParams.get("token");
if (!token) throw new Error("Invitation token missing");
await call("/invitations/accept", b, undefined, json({ token }), "application/json");
const shared = await call<Array<unknown>>("/org/conversations", b, org.id);
if (shared.length !== 1) throw new Error("Invitation did not grant member access");
const outsider = await makeUser();
await call("/me", outsider);
const forbidden = await fetch(`${api}/v1/org/conversations`, {
  headers: { Authorization: `Bearer ${outsider}`, "x-org-id": org.id },
});
if (forbidden.status !== 403) throw new Error(`Cross-org API request returned ${forbidden.status}`);
console.log(
  "Local smoke passed: signup, org, invitation, conversation, Realtime, run queue, private file download, cross-org denial",
);
