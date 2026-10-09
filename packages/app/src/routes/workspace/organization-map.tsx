import { ArrowLeft, FileText, Pencil, Check, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ContactStatusBadge } from "../../components/contact-status.tsx";
import { GroupAiSummary } from "../../components/group-ai-summary.tsx";
import { LoiPanel } from "../../components/loi-panel.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Popover, PopoverContent } from "../../components/ui/popover.tsx";
import { Select } from "../../components/ui/select.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { OrganizationMapGraph } from "../../components/organization-map-graph.tsx";
import { readMapInputMode, type MapInputMode } from "../../lib/organization-map-input.ts";
import {
  colorLabels,
  colors,
  companyStatusColors,
  companyStatuses,
  type Color,
  type Company,
  type Data,
  type Domain,
  type MapFocus,
} from "./model.tsx";
import { TagDescription } from "./tag-editor.tsx";
export type OrganizationSelection = { kind: "all" } | { kind: "company"; id: string };

export function OrganizationGraph({
  workspaceId,
  inputMode,
  data,
  companies,
  selection,
  onOpenNode,
  onCloseNode,
  activeNode,
  fitToken,
  zoomAction,
}: {
  workspaceId: string;
  inputMode: MapInputMode;
  data: Data;
  companies: Company[];
  selection: OrganizationSelection;
  onOpenNode: (kind: "domain" | "company" | "contact", id: string, anchor: Element) => void;
  onCloseNode: () => void;
  activeNode: { kind: "domain" | "company" | "contact"; id: string } | null;
  fitToken: number;
  zoomAction: { sequence: number; factor: number };
}) {
  const mapData = useMemo(
    () => ({
      domains: data.domains,
      companies,
      companyDomains: data.companyDomains,
      contacts: data.contacts,
      members: data.members,
    }),
    [data.domains, companies, data.companyDomains, data.contacts, data.members],
  );
  return (
    <OrganizationMapGraph
      workspaceId={workspaceId}
      inputMode={inputMode}
      data={mapData}
      selection={selection}
      onOpenNode={onOpenNode}
      onCloseNode={onCloseNode}
      activeNode={activeNode}
      fitToken={fitToken}
      zoomAction={zoomAction}
    />
  );
}

export function OrganizationMap({
  workspaceId,
  initialFocus,
  onFocusChange,
  loaded,
  data,
  mutate,
  onOpenContact,
  busy,
}: {
  workspaceId: string;
  initialFocus: MapFocus;
  onFocusChange: (focus: MapFocus) => void;
  loaded: boolean;
  data: Data;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onOpenContact: (id: string) => void;
  busy: boolean;
}) {
  const [selection, setSelection] = useState<OrganizationSelection>(
    initialFocus.kind === "company" && initialFocus.id
      ? { kind: "company", id: initialFocus.id }
      : { kind: "all" },
  );
  const [activeNode, setActiveNode] = useState<{
    kind: "domain" | "company" | "contact";
    id: string;
    anchor: Element;
  } | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [companyNameError, setCompanyNameError] = useState("");
  const [deletingCompany, setDeletingCompany] = useState<{ id: string; name: string } | null>(null);
  const [deleteCompanyError, setDeleteCompanyError] = useState("");
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainDescription, setNewDomainDescription] = useState("");
  const [domainColor, setDomainColor] = useState<Color>("blue");
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [domainNameDraft, setDomainNameDraft] = useState("");
  const [domainNameError, setDomainNameError] = useState("");
  const [loiCompanyId, setLoiCompanyId] = useState<string | null>(null);
  const [summaryScope, setSummaryScope] = useState<{
    kind: "company" | "domain";
    id: string;
    name: string;
  } | null>(null);
  const [inputMode, setInputMode] = useState<MapInputMode>(readMapInputMode);
  const [inputModeOpen, setInputModeOpen] = useState(false);
  function changeInputMode(mode: MapInputMode) {
    setInputMode(mode);
    try {
      localStorage.setItem("contac:map-input-mode", mode);
    } catch {
      // Keep this session's mode.
    }
  }
  const [fitToken, setFitToken] = useState(0);
  const [zoomAction, setZoomAction] = useState({ sequence: 0, factor: 1 });

  useEffect(() => {
    if (!loaded || selection.kind === "all") return;
    const valid = data.companies.some((company) => company.id === selection.id);
    if (!valid) {
      setSelection({ kind: "all" });
      onFocusChange({ kind: "all", id: null });
    }
  }, [loaded, selection, data.companies, onFocusChange]);

  function closeActiveNode() {
    setActiveNode(null);
    setEditingCompanyId(null);
    setCompanyNameError("");
    setEditingDomainId(null);
    setDomainNameError("");
  }
  function chooseSelection(next: OrganizationSelection) {
    closeActiveNode();
    setSelection(next);
    onFocusChange(next.kind === "all" ? { kind: "all", id: null } : next);
  }
  const graphCompanies = useMemo(
    () =>
      data.companies.filter((candidate) =>
        selection.kind === "company" ? candidate.id === selection.id : true,
      ),
    [data.companies, selection],
  );
  const popupDomain =
    activeNode?.kind === "domain"
      ? (data.domains.find((candidate) => candidate.id === activeNode.id) ?? null)
      : null;
  const popupCompany =
    activeNode?.kind === "company"
      ? (data.companies.find((candidate) => candidate.id === activeNode.id) ?? null)
      : null;
  const popupContact =
    activeNode?.kind === "contact"
      ? (data.contacts.find((candidate) => candidate.id === activeNode.id) ?? null)
      : null;
  const popupCompanyDomains = popupCompany
    ? data.domains.filter((domain) =>
        data.companyDomains.some(
          (link) => link.companyId === popupCompany.id && link.domainId === domain.id,
        ),
      )
    : [];
  const popupCompanyDomainId = popupCompanyDomains.map((domain) => domain.id).sort()[0] ?? null;
  const popupPeople = popupCompany
    ? data.contacts.filter(
        (contact) => contact.companyId === popupCompany.id && contact.status !== "duplicate",
      )
    : [];
  const loiCompany = loiCompanyId
    ? (data.companies.find((candidate) => candidate.id === loiCompanyId) ?? null)
    : null;
  function openCreateDomain() {
    setNewDomain("");
    setNewDomainDescription("");
    setDomainDialogOpen(true);
  }

  async function createDomain(event: FormEvent) {
    event.preventDefault();
    if (!newDomain.trim() || !newDomainDescription.trim()) return;
    await mutate<Domain>("/domains", {
      name: newDomain.trim(),
      description: newDomainDescription.trim(),
      color: domainColor,
    });
    setNewDomain("");
    setNewDomainDescription("");
    setDomainDialogOpen(false);
  }
  async function renameDomain(event: FormEvent) {
    event.preventDefault();
    if (!popupDomain || editingDomainId !== popupDomain.id) return;
    const name = domainNameDraft.trim();
    if (!name) {
      setDomainNameError("Domenenavnet kan ikke være tomt.");
      return;
    }
    if (name === popupDomain.name) {
      setEditingDomainId(null);
      return;
    }
    try {
      await mutate(`/domains/${popupDomain.id}/rename`, {
        name,
        expected: { revision: popupDomain.revision },
      });
      setEditingDomainId(null);
      setDomainNameError("");
    } catch (cause) {
      setDomainNameError(cause instanceof Error ? cause.message : "Kunne ikke endre navn.");
    }
  }
  async function setCompanyDomain(id: string | null) {
    if (!popupCompany) return;
    const currentIds = popupCompanyDomains.map((domain) => domain.id);
    await mutate(`/companies/${popupCompany.id}/domains`, {
      domainIds: id ? [id] : [],
      expected: { domainIds: currentIds, revision: popupCompany.domainsRevision },
    });
  }
  async function renameCompany(event: FormEvent) {
    event.preventDefault();
    if (!popupCompany || editingCompanyId !== popupCompany.id) return;
    const name = companyNameDraft.trim();
    if (!name) {
      setCompanyNameError("Organisasjonsnavnet kan ikke være tomt.");
      return;
    }
    if (name === popupCompany.name) {
      setEditingCompanyId(null);
      return;
    }
    try {
      await mutate(`/companies/${popupCompany.id}`, {
        name,
        expected: { name: popupCompany.name },
      });
      setEditingCompanyId(null);
      setCompanyNameError("");
    } catch (cause) {
      setCompanyNameError(cause instanceof Error ? cause.message : "Kunne ikke endre navn.");
    }
  }
  async function deleteCompany() {
    if (!deletingCompany) return;
    try {
      await mutate(`/companies/${deletingCompany.id}/delete`, {});
      setDeletingCompany(null);
      closeActiveNode();
      if (selection.kind === "company" && selection.id === deletingCompany.id)
        chooseSelection({ kind: "all" });
    } catch (cause) {
      setDeleteCompanyError(
        cause instanceof Error ? cause.message : "Kunne ikke slette organisasjonen.",
      );
    }
  }

  return (
    <div className="relative flex min-h-[720px] min-w-0 flex-1 flex-col gap-4 lg:min-h-0">
      <h1 className="sr-only">Organisasjoner</h1>
      <section
        className="relative min-h-[560px] min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-card"
        aria-label="Relasjoner"
      >
        <OrganizationGraph
          workspaceId={workspaceId}
          inputMode={inputMode}
          data={data}
          companies={graphCompanies}
          selection={selection}
          onOpenNode={(kind, id, anchor) => {
            setEditingCompanyId(null);
            setCompanyNameError("");
            setEditingDomainId(null);
            setDomainNameError("");
            setActiveNode((current) =>
              current?.kind === kind && current.id === id ? null : { kind, id, anchor },
            );
          }}
          onCloseNode={closeActiveNode}
          activeNode={activeNode}
          fitToken={fitToken}
          zoomAction={zoomAction}
        />
        {selection.kind !== "all" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute left-3 top-3 bg-card shadow-card"
            onClick={() => chooseSelection({ kind: "all" })}
          >
            <ArrowLeft size={15} /> Vis alt
          </Button>
        )}
        {selection.kind === "all" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute bottom-3 left-3 bg-card shadow-card"
            onClick={openCreateDomain}
          >
            <Plus size={15} /> Nytt domene
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="absolute bottom-16 right-3 bg-card shadow-card"
          onClick={() => setInputModeOpen(true)}
        >
          Input-modus
        </Button>
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-card">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Zoom ut"
            onClick={() =>
              setZoomAction((current) => ({ sequence: current.sequence + 1, factor: 0.75 }))
            }
          >
            −
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setFitToken((current) => current + 1)}
          >
            Vis alt
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Zoom inn"
            onClick={() =>
              setZoomAction((current) => ({ sequence: current.sequence + 1, factor: 1.33 }))
            }
          >
            +
          </Button>
        </div>
      </section>
      <Dialog open={inputModeOpen} onOpenChange={setInputModeOpen}>
        <DialogContent>
          <DialogTitle>Input-modus</DialogTitle>
          <DialogDescription>
            Velg hvordan du vil bevege deg rundt i organisasjonskartet.
          </DialogDescription>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              aria-pressed={inputMode === "mouse"}
              onClick={() => changeInputMode("mouse")}
              className={`w-full rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${inputMode === "mouse" ? "border-primary bg-primary-soft/40" : "border-border"}`}
            >
              <span className="block text-sm font-medium">Dra og scroll</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Klikk og dra for å flytte kartet, også over kortene. Rull for å zoome inn og ut.
              </span>
            </button>
            <button
              type="button"
              aria-pressed={inputMode === "trackpad"}
              onClick={() => changeInputMode("trackpad")}
              className={`w-full rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${inputMode === "trackpad" ? "border-primary bg-primary-soft/40" : "border-border"}`}
            >
              <span className="block text-sm font-medium">Swipe og zoom</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Sveip med to fingre for å flytte kartet vannrett og loddrett. Spre eller knip sammen
                to fingre for å zoome inn og ut.
              </span>
            </button>
          </div>
          <Button className="mt-4" onClick={() => setInputModeOpen(false)}>
            Ferdig
          </Button>
        </DialogContent>
      </Dialog>
      <Popover
        open={!!activeNode}
        onOpenChange={(open) => {
          if (!open) closeActiveNode();
        }}
      >
        <PopoverContent
          anchor={activeNode?.anchor}
          side="right"
          align="start"
          className="max-h-[min(620px,calc(100vh-24px))] w-[min(360px,calc(100vw-24px))] overflow-y-auto p-4"
        >
          {popupDomain && (
            <div>
              {editingDomainId === popupDomain.id ? (
                <form
                  className="mb-3 flex items-center gap-1"
                  onSubmit={(event) => void renameDomain(event)}
                >
                  <Input
                    autoFocus
                    aria-label="Domenenavn"
                    className="min-w-0"
                    maxLength={100}
                    value={domainNameDraft}
                    onChange={(event) => setDomainNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setEditingDomainId(null);
                        setDomainNameError("");
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label="Lagre domenenavn"
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Avbryt navneendring"
                    onClick={() => {
                      setEditingDomainId(null);
                      setDomainNameError("");
                    }}
                  >
                    <X size={16} />
                  </Button>
                </form>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mb-3"
                  onClick={() => {
                    setEditingDomainId(popupDomain.id);
                    setDomainNameDraft(popupDomain.name);
                    setDomainNameError("");
                  }}
                >
                  <Pencil size={14} /> Endre navn
                </Button>
              )}
              {domainNameError && editingDomainId === popupDomain.id && (
                <p role="alert" className="mb-3 text-xs text-risk">
                  {domainNameError}
                </p>
              )}
              <TagDescription
                key={popupDomain.id}
                tag={popupDomain}
                pathPrefix="/domains"
                mutate={mutate}
                busy={busy}
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() =>
                  setSummaryScope({ kind: "domain", id: popupDomain.id, name: popupDomain.name })
                }
              >
                <Sparkles size={14} /> Oppsummer samtaler fra {popupDomain.name}
              </Button>
            </div>
          )}
          {popupCompany && (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {editingCompanyId === popupCompany.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1"
                    onSubmit={(event) => void renameCompany(event)}
                  >
                    <Input
                      autoFocus
                      aria-label="Organisasjonsnavn"
                      className="min-w-0"
                      maxLength={200}
                      value={companyNameDraft}
                      onChange={(event) => setCompanyNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setEditingCompanyId(null);
                          setCompanyNameError("");
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      aria-label="Lagre organisasjonsnavn"
                    >
                      <Check size={16} />
                    </Button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded text-left text-lg font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Endre navn på ${popupCompany.name}`}
                    title="Klikk for å endre navn"
                    onClick={() => {
                      setEditingCompanyId(popupCompany.id);
                      setCompanyNameDraft(popupCompany.name);
                      setCompanyNameError("");
                    }}
                  >
                    {popupCompany.name}
                  </button>
                )}
                <Select
                  value={popupCompany.status}
                  aria-label={`Status for ${popupCompany.name}`}
                  className="w-auto max-w-full shrink-0"
                  onValueChange={(status) =>
                    void mutate(`/companies/${popupCompany.id}`, {
                      status,
                      expected: { status: popupCompany.status },
                    })
                  }
                  items={companyStatuses.map(([value, label]) => ({
                    value,
                    label,
                    icon: (
                      <span
                        className="block size-2.5 rounded-full"
                        style={{ backgroundColor: companyStatusColors[value] }}
                      />
                    ),
                  }))}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground hover:text-risk"
                  aria-label={`Slett ${popupCompany.name}`}
                  title={
                    data.contacts.some((contact) => contact.companyId === popupCompany.id)
                      ? "Flytt kontaktene til en annen organisasjon først"
                      : "Slett organisasjon"
                  }
                  disabled={
                    busy || data.contacts.some((contact) => contact.companyId === popupCompany.id)
                  }
                  onClick={() => {
                    setDeleteCompanyError("");
                    setDeletingCompany({ id: popupCompany.id, name: popupCompany.name });
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              {companyNameError && editingCompanyId === popupCompany.id && (
                <p role="alert" className="mt-2 text-xs text-risk">
                  {companyNameError}
                </p>
              )}
              <p className="mt-4 text-xs font-medium text-muted-foreground">Domene</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Domene">
                <button
                  type="button"
                  role="radio"
                  aria-checked={popupCompanyDomainId === null}
                  disabled={busy}
                  className={`rounded-lg border px-2 py-1 text-xs transition-colors ${popupCompanyDomainId === null ? "font-semibold text-foreground shadow-sm ring-1 ring-inset ring-primary/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                  onClick={() => void setCompanyDomain(null)}
                >
                  Uten domene
                </button>
                {data.domains.map((domain) => {
                  const linked = popupCompanyDomainId === domain.id;
                  return (
                    <button
                      key={domain.id}
                      type="button"
                      role="radio"
                      aria-checked={linked}
                      disabled={busy}
                      className={`rounded-lg border px-2 py-1 text-xs transition-colors ${linked ? "font-semibold text-foreground shadow-sm ring-1 ring-inset ring-primary/20" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                      style={{
                        borderColor: colors[domain.color],
                        backgroundColor: linked
                          ? `color-mix(in srgb, ${colors[domain.color]} 24%, var(--card))`
                          : undefined,
                      }}
                      onClick={() => void setCompanyDomain(domain.id)}
                    >
                      <span
                        className="mr-1.5 inline-block size-2 rounded-full"
                        style={{ backgroundColor: colors[domain.color] }}
                      />
                      {domain.name}
                    </button>
                  );
                })}
                {!data.domains.length && (
                  <span className="text-xs text-muted-foreground">Ingen domener ennå.</span>
                )}
              </div>
              <p className="mt-4 text-xs font-medium text-muted-foreground">
                Kontakter ({popupPeople.length})
              </p>
              <div className="mt-2 space-y-1">
                {popupPeople.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => onOpenContact(person.id)}
                  >
                    {person.name}
                  </button>
                ))}
                {!popupPeople.length && (
                  <p className="text-xs text-muted-foreground">Ingen kontakter ennå.</p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSummaryScope({
                      kind: "company",
                      id: popupCompany.id,
                      name: popupCompany.name,
                    })
                  }
                >
                  <Sparkles size={14} /> Oppsummer samtaler fra {popupCompany.name}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLoiCompanyId(popupCompany.id)}
                >
                  <FileText size={14} /> Intensjonsavtale
                </Button>
              </div>
            </div>
          )}
          {popupContact && (
            <div>
              <h2 className="pr-6 text-lg font-semibold">{popupContact.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.companies.find((candidate) => candidate.id === popupContact.companyId)?.name}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-5">
                {popupContact.description?.trim() || "Ingen kort beskrivelse er lagt til."}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.contactPersonTags
                  .filter((link) => link.contactId === popupContact.id)
                  .map((link) => {
                    const tag = data.personTags.find((candidate) => candidate.id === link.tagId);
                    return tag ? (
                      <Badge key={tag.id} variant="neutral">
                        {tag.name}
                      </Badge>
                    ) : null;
                  })}
              </div>
              <div className="mt-3">
                <ContactStatusBadge status={popupContact.status} />
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-3">
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => onOpenContact(popupContact.id)}
                >
                  Gå til kontakt
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Dialog open={!!deletingCompany} onOpenChange={(open) => !open && setDeletingCompany(null)}>
        <DialogContent>
          <DialogTitle>Slett organisasjon?</DialogTitle>
          <DialogDescription>
            {deletingCompany?.name} og koblingen til domenet blir slettet. Organisasjonen kan bare
            slettes når den ikke har kontakter eller intensjonsavtaler.
          </DialogDescription>
          {deleteCompanyError && (
            <p role="alert" className="mt-3 text-sm text-risk">
              {deleteCompanyError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeletingCompany(null)}>
              Avbryt
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void deleteCompany()}
            >
              Slett organisasjon
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={domainDialogOpen} onOpenChange={setDomainDialogOpen}>
        <DialogContent>
          <DialogTitle>Nytt domene</DialogTitle>
          <DialogDescription>Velg navn og farge for domenet.</DialogDescription>
          <form className="mt-5 space-y-4" onSubmit={(event) => void createDomain(event)}>
            <Input
              autoFocus
              placeholder="Navn"
              aria-label="Domenenavn"
              required
              value={newDomain}
              onChange={(event) => setNewDomain(event.target.value)}
            />
            <Textarea
              required
              maxLength={500}
              placeholder="Når skal et selskap knyttes til dette domenet?"
              aria-label="Beskrivelse av domenet"
              value={newDomainDescription}
              onChange={(event) => setNewDomainDescription(event.target.value)}
            />
            <div className="grid grid-cols-5 gap-3" role="group" aria-label="Farge">
              {(Object.keys(colors) as Color[]).map((color) => (
                <button
                  key={color}
                  type="button"
                  title={colorLabels[color]}
                  aria-label={`Velg ${colorLabels[color]} farge`}
                  aria-pressed={domainColor === color}
                  onClick={() => setDomainColor(color)}
                  className={`aspect-square w-full rounded-lg transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${domainColor === color ? "ring-2 ring-foreground ring-offset-2" : ""}`}
                  style={{ backgroundColor: colors[color] }}
                />
              ))}
            </div>
            <Button type="submit" disabled={busy}>
              Opprett domene
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!summaryScope}
        onOpenChange={(open) => {
          if (!open) setSummaryScope(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {summaryScope && (
            <>
              <DialogTitle>Oppsummer samtaler</DialogTitle>
              <div className="mt-4">
                <GroupAiSummary key={`${summaryScope.kind}:${summaryScope.id}`} {...summaryScope} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!loiCompanyId}
        onOpenChange={(open) => {
          if (!open) setLoiCompanyId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-[min(92vw,1200px)] overflow-y-auto">
          {loiCompany && (
            <>
              <DialogTitle>Intensjonsavtale · {loiCompany.name}</DialogTitle>
              <div className="mt-4">
                <LoiPanel
                  key={loiCompany.id}
                  company={loiCompany}
                  members={data.members}
                  contacts={data.contacts
                    .filter(
                      (person) =>
                        person.companyId === loiCompany.id && person.status !== "duplicate",
                    )
                    .map((person) => ({ id: person.id, name: person.name }))}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
