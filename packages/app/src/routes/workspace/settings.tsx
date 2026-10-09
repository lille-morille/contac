import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ProfileEditor } from "../../components/profile-editor.tsx";
import { TeamAiSettings } from "../../components/team-ai-settings.tsx";
import { TeamLoiSettings } from "../../components/team-loi-settings.tsx";
import { ClassRecoverySettings } from "../../components/class-recovery-settings.tsx";
import { AdminFeedbackLog } from "../../components/feedback.tsx";
import { ProfileAgentAccess } from "../../components/profile-agent-access.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Select } from "../../components/ui/select.tsx";
import { request } from "../../lib/api.ts";
import { copyText } from "../../lib/clipboard.ts";
import { useOrg } from "../../lib/org.tsx";
import { type Page } from "./model.tsx";
export function Settings({
  section,
  state,
  mutate,
  busy,
  onSectionChange,
  onSelectTeam,
  onSignOut,
}: {
  section: "profile" | "team_settings" | "class_settings";
  state: ReturnType<typeof useOrg>;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  onSectionChange: (section: Page) => void;
  onSelectTeam: (id: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const settingsQueryClient = useQueryClient();
  const classTeams = useQuery({
    queryKey: ["class-teams", state.classSpace?.classId],
    queryFn: () =>
      request<{
        currentTeamId: string | null;
        teams: {
          id: string;
          name: string;
          included: boolean;
          members: { userId: string; name: string | null; email: string | null }[];
        }[];
      }>("/class/teams"),
    enabled: section === "class_settings" && state.classSpace?.role === "admin",
  });
  const [teamName, setTeamName] = useState("");
  const [editingTeam, setEditingTeam] = useState<{ id: string; name: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingTeam, setDeletingTeam] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [teamActionBusy, setTeamActionBusy] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  async function changeMembership(teamId: string, included: boolean) {
    setTeamActionBusy(true);
    setTeamError("");
    try {
      await request(`/class/teams/${teamId}/membership`, undefined, { included });
      await classTeams.refetch();
      await settingsQueryClient.invalidateQueries({ queryKey: ["contact-data"] });
      await settingsQueryClient.invalidateQueries({ queryKey: ["report-workspace"] });
    } catch (cause) {
      setTeamError(
        cause instanceof Error ? cause.message : "Kunne ikke oppdatere teammedlemskapet.",
      );
    } finally {
      setTeamActionBusy(false);
    }
  }
  async function changeCurrentTeam(teamId: string) {
    setTeamActionBusy(true);
    setTeamError("");
    try {
      await request(`/class/teams/${teamId}/current`, undefined, {});
      await classTeams.refetch();
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : "Kunne ikke velge nåværende team.");
    } finally {
      setTeamActionBusy(false);
    }
  }
  async function createTeam(e: FormEvent) {
    e.preventDefault();
    setTeamActionBusy(true);
    setTeamError("");
    setMessage("");
    try {
      const row = await request<{ id: string }>("/organizations", undefined, { name: teamName });
      await state.refresh();
      await state.select(row.id);
      await classTeams.refetch();
      setTeamName("");
      setMessage("Team opprettet. Lag en invitasjon til teamet.");
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTeamActionBusy(false);
    }
  }
  async function renameTeam(e: FormEvent) {
    e.preventDefault();
    if (!editingTeam) return;
    if (renameDraft.trim().length < 2) {
      setTeamError("Teamnavnet må ha minst to tegn.");
      return;
    }
    setTeamActionBusy(true);
    setTeamError("");
    setMessage("");
    try {
      await request(`/organizations/${editingTeam.id}`, undefined, {
        name: renameDraft.trim(),
        expectedName: editingTeam.name,
      });
      setEditingTeam(null);
      setMessage("Teamnavnet er oppdatert.");
      try {
        await state.refresh();
        await classTeams.refetch();
      } catch {
        setTeamError(
          "Navnet er lagret, men teamlisten kunne ikke oppdateres. Last inn siden på nytt.",
        );
      }
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : "Kunne ikke endre teamnavnet.");
    } finally {
      setTeamActionBusy(false);
    }
  }
  async function deleteTeam() {
    if (!deletingTeam || deleteConfirmation !== deletingTeam.name) return;
    setTeamActionBusy(true);
    setTeamError("");
    setMessage("");
    try {
      const result = await request<{ deleted: boolean; storageCleanupFailed: boolean }>(
        `/organizations/${deletingTeam.id}/delete`,
        undefined,
        { confirmName: deleteConfirmation },
      );
      setDeletingTeam(null);
      setDeleteConfirmation("");
      setEditingTeam(null);
      setMessage(
        result.storageCleanupFailed
          ? "Teamet er slettet, men noen filer kunne ikke fjernes fra lagringen. Kontakt driftsansvarlig."
          : "Teamet og innholdet er slettet.",
      );
      try {
        await state.refresh();
        await classTeams.refetch();
      } catch {
        setTeamError(
          "Teamet er slettet, men teamlisten kunne ikke oppdateres. Last inn siden på nytt.",
        );
      }
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : "Kunne ikke slette teamet.");
    } finally {
      setTeamActionBusy(false);
    }
  }
  async function invite() {
    const result = await mutate<{ inviteUrl: string }>("/invitations", {});
    setInviteUrl(result.inviteUrl);
  }
  async function recovery() {
    const result = await request<{ recoveryCode: string }>("/profile/recovery-code", undefined, {});
    setCode(result.recoveryCode);
  }
  const inviteCard = state.org && (
    <Card className="p-5">
      <h2 className="font-semibold">Inviter til {state.org.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Lenken kan brukes av flere og utløper ikke. Del den bare med dem som skal bli med i teamet.
      </p>
      <Button className="mt-4" disabled={busy} onClick={() => void invite()}>
        Lag invitasjonslenke
      </Button>
      {inviteUrl && (
        <div className="mt-3 flex gap-2">
          <Input readOnly value={inviteUrl} />
          <Button variant="outline" onClick={() => void copyText(inviteUrl)}>
            Kopier
          </Button>
        </div>
      )}
    </Card>
  );
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">Innstillinger</h1>
      <nav aria-label="Innstillinger" className="flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["profile", "Min profil"],
            ["team_settings", state.org?.name ?? "Team"],
            ...(state.classSpace?.role === "admin" ? [["class_settings", "Klasserom"]] : []),
          ] as ["profile" | "team_settings" | "class_settings", string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? "page" : undefined}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${section === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => onSectionChange(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {section === "team_settings" && state.org && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="font-semibold">Aktivt team</h2>
            <p className="text-sm text-muted-foreground">Velg hvilket team du vil arbeide i.</p>
          </div>
          <Select
            value={state.org.id}
            onValueChange={(id) => {
              setInviteUrl("");
              onSelectTeam(id);
            }}
            items={state.organizations.map((team) => ({ value: team.id, label: team.name }))}
            aria-label="Aktivt team"
            className="min-w-52"
          />
        </Card>
      )}
      {section === "profile" && <ProfileEditor />}
      {section === "profile" && <ProfileAgentAccess />}
      {section === "profile" && (
        <Card className="p-5">
          <h2 className="font-semibold">Profil</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.user?.name}. Gjenopprettingskoden fungerer som passord på alle enheter. Når du
            lager en ny kode, slutter den gamle å virke.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void recovery()}>
            Lag ny gjenopprettingskode
          </Button>
          {code && (
            <div className="mt-3 rounded-xl bg-warn-soft p-3">
              <code className="break-all text-sm">{code}</code>
              <Button
                className="ml-2"
                size="sm"
                variant="outline"
                onClick={() => void copyText(code)}
              >
                Kopier
              </Button>
            </div>
          )}
        </Card>
      )}
      {section === "team_settings" && state.org && <TeamLoiSettings />}
      {section === "team_settings" && inviteCard}
      {section === "team_settings" && state.org && <TeamAiSettings />}
      {section === "class_settings" && state.classSpace?.role === "admin" && (
        <Card className="p-5">
          <h2 className="font-semibold">Klasseadministrator · {state.classSpace.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Opprett, endre og slett team. Invitasjoner oppretter du fra teamfanen.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Du kan være medlem av flere team. Nåværende team brukes som reserve ved e-post uten en
            tydelig teamtilknytning; det er uavhengig av hvilket team du har åpnet.
          </p>
          <form className="mt-4 flex gap-2" onSubmit={(e) => void createTeam(e)}>
            <Input
              required
              minLength={2}
              maxLength={100}
              placeholder="Teamnavn"
              aria-label="Nytt teamnavn"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <Button type="submit" disabled={teamActionBusy}>
              Opprett team
            </Button>
          </form>
          <div className="mt-5 space-y-2 text-sm">
            {state.organizations.map((o) => (
              <div key={o.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{o.name}</p>
                    <p className="break-all text-xs text-muted-foreground">{o.slug}</p>
                    {state.org?.id === o.id && (
                      <p className="text-xs text-muted-foreground">Aktivt team</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={teamActionBusy || state.org?.id === o.id}
                      onClick={() => void onSelectTeam(o.id)}
                    >
                      Åpne
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={teamActionBusy}
                      onClick={() => {
                        setEditingTeam({ id: o.id, name: o.name });
                        setRenameDraft(o.name);
                        setTeamError("");
                      }}
                    >
                      <Pencil size={14} /> Endre navn
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-risk"
                      disabled={teamActionBusy}
                      onClick={() => {
                        setDeletingTeam({ id: o.id, name: o.name });
                        setDeleteConfirmation("");
                        setTeamError("");
                      }}
                    >
                      <Trash2 size={14} /> Slett
                    </Button>
                  </div>
                </div>
                {(() => {
                  const team = classTeams.data?.teams.find((item) => item.id === o.id);
                  if (!team) return null;
                  const isCurrent = classTeams.data?.currentTeamId === o.id;
                  return (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="text-sm text-muted-foreground">
                        Medlemmer:{" "}
                        {team.members.length
                          ? team.members
                              .map(
                                (member) =>
                                  member.name?.trim() || member.email?.trim() || member.userId,
                              )
                              .join(", ")
                          : "Ingen medlemmer"}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={team.included}
                            disabled={
                              teamActionBusy ||
                              classTeams.isFetching ||
                              (isCurrent && team.included)
                            }
                            onChange={(event) => void changeMembership(o.id, event.target.checked)}
                          />
                          Jeg er på dette teamet
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="current-class-admin-team"
                            checked={isCurrent}
                            disabled={!team.included || teamActionBusy || classTeams.isFetching}
                            onChange={() => void changeCurrentTeam(o.id)}
                          />
                          Nåværende team
                        </label>
                      </div>
                      {isCurrent && (
                        <p className="text-xs text-muted-foreground">
                          Velg et annet nåværende team før du fjerner deg fra dette teamet.
                        </p>
                      )}
                    </div>
                  );
                })()}
                {editingTeam?.id === o.id && (
                  <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => void renameTeam(e)}>
                    <Input
                      autoFocus
                      required
                      minLength={2}
                      maxLength={100}
                      className="min-w-44 flex-1"
                      aria-label={`Nytt navn for ${o.name}`}
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        teamActionBusy ||
                        renameDraft.trim().length < 2 ||
                        renameDraft.trim() === editingTeam.name
                      }
                    >
                      Lagre navn
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingTeam(null)}>
                      Avbryt
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
          {classTeams.isPending && (
            <p className="mt-3 text-sm text-muted-foreground">Laster medlemmer…</p>
          )}
          {classTeams.isError && (
            <p role="alert" className="mt-3 text-sm text-risk">
              Kunne ikke hente teammedlemmene.
            </p>
          )}
          {teamError && (
            <p role="alert" className="mt-3 text-sm text-risk">
              {teamError}
            </p>
          )}
        </Card>
      )}
      {section === "class_settings" && state.classSpace?.role === "admin" && (
        <AdminFeedbackLog classId={state.classSpace.classId} />
      )}
      {section === "class_settings" && state.classSpace?.role === "admin" && (
        <ClassRecoverySettings classId={state.classSpace.classId} />
      )}
      <Dialog
        open={!!deletingTeam}
        onOpenChange={(open) => !open && !teamActionBusy && setDeletingTeam(null)}
      >
        <DialogContent>
          <DialogTitle>Slett teamet {deletingTeam?.name}?</DialogTitle>
          <DialogDescription>
            Alle kontakter, samtaler, intensjonsavtaler, invitasjoner og filer i teamet slettes
            permanent. Medlemmene beholder kontoene sine og eventuelle andre team.
          </DialogDescription>
          <p className="mt-3 break-all text-xs text-muted-foreground">
            Team-ID: {deletingTeam?.id}
          </p>
          <label className="mt-4 block text-sm font-medium" htmlFor="confirm-team-name">
            Skriv {deletingTeam?.name} for å bekrefte
          </label>
          <Input
            id="confirm-team-name"
            autoFocus
            className="mt-2"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
          />
          {teamError && (
            <p role="alert" className="mt-2 text-sm text-risk">
              {teamError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={teamActionBusy}
              onClick={() => setDeletingTeam(null)}
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              disabled={teamActionBusy || deleteConfirmation !== deletingTeam?.name}
              onClick={() => void deleteTeam()}
            >
              Slett team permanent
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {section === "profile" && (
        <div className="border-t border-border pt-5">
          <Button variant="outline" onClick={onSignOut}>
            <LogOut size={16} /> Logg ut
          </Button>
        </div>
      )}
    </div>
  );
}
