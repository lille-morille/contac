import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, FileText, Plus, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, request, uploadFile } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog.tsx";
import { FreeTextCombobox } from "./ui/free-text-combobox.tsx";
import { Input } from "./ui/input.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { LiveText } from "./live-text.tsx";

type Section = { id: string; title: string; body: string };
type LoiVariables = {
  documentTitle: string;
  subtitle: string;
  projectName: string;
  ourSignerRole: string;
  counterpartySignerRole: string;
  signatureNote: string;
};
type Loi = {
  id: string;
  companyId: string;
  ourSignerName: string;
  counterpartySignerName: string;
  documentDate: string;
  variables: LoiVariables;
  sections: Section[];
  sentAt: string | null;
  sentBy: string | null;
  sentVersionId: string | null;
  createdAt: string;
};
type Version = {
  id: string;
  loiId: string;
  kind: "generated" | "signed";
  label: string;
  fileId: string;
  createdAt: string;
};
type LastSent = {
  id: string;
  companyName: string;
  senderName: string | null;
  sentAt: string;
  fileId: string | null;
};
type Company = {
  id: string;
  name: string;
  status: string;
  loiLogoFileId?: string | null;
  loiLogoUrl?: string | null;
};

export function LoiPanel({
  company,
  members,
  contacts,
}: {
  company: Company;
  members: { userId: string; name: string | null }[];
  contacts: { id: string; name: string }[];
}) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Loi> | null>(null);
  const [base, setBase] = useState<Loi | null>(null);
  const [conflict, setConflict] = useState<{ local: Loi; remote: Loi; fields: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [suggestStatus, setSuggestStatus] = useState(false);
  const list = useQuery({
    queryKey: ["lois", org?.id, company.id],
    queryFn: () =>
      request<{ lois: Loi[]; versions: Version[] }>(`/org/lois?companyId=${company.id}`, org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const previous = useQuery({
    queryKey: ["loi-last-sent", org?.id],
    queryFn: () => request<LastSent | null>("/org/lois/last-sent", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const active = list.data?.lois.find((row) => row.id === activeId);
  const editing = active ? { ...active, ...draft } : null;
  useEffect(() => {
    if (!draft) setBase(active ?? null);
  }, [active, draft]);
  const versions = list.data?.versions.filter((row) => row.loiId === activeId) ?? [];
  async function refresh() {
    if (!org) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["lois", org.id, company.id] }),
      qc.invalidateQueries({ queryKey: ["loi-last-sent", org.id] }),
      qc.invalidateQueries({ queryKey: ["contact-data", org.id] }),
    ]);
  }
  async function start(copyFromId?: string) {
    if (!org) return;
    setBusy(true);
    setMessage("");
    try {
      const row = await request<Loi>("/org/lois", org.id, {
        companyId: company.id,
        ...(copyFromId ? { copyFromId } : {}),
      });
      await refresh();
      setActiveId(row.id);
      setDraft(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke opprette avtalen.");
    } finally {
      setBusy(false);
    }
  }
  async function save(expectedOverride?: Loi) {
    if (!org || !editing || !(expectedOverride ?? base)) return false;
    try {
      const row = await request<Loi>(`/org/lois/${editing.id}`, org.id, {
        ourSignerName: editing.ourSignerName,
        counterpartySignerName: editing.counterpartySignerName,
        documentDate: editing.documentDate,
        variables: editing.variables,
        sections: editing.sections,
        expected: {
          ourSignerName: (expectedOverride ?? base)!.ourSignerName,
          counterpartySignerName: (expectedOverride ?? base)!.counterpartySignerName,
          documentDate: (expectedOverride ?? base)!.documentDate,
          variables: (expectedOverride ?? base)!.variables,
          sections: (expectedOverride ?? base)!.sections,
        },
      });
      setBase(row);
      setDraft(null);
      setConflict(null);
      await refresh();
      setMessage("Utkastet er lagret.");
      return true;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.details.current &&
        typeof error.details.current === "object"
      )
        setConflict({
          local: editing,
          remote: error.details.current as Loi,
          fields: Array.isArray(error.details.fields) ? (error.details.fields as string[]) : [],
        });
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre utkastet.");
      return false;
    }
  }
  async function compile() {
    if (!org || !editing) return;
    setBusy(true);
    setMessage("");
    try {
      if (!(await save())) return;
      const row = await request<Version>(`/org/lois/${editing.id}/compile`, org.id, {});
      await refresh();
      await preview(row.fileId);
      setMessage("PDF-versjonen er lagret. Kontroller den før du markerer avtalen som sendt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF-kompilering feilet.");
    } finally {
      setBusy(false);
    }
  }
  async function preview(fileId: string) {
    if (!org) return;
    try {
      const { url } = await request<{ url: string }>(`/org/files/${fileId}/url`, org.id);
      setPreviewUrl(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke åpne PDF.");
    }
  }
  async function markSent(versionId: string) {
    if (!org || !active) return;
    setBusy(true);
    try {
      await request(`/org/lois/${active.id}/mark-sent`, org.id, { versionId });
      await refresh();
      setMessage("Avtalen er markert som sendt. Den valgte PDF-versjonen er bevart.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke markere som sendt.");
    } finally {
      setBusy(false);
    }
  }
  async function signed(file: File) {
    if (!org || !active) return;
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      setMessage("Velg en signert PDF på maks 10 MiB.");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadFile(org.id, file);
      await request(`/org/lois/${active.id}/signed`, org.id, {
        fileId: uploaded.id,
        label: file.name,
      });
      await refresh();
      setSuggestStatus(company.status !== "signert_intensjonsavtale");
      setMessage("Signert PDF er lagret som en ny versjon.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre signert PDF.");
    } finally {
      setBusy(false);
    }
  }
  async function setCompanyStatus() {
    if (!org) return;
    setBusy(true);
    try {
      await request(`/org/companies/${company.id}`, org.id, { status: "signert_intensjonsavtale" });
      await refresh();
      setSuggestStatus(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke oppdatere status.");
    } finally {
      setBusy(false);
    }
  }
  async function saveLogo(file: File, sourceUrl: string | null = null) {
    if (!org) return;
    if (file.type !== "image/png" || file.size > 5 * 1024 * 1024) {
      setMessage("Velg en PNG på maks 5 MiB.");
      return;
    }
    setBusy(true);
    try {
      const row = await uploadFile(org.id, file);
      await request(`/org/loi-companies/${company.id}/logo`, org.id, { fileId: row.id, sourceUrl });
      await refresh();
      setMessage("Motpartens logo er lagret.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke importere logo.");
    } finally {
      setBusy(false);
    }
  }
  async function importLogoUrl() {
    try {
      const parsed = new URL(logoUrl);
      if (parsed.protocol !== "https:") throw new Error("Bruk en HTTPS-lenke til PNG-bildet.");
      const response = await fetch(parsed.href);
      if (!response.ok) throw new Error("Bildelenken kunne ikke åpnes.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        bytes.length > 5 * 1024 * 1024 ||
        ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
      )
        throw new Error("Lenken må peke til en PNG på maks 5 MiB.");
      await saveLogo(
        new File([Uint8Array.from(bytes).buffer], "motpart-logo.png", { type: "image/png" }),
        parsed.href,
      );
      setLogoUrl("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Lenken kunne ikke importeres. Last opp PNG-filen i stedet.",
      );
    }
  }
  function updateSection(index: number, key: keyof Section, value: string) {
    if (!editing) return;
    const next = [...(editing.sections ?? [])];
    next[index] = { ...next[index]!, [key]: value };
    setDraft((current) => ({ ...current, sections: next }));
  }
  function updateVariable(key: keyof LoiVariables, value: string) {
    if (!editing) return;
    setDraft((current) => ({
      ...current,
      variables: { ...editing.variables, [key]: value },
    }));
  }
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileText size={17} /> Intensjonsavtaler
        </h2>
        {active && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setActiveId(null);
              setDraft(null);
            }}
          >
            <Plus size={14} /> Ny LOI
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Avtaler og signerte versjoner tilhører {company.name}.
      </p>
      <div className="mt-3 space-y-2">
        {list.data?.lois.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${activeId === row.id ? "border-primary bg-primary-soft" : "border-border hover:bg-muted"}`}
            onClick={() => {
              setActiveId(row.id);
              setDraft(null);
              setSuggestStatus(false);
            }}
          >
            {row.sentAt ? "Sendt" : "Utkast"} ·{" "}
            {new Date(row.createdAt).toLocaleDateString("nb-NO")}
          </button>
        ))}
      </div>
      {!active && (
        <div className="mt-4 space-y-3">
          {previous.data && (
            <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm">
              <strong>Vil du bruke forrige sendte LOI som utgangspunkt?</strong>
              <p className="mt-1 text-xs text-muted-foreground">
                {previous.data.companyName} · sendt av {previous.data.senderName ?? "Ukjent medlem"}{" "}
                · {new Date(previous.data.sentAt).toLocaleDateString("nb-NO")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {previous.data.fileId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void preview(previous.data!.fileId!)}
                  >
                    Forhåndsvis PDF
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={() => void start(previous.data!.id)}>
                  Bruk som utgangspunkt
                </Button>
              </div>
            </div>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void start()}>
            <Plus size={14} /> Start ny LOI
          </Button>
        </div>
      )}
      {editing && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              Prosjektnavn
              <Input
                className="mt-1"
                value={editing.variables?.projectName ?? ""}
                disabled={!!editing.sentAt}
                onChange={(event) => updateVariable("projectName", event.target.value)}
              />
            </label>
            <div className="text-xs">
              <label htmlFor={`loi-our-signer-${company.id}`}>Signer for vårt team</label>
              <FreeTextCombobox
                id={`loi-our-signer-${company.id}`}
                value={editing.ourSignerName ?? ""}
                disabled={!!editing.sentAt}
                options={members.map((member) => member.name ?? "")}
                onChange={(name) => setDraft((current) => ({ ...current, ourSignerName: name }))}
              />
            </div>
            <div className="text-xs">
              <label htmlFor={`loi-counterparty-signer-${company.id}`}>
                Signer hos {company.name}
              </label>
              <FreeTextCombobox
                id={`loi-counterparty-signer-${company.id}`}
                value={editing.counterpartySignerName ?? ""}
                disabled={!!editing.sentAt}
                options={contacts.map((contact) => contact.name)}
                onChange={(name) =>
                  setDraft((current) => ({
                    ...current,
                    counterpartySignerName: name,
                  }))
                }
              />
            </div>
            <label className="text-xs">
              Dato i avtalen
              <Input
                className="mt-1"
                value={editing.documentDate ?? ""}
                disabled={!!editing.sentAt}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, documentDate: event.target.value }))
                }
              />
            </label>
            <label className="text-xs">
              Din rolle
              <Input
                className="mt-1"
                value={editing.variables?.ourSignerRole ?? ""}
                disabled={!!editing.sentAt}
                onChange={(event) => updateVariable("ourSignerRole", event.target.value)}
              />
            </label>
            <label className="text-xs">
              Motpartens rolle
              <Input
                className="mt-1"
                value={editing.variables?.counterpartySignerRole ?? ""}
                disabled={!!editing.sentAt}
                onChange={(event) => updateVariable("counterpartySignerRole", event.target.value)}
              />
            </label>
          </div>
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Tittel og faste tekster
            </summary>
            <div className="mt-3 grid gap-3">
              <label className="text-xs">
                Dokumenttittel
                <Input
                  className="mt-1"
                  value={editing.variables?.documentTitle ?? ""}
                  disabled={!!editing.sentAt}
                  onChange={(event) => updateVariable("documentTitle", event.target.value)}
                />
              </label>
              <label className="text-xs">
                Undertittel
                <Input
                  className="mt-1"
                  value={editing.variables?.subtitle ?? ""}
                  disabled={!!editing.sentAt}
                  onChange={(event) => updateVariable("subtitle", event.target.value)}
                />
              </label>
              <label className="text-xs">
                Tekst over signaturene
                {editing.sentAt ? (
                  <Textarea
                    className="mt-1"
                    value={editing.variables?.signatureNote ?? ""}
                    disabled
                  />
                ) : (
                  <LiveText
                    key={editing.id}
                    kind="loi-signature"
                    id={editing.id}
                    initialText={editing.variables?.signatureNote ?? ""}
                    className="mt-1"
                  />
                )}
              </label>
            </div>
          </details>
          <div className="space-y-3">
            {(editing.sections ?? []).map((section, index) => (
              <div key={section.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Seksjon {index + 1}</span>
                  {!editing.sentAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={(editing.sections?.length ?? 0) <= 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          sections: editing.sections?.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Fjern
                    </Button>
                  )}
                </div>
                <Input
                  className="mt-2"
                  placeholder="Tittel"
                  value={section.title}
                  disabled={!!editing.sentAt}
                  onChange={(event) => updateSection(index, "title", event.target.value)}
                />
                {editing.sentAt || !active?.sections.some((item) => item.id === section.id) ? (
                  <Textarea
                    className="mt-2 min-h-28"
                    placeholder="Tekst"
                    value={section.body}
                    disabled={!!editing.sentAt}
                    onChange={(event) => updateSection(index, "body", event.target.value)}
                  />
                ) : (
                  <LiveText
                    kind="loi-section"
                    id={section.id}
                    initialText={section.body}
                    className="mt-2 min-h-28"
                  />
                )}
              </div>
            ))}
            {!editing.sentAt && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    sections: [
                      ...(editing.sections ?? []),
                      { id: crypto.randomUUID(), title: "", body: "" },
                    ],
                  }))
                }
              >
                <Plus size={14} /> Legg til seksjon
              </Button>
            )}
          </div>
          {!editing.sentAt && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}>
                Lagre utkast
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void compile()}>
                Kompiler og forhåndsvis PDF
              </Button>
            </div>
          )}
          {conflict && (
            <div role="alert" className="rounded-xl border border-warn bg-warn-soft p-4 text-sm">
              <p className="font-semibold">Utkastet ble endret av en annen person</p>
              <p className="mt-1">
                Din lokale redigering er beholdt. Sammenlign før du lagrer på nytt.
              </p>
              {conflict.fields.map((field) => {
                const describe = (loi: Loi) =>
                  field === "sections.structure"
                    ? loi.sections.map((section) => section.title).join(" → ")
                    : field.startsWith("variables.")
                      ? loi.variables[field.slice(10) as keyof LoiVariables]
                      : field.startsWith("sections.")
                        ? loi.sections.find((section) => section.id === field.split(".")[1])?.title
                        : loi[
                            field as keyof Pick<
                              Loi,
                              "ourSignerName" | "counterpartySignerName" | "documentDate"
                            >
                          ];
                return (
                  <div
                    key={field}
                    className="mt-3 grid gap-2 rounded-lg bg-card p-3 sm:grid-cols-2"
                  >
                    <div>
                      <strong>Din verdi · {field}</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {describe(conflict.local) || "(tomt)"}
                      </p>
                    </div>
                    <div>
                      <strong>Nyeste lagret</strong>
                      <p className="mt-1 whitespace-pre-wrap">
                        {describe(conflict.remote) || "(tomt)"}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft(null);
                    setBase(conflict.remote);
                    setConflict(null);
                    void refresh();
                  }}
                >
                  Bruk nyeste
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void save(conflict.remote)}>
                  Bruk min versjon
                </Button>
              </div>
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">PDF-versjoner</h3>
            {versions.map((version) => (
              <div key={version.id} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <FileCheck2 size={14} />{" "}
                <span>
                  {version.label} · {version.kind === "signed" ? "Signert" : "Generert"}
                </span>
                {editing.sentVersionId === version.id && (
                  <span className="text-primary">Sendt versjon</span>
                )}
                <Button size="sm" variant="outline" onClick={() => void preview(version.fileId)}>
                  Forhåndsvis PDF
                </Button>
                {!editing.sentAt && version.kind === "generated" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void markSent(version.id)}
                  >
                    Merk denne som sendt
                  </Button>
                )}
              </div>
            ))}
            {!versions.length && (
              <p className="mt-1 text-xs text-muted-foreground">Ingen versjoner ennå.</p>
            )}
          </div>
          {editing.sentAt && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
              <Upload size={15} /> Last opp signert PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void signed(file);
                  event.target.value = "";
                }}
              />
            </label>
          )}
          {suggestStatus && (
            <div className="rounded-xl bg-primary-soft p-3 text-sm">
              Signert versjon er lagret. Oppdatere organisasjonen til «Signert intensjonsavtale»?
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => void setCompanyStatus()}>
                  Ja, oppdater status
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSuggestStatus(false)}>
                  Ikke nå
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mt-5 rounded-xl border border-border p-3">
        <p className="text-xs font-medium">Logo for {company.name} (PNG)</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
            {company.loiLogoFileId ? "Bytt logo" : "Last opp PNG"}
            <input
              type="file"
              accept="image/png"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void saveLogo(file);
                event.target.value = "";
              }}
            />
          </label>
          <Input
            className="min-w-40 flex-1 text-xs"
            placeholder="https://.../logo.png"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!logoUrl || busy}
            onClick={() => void importLogoUrl()}
          >
            Importer lenke
          </Button>
        </div>
        {company.loiLogoFileId && (
          <p className="mt-1 text-xs text-muted-foreground">
            Logo lagret{company.loiLogoUrl ? ` fra ${company.loiLogoUrl}` : ""}.
          </p>
        )}
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      <Dialog
        open={!!previewUrl}
        onOpenChange={(open) => {
          if (!open) setPreviewUrl(null);
        }}
      >
        <DialogContent className="h-[90vh] max-w-4xl">
          <DialogTitle>PDF-forhåndsvisning</DialogTitle>
          <DialogDescription>Lukk forhåndsvisningen uten å endre utkastet.</DialogDescription>
          {previewUrl && (
            <iframe
              title="LOI PDF"
              src={previewUrl}
              className="mt-3 h-[calc(90vh-120px)] w-full rounded-lg border border-border"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
