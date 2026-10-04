import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const encryptionKey = () => {
  const secret = process.env.AI_ENCRYPTION_KEY;
  return secret ? createHash("sha256").update(secret).digest() : null;
};
export function encrypt(value: string) {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}
export function decrypt(value: string) {
  const key = encryptionKey();
  if (!key) throw new Error("AI encryption is not configured");
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !ciphertext) throw new Error("Invalid AI token");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
