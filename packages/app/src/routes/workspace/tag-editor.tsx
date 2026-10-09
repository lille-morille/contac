import { Pencil, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { type Domain, type Tag } from "./model.tsx";
export function PersonTagEditor({
  contactId,
  tags,
  selectedIds,
  mutate,
  busy,
}: {
  contactId: string;
  tags: Tag[];
  selectedIds: string[];
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      const created = await mutate<Tag>("/person-tags", {
        name: name.trim(),
        description: description.trim(),
      });
      await mutate(`/contacts/${contactId}/tags`, {
        tagIds: [...selectedIds, created.id],
      });
      setName("");
      setDescription("");
    } catch {
      // The workspace error banner explains the failed save.
    }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className="rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
      >
        <Plus size={12} className="mr-1 inline" /> Ny/rediger tagger
      </PopoverTrigger>
      <PopoverContent className="max-h-[min(600px,calc(100vh-32px))] w-[min(380px,calc(100vw-24px))] overflow-y-auto p-3">
        <p className="text-sm font-medium">Persontagger</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Beskriv når taggene skal brukes for AI-forslag.
        </p>
        <div className="mt-3 space-y-2">
          {tags.map((tag) => (
            <TagDescription
              key={tag.id}
              tag={tag}
              pathPrefix="/person-tags"
              mutate={mutate}
              busy={busy}
            />
          ))}
        </div>
        <form
          className="mt-4 space-y-2 border-t border-border pt-3"
          onSubmit={(event) => void create(event)}
        >
          <p className="text-sm font-medium">Ny persontagg</p>
          <Input
            required
            maxLength={100}
            placeholder="Navn"
            aria-label="Navn på ny persontagg"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Textarea
            required
            maxLength={500}
            placeholder="Når skal denne taggen brukes?"
            aria-label="Beskrivelse av ny persontagg"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={busy || !name.trim() || !description.trim()}>
            Opprett og legg til
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function TagDescription({
  tag,
  pathPrefix,
  mutate,
  busy,
}: {
  tag: Tag | Domain;
  pathPrefix: "/person-tags" | "/domains";
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [expected, setExpected] = useState<string | null>(null);
  const showEditor = editing && tag.description === expected;
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate(`${pathPrefix}/${tag.id}`, {
        description: draft.trim(),
        expected: {
          description: expected,
          ...(pathPrefix === "/domains" ? { revision: (tag as Domain).revision } : {}),
        },
      });
      setEditing(false);
    } catch {
      /* The workspace error banner explains the failure. */
    }
  }
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant="neutral">{tag.name}</Badge>
          {!showEditor && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {tag.description || "Mangler beskrivelse · AI bruker ikke denne taggen."}
            </p>
          )}
        </div>
        {!showEditor && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(tag.description ?? "");
              setExpected(tag.description);
              setEditing(true);
            }}
          >
            <Pencil size={14} /> Rediger
          </Button>
        )}
      </div>
      {showEditor && (
        <form className="mt-3 space-y-2" onSubmit={(event) => void save(event)}>
          <Textarea
            autoFocus
            required
            maxLength={500}
            aria-label={`Beskrivelse for ${tag.name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
              Lagre beskrivelse
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Avbryt
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
