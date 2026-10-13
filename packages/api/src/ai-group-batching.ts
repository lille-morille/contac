export type GroupConversationInput = {
  id: string;
  kind: string;
  date: string;
  participants: string[];
  contactNames: string[];
  summary: string;
  transcript: string;
};

export type GroupSourcePart = Pick<
  GroupConversationInput,
  "id" | "kind" | "date" | "participants" | "contactNames"
> & {
  field: "summary" | "transcript";
  part: number;
  text: string;
};

export type GroupBatchRequest =
  | { stage: "source"; parts: GroupSourcePart[] }
  | { stage: "merge"; summaries: { part: number; summary: string }[] };

export const GROUP_BATCH_MAX_CHARS = 40_000;

function pack<T>(items: T[], maxChars: number): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  for (const item of items) {
    if (JSON.stringify([item]).length > maxChars)
      throw new Error("En del av samtalegrunnlaget er for stor til å oppsummere");
    if (batch.length && JSON.stringify([...batch, item]).length > maxChars) {
      batches.push(batch);
      batch = [];
    }
    batch.push(item);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function chunkGroupSources(
  conversations: GroupConversationInput[],
  maxChars = GROUP_BATCH_MAX_CHARS,
): GroupSourcePart[][] {
  const parts: GroupSourcePart[] = [];
  for (const conversation of conversations) {
    const metadata = {
      id: conversation.id,
      kind: conversation.kind,
      date: conversation.date,
      participants: conversation.participants,
      contactNames: conversation.contactNames,
    };
    for (const field of ["summary", "transcript"] as const) {
      const content = conversation[field];
      if (!content.trim()) continue;
      let offset = 0;
      let part = 1;
      while (offset < content.length) {
        let low = 1;
        let high = content.length - offset;
        let length = 0;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          const candidate = {
            ...metadata,
            field,
            part,
            text: content.slice(offset, offset + middle),
          };
          if (JSON.stringify([candidate]).length <= maxChars) {
            length = middle;
            low = middle + 1;
          } else high = middle - 1;
        }
        const end = offset + length;
        if (
          end < content.length &&
          /[\uD800-\uDBFF]/.test(content[end - 1]!) &&
          /[\uDC00-\uDFFF]/.test(content[end]!)
        )
          length--;
        if (!length) throw new Error("Samtalens metadata er for stor til å oppsummere");
        parts.push({ ...metadata, field, part, text: content.slice(offset, offset + length) });
        offset += length;
        part++;
      }
    }
  }
  return pack(parts, maxChars);
}

async function mapConcurrent<T, U>(
  items: T[],
  workerCount: number,
  map: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workerCount, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await map(items[index]!);
      }
    }),
  );
  return results;
}

export async function summarizeGroupInBatches(
  conversations: GroupConversationInput[],
  generate: (request: GroupBatchRequest) => Promise<string>,
  maxChars = GROUP_BATCH_MAX_CHARS,
): Promise<string> {
  const batches = chunkGroupSources(conversations, maxChars);
  if (!batches.length) throw new Error("Ingen tillatte samtaler i gruppen");
  let summaries = await mapConcurrent(batches, 4, (parts) => generate({ stage: "source", parts }));
  while (summaries.length > 1) {
    const numbered = summaries.map((summary, index) => ({ part: index + 1, summary }));
    const mergeBatches = pack(numbered, maxChars);
    if (mergeBatches.length >= summaries.length)
      throw new Error("Delsammendragene er for store til å samles");
    summaries = await mapConcurrent(mergeBatches, 4, (items) =>
      generate({ stage: "merge", summaries: items }),
    );
  }
  return summaries[0]!;
}
