import { Phone, PhoneCall } from "lucide-react";
import { Badge } from "./ui/badge.tsx";

export const contactStatuses = [
  ["ikke_kontaktet", "Ikke kontaktet"],
  ["skal_ringe", "Skal ringe"],
  ["follow_up", "Follow up / Ring igjen"],
  ["venter_pa_svar", "Venter på svar"],
  ["kan_kontaktes_igjen", "Kan kontaktes igjen"],
  ["avsluttet", "Avsluttet"],
  ["ikke_kontakt_igjen", "Ikke kontakt igjen"],
] as const;

export type ContactStatus = (typeof contactStatuses)[number][0] | "duplicate";

export function contactStatusName(status: ContactStatus) {
  return contactStatuses.find(([value]) => value === status)?.[1] ?? "Duplikat";
}

export function contactStatusColor(status: ContactStatus) {
  const colors: Record<ContactStatus, string> = {
    ikke_kontaktet: "var(--muted-foreground)",
    skal_ringe: "var(--warn)",
    follow_up: "var(--ok)",
    venter_pa_svar: "var(--mint)",
    kan_kontaktes_igjen: "var(--blue)",
    avsluttet: "var(--primary)",
    ikke_kontakt_igjen: "var(--risk)",
    duplicate: "var(--muted-foreground)",
  };
  return colors[status];
}

export function ContactStatusIcon({ status, size = 16 }: { status: ContactStatus; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    "aria-hidden": true as const,
    style: { color: contactStatusColor(status), flexShrink: 0 },
  };
  if (status === "ikke_kontaktet")
    return (
      <svg {...common}>
        <circle
          cx="10"
          cy="10"
          r="7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeDasharray="1.6 2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  if (status === "skal_ringe")
    return (
      <Phone
        size={size}
        strokeWidth={2}
        aria-hidden
        style={{ color: contactStatusColor(status), flexShrink: 0 }}
      />
    );
  if (status === "follow_up")
    return (
      <PhoneCall
        size={size}
        strokeWidth={2}
        aria-hidden
        style={{ color: contactStatusColor(status), flexShrink: 0 }}
      />
    );
  if (status === "venter_pa_svar")
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M10 5.7v4.5l-2.5 2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="1.1" fill="currentColor" />
      </svg>
    );
  if (status === "kan_kontaktes_igjen")
    return (
      <svg {...common}>
        <path
          d="M15.9 8.4a6.1 6.1 0 1 0 .2 3.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12.9 7.8h3.2V4.6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (status === "avsluttet")
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7.2" fill="currentColor" />
        <path
          d="m6.4 10.2 2.4 2.4 4.8-5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (status === "ikke_kontakt_igjen")
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="7.2" fill="currentColor" />
        <path d="m7.5 7.5 5 5m0-5-5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="7.2" fill="currentColor" />
      <path
        d="m5.4 12.9 7.5-7.5m-3.8 9.1 5.4-5.4"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  const variants = {
    ikke_kontaktet: "neutral",
    skal_ringe: "warn",
    follow_up: "ok",
    venter_pa_svar: "ok",
    kan_kontaktes_igjen: "info",
    avsluttet: "default",
    ikke_kontakt_igjen: "risk",
    duplicate: "neutral",
  } as const;
  return (
    <Badge variant={variants[status]}>
      <ContactStatusIcon status={status} />
      {contactStatusName(status)}
    </Badge>
  );
}
