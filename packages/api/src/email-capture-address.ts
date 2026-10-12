export function emailCaptureAddress(inboundKey: string | null): string | null {
  const common = process.env.INBOUND_ADDRESS?.trim().toLowerCase();
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase();
  return common || (domain && inboundKey ? `inbox+${inboundKey}@${domain}` : null);
}
