import { createClient } from "@supabase/supabase-js";
import { createDb } from "../packages/core/src/db/client.ts";
import { createApp } from "../packages/api/src/app.ts";

const url = process.env.DATABASE_URL;
const sbUrl = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const setupCode = process.env.CLASS_SETUP_CODE;
if (!url || !sbUrl || !secret || !publishable || !setupCode) throw new Error("Local environment is incomplete");
const { db, client } = createDb(url, 2);
const existing = await client`SELECT id FROM public.class_spaces LIMIT 1`;
if (existing.length) throw new Error("Smoke test requires an empty class database; existing data was not changed");
const adminClient = createClient(sbUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const app = createApp({ db, supabase: adminClient, setupCode }, "http://localhost:3000");
const createdUsers: string[] = [];
let classId: string | null = null;
const send = async <T>(path: string, body?: unknown, token?: string, orgId?: string): Promise<T> => {
  const response = await app.request(`/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { "x-org-id": orgId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(json)}`);
  return json as T;
};
const login = async (code: string) => {
  const match = /^cc1\.([\da-f-]{36})\.([A-Za-z0-9_-]+)$/.exec(code);
  if (!match) throw new Error("Invalid issued recovery code");
  const sb = createClient(sbUrl, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: `${match[1]}@accounts.contac.invalid`, password: match[2] });
  if (error || !data.session || !data.user) throw new Error(`Could not log in: ${error?.message}`);
  createdUsers.push(data.user.id);
  return { id: data.user.id, token: data.session.access_token };
};
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
try {
  const setup = await send<{ recoveryCode: string }>("/setup", { setupCode, className: "Smoke Test", name: "Smoke Admin" });
  const [space] = await client`SELECT id FROM public.class_spaces LIMIT 1`;
  classId = space.id;
  const admin = await login(setup.recoveryCode);
  const team = await send<{ id: string }>("/organizations", { name: "Smoke Team" }, admin.token);
  const secondTeam = await send<{ id: string }>("/organizations", { name: "Other Smoke Team" }, admin.token);
  const invitation = await send<{ inviteUrl: string }>("/org/invitations", { role: "member" }, admin.token, team.id);
  const inviteToken = new URL(invitation.inviteUrl).searchParams.get("token");
  assert(inviteToken, "Invitation lacked token");
  const joined = await send<{ recoveryCode: string }>("/invitations/join", { token: inviteToken, name: "Smoke Member" });
  const member = await login(joined.recoveryCode);
  const createDenied = await app.request("/v1/organizations", { method: "POST", headers: { Authorization: `Bearer ${member.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Unauthorized Team" }) });
  assert(createDenied.status === 403, "Member could create a team");
  const denied = await app.request("/v1/org/contact-data", { headers: { Authorization: `Bearer ${member.token}`, "x-org-id": secondTeam.id } });
  assert(denied.status === 403, "Member could read another team");
  const company = await send<{ id: string }>("/org/companies", { name: "Example AS" }, admin.token, team.id);
  const first = await send<{ id: string; assigneeId: string | null }>("/org/contacts", { name: "Kari Eksempel", companyId: company.id, email: "kari@example.test" }, admin.token, team.id);
  assert(first.assigneeId === null, "New backlog contact was assigned");
  const moved = await send<{ assigneeId: string }>(`/org/contacts/${first.id}`, { status: "skal_ringe" }, member.token, team.id);
  assert(moved.assigneeId === member.id, "First status mover did not become assignee");
  const edited = await send<{ assigneeId: string }>(`/org/contacts/${first.id}`, { phone: "+47 1234 5678" }, admin.token, team.id);
  assert(edited.assigneeId === member.id, "Other editor took assignment");
  const duplicate = await send<{ id: string }>("/org/contacts", { name: "Kari Eksempel", companyId: company.id }, admin.token, team.id);
  const otherCompany = await send<{ id: string }>("/org/companies", { name: "Other AS" }, admin.token, team.id);
  const phoneMatch = await send<{ id: string }>("/org/contacts", { name: "Different Name", companyId: otherCompany.id, phone: "12345678" }, admin.token, team.id);
  const emailMatch = await send<{ id: string }>("/org/contacts", { name: "Another Name", companyId: otherCompany.id, email: "kari@example.test" }, admin.token, team.id);
  const third = await send<{ id: string }>("/org/contacts", { name: "Ola Annen", companyId: company.id }, admin.token, team.id);
  const activity = await send<{ id: string }>("/org/activities", { contactIds: [duplicate.id, third.id], kind: "meeting", summary: "Met together" }, admin.token, team.id);
  const suggestions = await send<{ id: string }[]>(`/org/contacts/${first.id}/duplicates`, undefined, admin.token, team.id);
  assert(suggestions.some(x => x.id === duplicate.id), "Duplicate suggestion missing");
  assert(suggestions.some(x => x.id === phoneMatch.id), "Normalized phone duplicate suggestion missing");
  assert(suggestions.some(x => x.id === emailMatch.id), "Email duplicate suggestion missing");
  await send("/org/duplicates/merge", { primaryId: first.id, duplicateId: duplicate.id, fields: [], activityIds: [activity.id] }, admin.token, team.id);
  const data = await send<{ contacts: { id: string; status: string; duplicateOfId: string | null }[]; activityContacts: { contactId: string; activityId: string }[] }>("/org/contact-data", undefined, admin.token, team.id);
  assert(data.contacts.find(x => x.id === duplicate.id)?.status === "duplicate", "Duplicate was not archived");
  const links = data.activityContacts.filter(x => x.activityId === activity.id).map(x => x.contactId);
  assert(links.includes(first.id) && links.includes(third.id) && !links.includes(duplicate.id), "Activity links did not move correctly");
  console.log("Contact smoke test passed: setup, invite, login, team isolation, assignment, duplicate merge");
} finally {
  if (classId) {
    await client`DELETE FROM public.organizations WHERE class_id = ${classId}`;
    await client`DELETE FROM public.class_spaces WHERE id = ${classId}`;
  }
  for (const id of createdUsers) await adminClient.auth.admin.deleteUser(id);
  await client.end();
}
