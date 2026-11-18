import { createHash, randomBytes } from "node:crypto";
import { invitations, organizations, personTags, type Database } from "@contac/core/db";

/** Person tags every new team starts with. */
const DEFAULT_PERSON_TAGS = ["Portvokter", "Ildsjel", "Bruker", "Beslutningstaker"];

export const hashInvitationToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Normalizes a team name for duplicate checks within a class. */
export const normalizeTeamName = (value: string) =>
  value.trim().normalize("NFKC").toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");

function teamSlug(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Creates a team in a class with the default person tags. */
export async function createClassTeam(
  db: Pick<Database, "transaction">,
  classId: string,
  name: string,
) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(organizations)
      .values({ name, slug: teamSlug(name), classId })
      .returning();
    await tx.insert(personTags).values(
      DEFAULT_PERSON_TAGS.map((tag) => ({
        orgId: created.id,
        name: tag,
        normalizedName: tag.toLocaleLowerCase("nb-NO"),
      })),
    );
    return created;
  });
}

/** Creates a reusable team invitation link, as the team settings page does. */
export async function createTeamInviteLink(
  db: Pick<Database, "insert">,
  appOrigin: string,
  orgId: string,
  invitedBy: string,
) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(invitations).values({
    orgId,
    email: null,
    role: "admin",
    tokenHash: hashInvitationToken(token),
    invitedBy,
  });
  return `${appOrigin}/invite?token=${encodeURIComponent(token)}`;
}
