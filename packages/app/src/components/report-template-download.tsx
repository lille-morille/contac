import { useState, type FormEvent } from "react";
import { downloadOrgFile, request } from "../lib/api.ts";
import { reportNumbersFromTeamName } from "../lib/report-team-name.ts";
import { Button } from "./ui/button.tsx";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog.tsx";
import { Input } from "./ui/input.tsx";
import { Select } from "./ui/select.tsx";

type Draft = {
  caseName: string;
  group: string;
  studyNumber: string;
  authors: { name: string; title: string }[];
};

export function ReportTemplateDownload({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<"nb" | "en">("nb");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function review(language: "nb" | "en") {
    setLanguage(language);
    setOpen(true);
    setDraft(null);
    setError("");
    setBusy(true);
    try {
      const [settings, members] = await Promise.all([
        request<{ businessName: string }>("/org/loi-settings", teamId),
        request<{ fullName: string | null }[]>("/org/members", teamId),
      ]);
      const names = members
        .map((member) => member.fullName?.trim())
        .filter((name): name is string => !!name);
      setDraft({
        caseName: settings.businessName || teamName,
        ...reportNumbersFromTeamName(teamName),
        authors: names.length
          ? names.map((name) => ({ name, title: "" }))
          : [{ name: "", title: "" }],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente teamopplysninger.");
    } finally {
      setBusy(false);
    }
  }

  async function download(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await downloadOrgFile(teamId, "/org/export/report-template.zip", `syretest-${language}.zip`, {
        language,
        ...draft,
      });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke laste ned malen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {(["nb", "en"] as const).map((language) => (
        <Button
          key={language}
          variant="outline"
          disabled={busy}
          onClick={() => void review(language)}
        >
          {language === "nb" ? "Last ned norsk mal" : "Download English template"}
        </Button>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>Se over rapportopplysninger</DialogTitle>
          <DialogDescription>
            Opplysningene fylles inn i project.yaml og kan redigeres etter nedlasting.
          </DialogDescription>
          {!draft && busy && (
            <p role="status" className="mt-4 text-sm">
              Henter teamopplysninger…
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-risk">
              {error}
            </p>
          )}
          {!draft && !busy && (
            <Button className="mt-4" variant="outline" onClick={() => void review(language)}>
              Prøv igjen
            </Button>
          )}
          {draft && (
            <form onSubmit={(event) => void download(event)} className="mt-4 space-y-4">
              <label className="block space-y-1 text-sm">
                Språk
                <Select
                  value={language}
                  onValueChange={(value) => setLanguage(value as "nb" | "en")}
                  items={[
                    { value: "nb", label: "Norsk" },
                    { value: "en", label: "English" },
                  ]}
                  aria-label="Språk"
                  disabled={busy}
                />
              </label>
              {(
                [
                  ["caseName", "Casenavn", 200],
                  ["group", "Gruppe", 100],
                  ["studyNumber", "Syretestnummer", 20],
                ] as const
              ).map(([field, label, maxLength]) => (
                <label key={field} className="block space-y-1 text-sm">
                  {label}
                  <Input
                    required
                    maxLength={maxLength}
                    value={draft[field]}
                    disabled={busy}
                    onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                  />
                </label>
              ))}
              <fieldset disabled={busy} className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Forfattere</legend>
                {draft.authors.map((author, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      required
                      maxLength={200}
                      aria-label={`Forfatter ${index + 1}`}
                      placeholder="Navn"
                      value={author.name}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          authors: draft.authors.map((item, i) =>
                            i === index ? { ...item, name: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <Input
                      maxLength={200}
                      aria-label={`Bakgrunn for forfatter ${index + 1}`}
                      placeholder="Bakgrunn (valgfritt)"
                      value={author.title}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          authors: draft.authors.map((item, i) =>
                            i === index ? { ...item, title: event.target.value } : item,
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={draft.authors.length === 1}
                      aria-label={`Fjern forfatter ${index + 1}`}
                      onClick={() =>
                        setDraft({ ...draft, authors: draft.authors.filter((_, i) => i !== index) })
                      }
                    >
                      Fjern
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={draft.authors.length >= 50}
                  onClick={() =>
                    setDraft({ ...draft, authors: [...draft.authors, { name: "", title: "" }] })
                  }
                >
                  Legg til forfatter
                </Button>
              </fieldset>
              <p className="text-sm text-muted-foreground">
                TIØ4331 · Entreprenørielle muligheter og markedsundersøkelser
                <br />
                Forsiden viser automatisk datoen PDF-en kompileres.
              </p>
              <Button type="submit" disabled={busy}>
                {busy ? "Lager nedlasting…" : "Last ned mal"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
