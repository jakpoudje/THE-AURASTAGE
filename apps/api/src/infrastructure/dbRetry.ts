// apps/api/src/infrastructure/dbRetry.ts
// One retry when the database cancelled a call for running too long (Postgres 57014, BUILD_PLAN item 50: under a
// whole-film run the free tier cancels the odd save, and the work it carried — a finished picture or recording — was
// lost). A cancelled statement is rolled back, so running it again can't double anything. No other error is retried.
type Result<T> = { data: T; error: { code?: string; message?: string } | null };

export const isStatementTimeout = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "57014" || /canceling statement due to statement timeout/i.test(e.message ?? ""));

export async function retryOnTimeout<T>(call: () => PromiseLike<Result<T>>, waitMs = 1500): Promise<Result<T>> {
  const first = await call();
  if (!isStatementTimeout(first.error)) return first;
  await new Promise((r) => setTimeout(r, waitMs + Math.floor(Math.random() * 500)));
  return call();
}
