import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import * as Y from "yjs";
import { ApiError, request } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { ensureRealtimeAuth, getSupabase } from "../lib/supabase.ts";
import { useTeamRealtime } from "../lib/team-realtime.tsx";
import { Button } from "./ui/button.tsx";
import { Textarea } from "./ui/textarea.tsx";

type Kind = "note" | "summary" | "transcript" | "loi-section" | "loi-signature";
function fromBase64(input: string) {
  const binary = atob(input);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function toBase64(input: Uint8Array) {
  let binary = "";
  for (let index = 0; index < input.length; index += 8192)
    binary += String.fromCharCode(...input.subarray(index, index + 8192));
  return btoa(binary);
}
function replaceText(text: Y.Text, next: string) {
  const current = text.toString();
  if (current === next) return;
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start++;
  let end = 0;
  while (
    end < current.length - start &&
    end < next.length - start &&
    current[current.length - end - 1] === next[next.length - end - 1]
  )
    end++;
  text.doc?.transact(() => {
    text.delete(start, current.length - start - end);
    text.insert(start, next.slice(start, next.length - end));
  });
}

export function LiveText({
  kind,
  id,
  initialText,
  disabled,
  className,
  onSelect,
}: {
  kind: Kind;
  id: string;
  initialText: string;
  disabled?: boolean;
  className?: string;
  onSelect?: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
}) {
  const { org } = useOrg();
  const { setEditing } = useTeamRealtime();
  const [value, setValue] = useState(initialText);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [remoteText, setRemoteText] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const docRef = useRef<Y.Doc | null>(null);
  const pendingRef = useRef<Uint8Array[]>([]);
  const sendingRef = useRef(false);
  const replacementRef = useRef<string | null>(null);
  const latestSnapshotRef = useRef<string | null>(null);
  const remoteTextRef = useRef<string | null>(null);
  const updateRemote = useCallback((next: string | null) => {
    remoteTextRef.current = next;
    setRemoteText(next);
  }, []);
  const orgId = org?.id;
  const documentKey = `${kind}:${id}`;

  useEffect(() => {
    if (!orgId) return;
    const sb = getSupabase();
    let alive = true;
    let channelReady = false;
    const buffered: Uint8Array[] = [];
    const endpoint = `/org/collab/${kind}/${id}`;
    const install = (encoded: string) => {
      docRef.current?.destroy();
      const doc = new Y.Doc();
      Y.applyUpdate(doc, fromBase64(encoded), "remote");
      const text = doc.getText("content");
      text.observe(() => {
        if (alive) setValue(text.toString());
      });
      doc.on("update", (update: Uint8Array, origin: unknown) => {
        if (origin !== "remote" && alive) {
          pendingRef.current.push(update);
          void flush();
        }
      });
      docRef.current = doc;
      setValue(text.toString());
      for (const update of buffered.splice(0)) Y.applyUpdate(doc, update, "remote");
      setReady(channelReady);
      updateRemote(null);
      setError("");
      if (replacementRef.current !== null) {
        const replacement = replacementRef.current;
        replacementRef.current = null;
        replaceText(text, replacement);
      }
    };
    const fetchSnapshot = async () => {
      try {
        const snapshot = await request<{ state: string; version: number }>(endpoint, orgId);
        if (!alive) return;
        latestSnapshotRef.current = snapshot.state;
        const remote = new Y.Doc();
        Y.applyUpdate(remote, fromBase64(snapshot.state));
        const remoteValue = remote.getText("content").toString();
        remote.destroy();
        if (pendingRef.current.length) {
          updateRemote(remoteValue);
          setError(
            "Tilkoblingen ble avbrutt eller teksten ble endret utenfor editoren. Velg hvilken tekst som skal brukes.",
          );
          return;
        }
        install(snapshot.state);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Kunne ikke åpne editoren.");
      }
    };
    const flush = async () => {
      if (
        sendingRef.current ||
        !channelReady ||
        !pendingRef.current.length ||
        remoteTextRef.current !== null
      )
        return;
      sendingRef.current = true;
      while (alive && pendingRef.current.length && remoteTextRef.current === null) {
        const batch = pendingRef.current.slice();
        const update = batch.length === 1 ? batch[0]! : Y.mergeUpdates(batch);
        try {
          await request(endpoint, orgId, { update: toBase64(update) });
          if (!alive) break;
          pendingRef.current.splice(0, batch.length);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Endringen ble ikke lagret.");
          if (cause instanceof ApiError && cause.status === 409) void fetchSnapshot();
          else void fetchSnapshot();
          break;
        }
      }
      sendingRef.current = false;
    };
    const channel = sb.channel(`doc:${orgId}:${kind}:${id}`, { config: { private: true } });
    const configured = channel
      .on("broadcast", { event: "update" }, ({ payload }) => {
        const event = payload as { teamId?: string; kind?: string; id?: string; update?: string };
        if (
          event.teamId !== orgId ||
          event.kind !== kind ||
          event.id !== id ||
          typeof event.update !== "string"
        )
          return;
        try {
          const update = fromBase64(event.update);
          if (docRef.current) Y.applyUpdate(docRef.current, update, "remote");
          else buffered.push(update);
        } catch {
          /* Recovery read on focus or reconnect repairs a malformed update. */
        }
      })
      .on("broadcast", { event: "reset" }, ({ payload }) => {
        const event = payload as { teamId?: string; kind?: string; id?: string };
        if (event.teamId === orgId && event.kind === kind && event.id === id) void fetchSnapshot();
      });
    void sb.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session?.access_token) throw new Error("Logg inn for å redigere teksten.");
        return ensureRealtimeAuth(data.session.access_token);
      })
      .then(() => {
        if (!alive) return;
        configured.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            channelReady = true;
            void fetchSnapshot();
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            channelReady = false;
            if (alive) setError("Live redigering er frakoblet. Teksten din er beholdt lokalt.");
          }
        });
      })
      .catch((cause) => {
        if (alive)
          setError(cause instanceof Error ? cause.message : "Live redigering er utilgjengelig.");
      });
    const onFocus = () => void fetchSnapshot();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      void sb.removeChannel(channel);
      docRef.current?.destroy();
      docRef.current = null;
      pendingRef.current = [];
      sendingRef.current = false;
      setEditing(null);
    };
  }, [orgId, kind, id, generation, setEditing, updateRemote]);

  const previousInitialRef = useRef(initialText);
  useEffect(() => {
    const changed = previousInitialRef.current !== initialText;
    previousInitialRef.current = initialText;
    if (!changed || !ready || !orgId) return;
    const timer = window.setTimeout(() => {
      if (
        !docRef.current ||
        docRef.current.getText("content").toString() === initialText ||
        pendingRef.current.length ||
        remoteTextRef.current !== null
      )
        return;
      void request<{ state: string }>(`/org/collab/${kind}/${id}`, orgId)
        .then((snapshot) => {
          const latest = new Y.Doc();
          try {
            Y.applyUpdate(latest, fromBase64(snapshot.state));
            const text = latest.getText("content").toString();
            if (
              docRef.current?.getText("content").toString() !== text &&
              !pendingRef.current.length &&
              remoteTextRef.current === null
            ) {
              latestSnapshotRef.current = snapshot.state;
              updateRemote(text);
              setError("Teksten ble endret utenfor live editoren. Sammenlign før du fortsetter.");
            }
          } finally {
            latest.destroy();
          }
        })
        .catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [initialText, ready, orgId, kind, id, updateRemote]);

  const choose = (useLocal: boolean) => {
    if (!latestSnapshotRef.current) return;
    replacementRef.current = useLocal ? value : null;
    pendingRef.current = [];
    updateRemote(null);
    setError("");
    setReady(false);
    setGeneration((current) => current + 1);
  };

  return (
    <div>
      <Textarea
        className={className}
        value={value}
        disabled={disabled || !ready || remoteText !== null || !!error}
        onFocus={() => setEditing(documentKey)}
        onBlur={() => setEditing(null)}
        onSelect={onSelect}
        onChange={(event) => {
          const text = docRef.current?.getText("content");
          if (text) replaceText(text, event.target.value);
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-risk">
          {error}
        </p>
      )}
      {remoteText !== null && (
        <div className="mt-2 rounded-xl border border-warn bg-warn-soft p-3 text-sm">
          <p className="font-medium">Nyeste lagrede tekst</p>
          <p className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap">
            {remoteText || "(tomt)"}
          </p>
          <p className="mt-2 font-medium">Din lokale tekst</p>
          <p className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap">{value || "(tomt)"}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => choose(false)}>
              Bruk nyeste
            </Button>
            <Button size="sm" onClick={() => choose(true)}>
              Bruk min tekst
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
