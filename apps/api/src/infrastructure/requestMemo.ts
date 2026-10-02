// apps/api/src/infrastructure/requestMemo.ts
// Request-scoped "do this once" (2026-10-02: the Dashboard overview took ~5 s because every stage's read re-ran the
// review refresh of every stage before it — Scene DNA was re-checked by Storyboard, Visual, Audio and Editorial).
// A request opts in with enableRequestMemo(db); the db client is per request, so nothing leaks between requests. Only
// reads opt in: a request that writes and then needs a fresh review keeps the normal behaviour.
const memo = new WeakMap<object, Map<string, Promise<unknown>>>();

export function enableRequestMemo(db: object) {
  if (!memo.has(db)) memo.set(db, new Map());
}

/** Runs fn once per (db, key) when the request opted in; otherwise every time. */
export function once<T>(db: object, key: string, fn: () => Promise<T>): Promise<T> {
  const m = memo.get(db);
  if (!m) return fn();
  if (!m.has(key)) m.set(key, fn());
  return m.get(key) as Promise<T>;
}
