import { Camera } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { profileAvatarUrl, request, uploadProfileAvatar } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";

export function ProfileEditor({ onboarding = false }: { onboarding?: boolean }) {
  const state = useOrg();
  const queryClient = useQueryClient();
  const [name, setName] = useState(state.user?.name ?? "");
  const [email, setEmail] = useState(state.user?.email ?? "");
  const [avatarPath, setAvatarPath] = useState(state.user?.avatarPath ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function upload(file: File) {
    setError("");
    setSaved(false);
    if (file.size > 5 * 1024 * 1024 || file.size === 0) {
      setError("Velg et bilde under 5 MiB.");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadProfileAvatar(file);
      setAvatarPath(result.avatarPath);
      await state.refresh();
      await queryClient.invalidateQueries({ queryKey: ["contact-data"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUploading(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (onboarding && !/^\S+\s+\S+/.test(name.trim())) {
      setError("Skriv inn fullt navn, med både fornavn og etternavn.");
      return;
    }
    if (onboarding && !avatarPath) {
      setError("Legg til et profilbilde før du fortsetter.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await request("/profile", undefined, { name, email });
      await state.refresh();
      await queryClient.invalidateQueries({ queryKey: ["contact-data"] });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold">
        {onboarding ? "Fullfør profilen din" : "Profilopplysninger"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {onboarding
          ? "Full navn, e-post og profilbilde må være på plass før du kan åpne arbeidsområdet."
          : "Disse opplysningene vises til andre i klassen der du deltar."}
      </p>
      <div className="mt-5 flex items-center gap-4">
        <Avatar name={name || "Bruker"} src={profileAvatarUrl(avatarPath)} className="size-16" />
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium shadow-sm transition-colors hover:border-primary/25 hover:bg-muted/60 focus-within:ring-2 focus-within:ring-ring/50">
          <Camera size={16} />
          {uploading
            ? "Laster opp …"
            : avatarPath
              ? "Bytt profilbilde"
              : onboarding
                ? "Last opp profilbilde *"
                : "Last opp profilbilde"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy || uploading}
            aria-label="Velg profilbilde"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">PNG, JPEG eller WebP · maks 5 MiB</p>
      <form className="mt-5 space-y-4" onSubmit={(event) => void save(event)}>
        <label className="block space-y-1 text-sm">
          <span>{onboarding ? "Full navn *" : "Navn *"}</span>
          <Input
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
          />
          {onboarding && (
            <span className="block text-xs text-muted-foreground">Skriv fornavn og etternavn.</span>
          )}
        </label>
        <label className="block space-y-1 text-sm">
          <span>E-post *</span>
          <Input
            required
            type="email"
            maxLength={320}
            autoComplete="email"
            aria-describedby="profile-email-help"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <p id="profile-email-help" className="text-xs text-muted-foreground">
          Denne adressen brukes som Fra-adresse i e-postutkast og til å knytte Bcc-kopier til
          kontoen din. Bruk samme adresse i e-postklienten. Du logger inn med gjenopprettingskoden,
          ikke e-post.
        </p>
        {error && (
          <p role="alert" className="text-sm text-risk">
            {error}
          </p>
        )}
        {saved && !onboarding && (
          <p role="status" className="text-sm text-ok">
            Profilen er lagret.
          </p>
        )}
        <Button
          type="submit"
          disabled={
            busy || uploading || (onboarding && !avatarPath) || !name.trim() || !email.trim()
          }
        >
          {busy ? "Lagrer …" : onboarding ? "Fullfør og åpne arbeidsområdet" : "Lagre profil"}
        </Button>
      </form>
    </Card>
  );
}
