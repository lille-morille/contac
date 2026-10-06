export type { Database } from "./db/client.ts";
export { CONTACT_DESCRIPTION_MAX_LENGTH } from "./contact-description.ts";
export { isActivityAiEligible } from "./checkin.ts";
export { normalizeEmail, emailList, sameEmailSet, contactMatchesEmail } from "./email.ts";
export { contactsOverlap } from "./contact-overlap.ts";
export { buildContactExport } from "./contact-export.ts";
export type { ExportActivity, ExportContact } from "./contact-export.ts";
export type { InferSelectModel } from "drizzle-orm";
