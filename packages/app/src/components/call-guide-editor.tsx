import { useQueryClient } from "@tanstack/react-query";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Placeholder } from "@tiptap/extensions";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import {
  AlertCircle,
  Bold,
  Check,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "../lib/api.ts";
import {
  callGuideExtensions,
  normalizeCallGuideMarkdown,
  parseCallGuideMarkdown,
  serializeCallGuideMarkdown,
} from "../lib/call-guide-markdown.ts";
import {
  guideChanges,
  incomingGuideAction,
  isRetryableSaveError,
  saveRetryDelay,
  type GuideSnapshot,
  type GuideText,
} from "../lib/call-guide-sync.ts";
import {
  CALL_GUIDE_BODY_MAX_LENGTH,
  CALL_GUIDE_DEFAULT_TITLE,
  CALL_GUIDE_TITLE_MAX_LENGTH,
  callGuideConflict,
  callGuideKeys,
  updateCallGuide,
  type CallGuide,
} from "../lib/call-guides.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import "./call-guide-editor.css";

const AUTOSAVE_DELAY = 800;

type SaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; message: string; retrying: boolean }
  | { kind: "conflict" };

/**
 * Text a member typed that has not reached the server, kept outside React so a
 * save that fails after the editor closes is restored the next time it opens.
 */
const unsavedText = new Map<string, GuideText & { revision: number }>();

function snapshotOf(guide: CallGuide): GuideSnapshot {
  return {
    revision: guide.revision,
    title: guide.title,
    body: normalizeCallGuideMarkdown(guide.body),
  };
}

type SlashItem = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  icon: typeof Pilcrow;
  run: (editor: Editor, range: Range) => void;
};

const slashItems: SlashItem[] = [
  {
    id: "paragraph",
    label: "Tekst",
    hint: "Vanlig avsnitt",
    keywords: ["tekst", "avsnitt", "paragraph", "p"],
    icon: Pilcrow,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  ...([1, 2, 3] as const).map(
    (level): SlashItem => ({
      id: `heading${level}`,
      label: `Overskrift ${level}`,
      hint: `${"#".repeat(level)} mellomrom`,
      keywords: ["overskrift", "tittel", "heading", `h${level}`],
      icon: [Heading1, Heading2, Heading3][level - 1]!,
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level }).run(),
    }),
  ),
  {
    id: "bulletList",
    label: "Punktliste",
    hint: "- mellomrom",
    keywords: ["punktliste", "liste", "kulepunkt", "bullet", "ul"],
    icon: List,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "orderedList",
    label: "Nummerert liste",
    hint: "1. mellomrom",
    keywords: ["nummerert", "liste", "tall", "ordered", "ol"],
    icon: ListOrdered,
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "blockquote",
    label: "Sitat",
    hint: "> mellomrom",
    keywords: ["sitat", "quote", "blockquote"],
    icon: Quote,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    id: "horizontalRule",
    label: "Skillelinje",
    hint: "---",
    keywords: ["skillelinje", "linje", "divider", "hr", "skille"],
    icon: Minus,
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

function filterSlashItems(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return slashItems;
  return slashItems.filter(
    (item) =>
      item.label.toLowerCase().includes(needle) ||
      item.keywords.some((keyword) => keyword.startsWith(needle)),
  );
}

type SlashState = { items: SlashItem[]; index: number; command: (item: SlashItem) => void };
type SlashHandlers = {
  start: (props: SuggestionProps<SlashItem, SlashItem>) => void;
  update: (props: SuggestionProps<SlashItem, SlashItem>) => void;
  keyDown: (props: SuggestionKeyDownProps) => boolean;
  exit: () => void;
};

function slashCommand(handlers: { current: SlashHandlers }) {
  return Extension.create({
    name: "callGuideSlashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: "/",
          decorationClass: "call-guide-slash",
          items: ({ query }) => filterSlashItems(query),
          command: ({ editor, range, props }) => props.run(editor, range),
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from);
            return $from.parent.type.name === "paragraph" || $from.parent.type.name === "heading";
          },
          render: () => ({
            onStart: (props) => handlers.current.start(props),
            onUpdate: (props) => handlers.current.update(props),
            onKeyDown: (props) => handlers.current.keyDown(props),
            onExit: () => handlers.current.exit(),
          }),
        }),
      ];
    },
  });
}

/** Pasted Markdown (plain text without formatted HTML) becomes the supported blocks. */
const markdownPaste = Extension.create({
  name: "callGuideMarkdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => {
            const text = event.clipboardData?.getData("text/plain");
            const html = event.clipboardData?.getData("text/html") ?? "";
            if (!text) return false;
            const formattedHtml = /<(h[1-6]|ul|ol|li|strong|b|em|i|a|blockquote|hr|table)\b/i.test(
              html,
            );
            if (html && formattedHtml) return false;
            const content = parseCallGuideMarkdown(text).content ?? [];
            if (!content.length) return false;
            const single = content.length === 1 && content[0]?.type === "paragraph";
            return editor.commands.insertContent(single ? (content[0]?.content ?? []) : content);
          },
        },
      }),
    ];
  },
});

/** Cmd/Ctrl+K on selected text edits its link; otherwise the workspace command palette opens. */
function linkShortcut(open: { current: () => boolean }) {
  return Extension.create({
    name: "callGuideLinkShortcut",
    addKeyboardShortcuts() {
      return { "Mod-k": () => open.current() };
    },
  });
}

export function CallGuideEditor({
  teamId,
  guide,
  presence,
  autoFocusTitle,
  onTitleChange,
  onDelete,
}: {
  teamId: string;
  guide: CallGuide;
  /** Avatars of teammates who have this guide open. */
  presence: ReactNode;
  autoFocusTitle?: boolean;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const guideId = guide.id;
  const initial = useMemo(() => {
    const base = snapshotOf(guide);
    const draft = unsavedText.get(guide.id);
    if (draft && draft.revision === guide.revision)
      return { base, local: { title: draft.title, body: draft.body } };
    unsavedText.delete(guide.id);
    return { base, local: { title: base.title, body: base.body } };
    // Only the guide the editor mounted with; later versions go through reconciliation.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const base = useRef<GuideSnapshot>(initial.base);
  const local = useRef<GuideText>(initial.local);
  const [title, setTitle] = useState(initial.local.title);
  const [status, setStatus] = useState<SaveStatus>(
    guideChanges(initial.base, initial.local) ? { kind: "pending" } : { kind: "idle" },
  );
  const [saveSettled, setSaveSettled] = useState(0);
  const inFlight = useRef(false);
  const saveAgain = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const retryTimer = useRef<number | undefined>(undefined);
  const attempts = useRef(0);
  const mounted = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const dirty = () => !!guideChanges(base.current, local.current);

  const clearTimers = () => {
    window.clearTimeout(timer.current);
    window.clearTimeout(retryTimer.current);
    timer.current = undefined;
    retryTimer.current = undefined;
  };

  const editorRef = useRef<Editor | null>(null);

  /** Shows a committed version in the editor, keeping the caret where it can. */
  const showCommitted = useCallback(
    (next: CallGuide) => {
      base.current = snapshotOf(next);
      local.current = { title: base.current.title, body: base.current.body };
      unsavedText.delete(next.id);
      setTitle(next.title);
      onTitleChange(next.title);
      const editor = editorRef.current;
      if (editor && !editor.isDestroyed) {
        const { from, to } = editor.state.selection;
        editor.commands.setContent(parseCallGuideMarkdown(base.current.body), {
          emitUpdate: false,
        });
        const size = editor.state.doc.content.size;
        try {
          editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
        } catch {
          // A position that no longer fits the new document leaves the default selection.
        }
      }
    },
    [onTitleChange],
  );

  const save = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (inFlight.current) {
      saveAgain.current = true;
      return;
    }
    const changes = guideChanges(base.current, local.current);
    if (!changes) {
      unsavedText.delete(guideId);
      if (mounted.current) setStatus((current) => (current.kind === "idle" ? current : { kind: "saved" }));
      return;
    }
    if ((changes.body?.length ?? 0) > CALL_GUIDE_BODY_MAX_LENGTH) {
      unsavedText.set(guideId, { ...local.current, revision: base.current.revision });
      if (mounted.current)
        setStatus({
          kind: "failed",
          message: "Guiden er for lang til å lagres. Fjern litt tekst.",
          retrying: false,
        });
      return;
    }
    const sent = { ...local.current };
    const sentRevision = base.current.revision;
    inFlight.current = true;
    if (mounted.current) setStatus({ kind: "saving" });
    try {
      const saved = await updateCallGuide(teamId, guideId, sentRevision, changes);
      attempts.current = 0;
      base.current = {
        revision: saved.revision,
        title: saved.title,
        body: saved.body === sent.body ? sent.body : normalizeCallGuideMarkdown(saved.body),
      };
      qc.setQueryData<CallGuide[]>(callGuideKeys.list(teamId), (old) =>
        old?.map((item) =>
          item.id === saved.id && item.revision <= saved.revision
            ? { ...saved, position: item.position }
            : item,
        ),
      );
      if (dirty()) {
        unsavedText.set(guideId, { ...local.current, revision: base.current.revision });
        saveAgain.current = true;
      } else {
        unsavedText.delete(guideId);
        if (mounted.current) setStatus({ kind: "saved" });
      }
    } catch (error) {
      const latest = callGuideConflict(error);
      if (latest) {
        qc.setQueryData<CallGuide[]>(callGuideKeys.list(teamId), (old) =>
          old?.map((item) => (item.id === latest.id ? { ...latest, position: item.position } : item)),
        );
        if (mounted.current) {
          showCommitted(latest);
          setStatus({ kind: "conflict" });
        } else unsavedText.delete(guideId);
        saveAgain.current = false;
      } else {
        unsavedText.set(guideId, { ...local.current, revision: sentRevision });
        const retrying = mounted.current && isRetryableSaveError(error);
        if (mounted.current) {
          setStatus({
            kind: "failed",
            message:
              error instanceof ApiError && error.status === 404
                ? "Samtaleguiden finnes ikke lenger."
                : error instanceof ApiError && !retrying
                  ? `Kunne ikke lagre: ${error.message}`
                  : "Kunne ikke lagre. Teksten er beholdt.",
            retrying,
          });
        }
        if (retrying) {
          attempts.current += 1;
          window.clearTimeout(retryTimer.current);
          retryTimer.current = window.setTimeout(
            () => void saveRef.current(),
            saveRetryDelay(attempts.current),
          );
        }
        saveAgain.current = false;
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaveSettled((value) => value + 1);
    }
    if (saveAgain.current) {
      saveAgain.current = false;
      if (mounted.current) scheduleRef.current();
      else void saveRef.current();
    }
  }, [teamId, guideId, qc, showCommitted]);
  const saveRef = useRef(save);
  saveRef.current = save;

  function schedule() {
    window.clearTimeout(timer.current);
    if (!dirty()) {
      if (!inFlight.current) void saveRef.current();
      return;
    }
    unsavedText.set(guideId, { ...local.current, revision: base.current.revision });
    setStatus((current) =>
      current.kind === "failed" && current.retrying ? current : { kind: "pending" },
    );
    timer.current = window.setTimeout(() => void saveRef.current(), AUTOSAVE_DELAY);
  }
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  // Slash menu state lives in React; the Suggestion plugin positions the element.
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;
  const slashElement = useRef<HTMLDivElement>(null);
  const slashUnmount = useRef<(() => void) | null>(null);
  const slashHandlers = useRef<SlashHandlers>({
    start: () => undefined,
    update: () => undefined,
    keyDown: () => false,
    exit: () => undefined,
  });
  slashHandlers.current = {
    start: (props) => {
      setSlash({ items: props.items, index: 0, command: props.command });
      if (slashElement.current) {
        slashUnmount.current?.();
        slashUnmount.current = props.mount(slashElement.current);
      }
    },
    update: (props) =>
      setSlash((current) => ({
        items: props.items,
        index: Math.min(current?.index ?? 0, Math.max(0, props.items.length - 1)),
        command: props.command,
      })),
    keyDown: ({ event }) => {
      const current = slashRef.current;
      if (!current) return false;
      if (event.key === "Escape") {
        setSlash(null);
        return true;
      }
      if (!current.items.length) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setSlash({
          ...current,
          index: (current.index + step + current.items.length) % current.items.length,
        });
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = current.items[current.index];
        if (item) current.command(item);
        return true;
      }
      return false;
    },
    exit: () => {
      slashUnmount.current?.();
      slashUnmount.current = null;
      setSlash(null);
    },
  };

  const [linkEditing, setLinkEditing] = useState<string | null>(null);
  const openLink = useRef<() => boolean>(() => false);
  openLink.current = () => {
    const editor = editorRef.current;
    if (!editor || editor.state.selection.empty) return false;
    setLinkEditing((editor.getAttributes("link").href as string | undefined) ?? "");
    return true;
  };

  const extensions = useMemo(
    () => [
      ...callGuideExtensions,
      Placeholder.configure({ placeholder: "Skriv her, eller trykk / for å sette inn en blokk" }),
      slashCommand(slashHandlers),
      markdownPaste,
      linkShortcut(openLink),
    ],
    [],
  );

  const initialContent = useMemo(() => parseCallGuideMarkdown(initial.local.body), [initial]);
  const editor = useEditor({
    extensions,
    content: initialContent,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: "call-guide-prose",
        "aria-label": "Innhold i samtaleguiden",
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor }) => {
      local.current = { ...local.current, body: serializeCallGuideMarkdown(editor.getJSON()) };
      scheduleRef.current();
    },
  });
  editorRef.current = editor;

  // Restore a pending save from an earlier failed attempt.
  useEffect(() => {
    if (guideChanges(initial.base, initial.local)) scheduleRef.current();
  }, [initial]);

  // A newer committed version from a refetch: show it unless our own save or
  // unsaved edits decide what happens (see incomingGuideAction).
  useEffect(() => {
    const action = incomingGuideAction(base.current, guide, {
      saving: inFlight.current,
      dirty: dirty(),
    });
    if (action === "apply") showCommitted(guide);
    // Re-evaluated when the committed version changes or our own save settles.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [guide.revision, guide.body, guide.title, saveSettled, showCommitted]);

  // Save on leaving the editor, closing the page, or switching guides.
  useEffect(() => {
    mounted.current = true;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty() && !inFlight.current) return;
      void saveRef.current();
      event.preventDefault();
    };
    const onOnline = () => {
      if (dirty()) void saveRef.current();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
      mounted.current = false;
      clearTimers();
      if (dirty()) void saveRef.current();
    };
  }, []);

  useEffect(() => {
    if (autoFocusTitle) titleRef.current?.select();
  }, [autoFocusTitle]);

  const onTitleInput = (value: string) => {
    setTitle(value);
    onTitleChange(value);
    local.current = { ...local.current, title: value };
    scheduleRef.current();
  };

  const retryNow = () => {
    window.clearTimeout(retryTimer.current);
    void saveRef.current();
  };

  return (
    <div
      ref={containerRef}
      className="call-guide-editor flex min-h-0 flex-1 flex-col"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null) && dirty())
          void saveRef.current();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <SaveIndicator status={status} onRetry={retryNow} />
        <div className="ml-auto flex items-center gap-2">
          {presence}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-risk"
            onClick={onDelete}
          >
            <Trash2 /> Slett
          </Button>
        </div>
      </div>
      <input
        ref={titleRef}
        value={title}
        maxLength={CALL_GUIDE_TITLE_MAX_LENGTH}
        placeholder={CALL_GUIDE_DEFAULT_TITLE}
        aria-label="Tittel på samtaleguiden"
        className="mt-3 w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/70"
        onChange={(event) => onTitleInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || (event.key === "ArrowDown" && !event.shiftKey)) {
            event.preventDefault();
            editor?.commands.focus("start");
          }
        }}
      />
      <div className="mt-4 min-h-0 flex-1">
        {editor ? (
          <>
            <BubbleMenu
              editor={editor}
              shouldShow={({ editor: current, state }) =>
                current.isEditable &&
                !state.selection.empty &&
                !current.isActive("horizontalRule") &&
                current.view.hasFocus()
              }
              options={{ placement: "top" }}
              className="glass-strong z-40 flex items-center gap-0.5 rounded-xl p-1"
            >
              {linkEditing !== null ? (
                <form
                  className="flex items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const href = linkEditing.trim();
                    const chain = editor.chain().focus().extendMarkRange("link");
                    if (href) chain.setLink({ href }).run();
                    else chain.unsetLink().run();
                    setLinkEditing(null);
                  }}
                >
                  <Input
                    autoFocus
                    value={linkEditing}
                    onChange={(event) => setLinkEditing(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setLinkEditing(null);
                        editor.commands.focus();
                      }
                    }}
                    placeholder="https://"
                    aria-label="Lenkeadresse"
                    className="h-8 w-56"
                  />
                  <Button type="submit" size="sm">
                    {linkEditing.trim() ? "Lagre" : "Fjern"}
                  </Button>
                </form>
              ) : (
                <>
                  <MarkButton
                    label="Fet (Cmd/Ctrl+B)"
                    active={editor.isActive("bold")}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                  >
                    <Bold />
                  </MarkButton>
                  <MarkButton
                    label="Kursiv (Cmd/Ctrl+I)"
                    active={editor.isActive("italic")}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                  >
                    <Italic />
                  </MarkButton>
                  <MarkButton
                    label="Lenke (Cmd/Ctrl+K)"
                    active={editor.isActive("link")}
                    onClick={() => openLink.current()}
                  >
                    <Link2 />
                  </MarkButton>
                </>
              )}
            </BubbleMenu>
            <EditorContent editor={editor} />
          </>
        ) : (
          <div
            className="call-guide-prose min-h-64 text-muted-foreground"
            aria-hidden
          >
            Laster redigering …
          </div>
        )}
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <div
            ref={slashElement}
            role="listbox"
            aria-label="Sett inn blokk"
            hidden={!slash}
            className="glass-strong z-50 w-64 rounded-2xl p-1.5 text-sm"
            style={{ position: "fixed", top: 0, left: 0 }}
          >
            {slash && slash.items.length === 0 && (
              <p className="px-2.5 py-1.5 text-muted-foreground">Ingen blokker</p>
            )}
            {slash?.items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === slash.index}
                  tabIndex={-1}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none",
                    index === slash.index && "bg-primary-soft",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setSlash({ ...slash, index })}
                  onClick={() => slash.command(item)}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

function MarkButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-lg transition-colors hover:bg-muted [&_svg]:size-4",
        active ? "text-primary" : "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status.kind === "failed")
    return (
      <p role="alert" className="flex items-center gap-1.5 text-xs text-risk">
        <AlertCircle className="size-3.5" aria-hidden />
        {status.message}
        {status.retrying && " Prøver igjen …"}
        <button type="button" className="font-medium underline" onClick={onRetry}>
          Prøv nå
        </button>
      </p>
    );
  if (status.kind === "conflict")
    return (
      <p role="status" className="text-xs text-muted-foreground">
        En teamkollega lagret en nyere versjon, som vises nå. Endringene dine ble ikke lagret.
      </p>
    );
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {status.kind === "saving" || status.kind === "pending" ? (
        "Lagrer …"
      ) : status.kind === "saved" ? (
        <>
          <Check className="size-3.5" aria-hidden /> Lagret
        </>
      ) : (
        "Endringer lagres automatisk"
      )}
    </p>
  );
}
