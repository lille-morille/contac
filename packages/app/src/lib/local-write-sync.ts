type RowKey = `${string}:${string}:${string}`;

const pending = new Map<RowKey, Set<Promise<void>>>();
const acknowledged = new Map<RowKey, Map<number, number>>();
let lastSweep = 0;

function sweepExpired(now: number) {
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [rowKey, revisions] of acknowledged) {
    for (const [revision, expiry] of revisions) if (expiry < now) revisions.delete(revision);
    if (!revisions.size) acknowledged.delete(rowKey);
  }
}

function key(teamId: string, entity: string, id: string): RowKey {
  return `${teamId}:${entity}:${id}`;
}

function revisionTime(revision: string): number {
  // Only matches an HTTP row to its Broadcast signal; conflict order is decided by the API.
  return Date.parse(revision);
}

// The database broadcast can arrive before the HTTP response. Hold its row read
// until the response tells us whether this browser already has that revision.
export function beginLocalRowWrite(teamId: string, entity: string, id: string) {
  const rowKey = key(teamId, entity, id);
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes = pending.get(rowKey) ?? new Set<Promise<void>>();
  writes.add(done);
  pending.set(rowKey, writes);
  return (revision?: string) => {
    if (revision) {
      const time = revisionTime(revision);
      if (Number.isFinite(time)) {
        sweepExpired(Date.now());
        const rows = acknowledged.get(rowKey) ?? new Map<number, number>();
        rows.set(time, Date.now() + 30_000);
        acknowledged.set(rowKey, rows);
      }
    }
    writes.delete(done);
    if (writes.size === 0) pending.delete(rowKey);
    release();
  };
}

export async function needsRowRead(change: {
  teamId: string;
  entity: string;
  id: string;
  revision: string;
}): Promise<boolean> {
  const rowKey = key(change.teamId, change.entity, change.id);
  const writes = pending.get(rowKey);
  if (writes?.size) await Promise.all(writes);
  const time = revisionTime(change.revision);
  const rows = acknowledged.get(rowKey);
  if (!rows || !Number.isFinite(time)) return true;
  const now = Date.now();
  for (const [revision, expiry] of rows) if (expiry < now) rows.delete(revision);
  if (rows.size === 0) acknowledged.delete(rowKey);
  return !rows.has(time);
}
