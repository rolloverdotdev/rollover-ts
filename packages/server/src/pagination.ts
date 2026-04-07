import type { Page, ListOptions } from "./types.js";

/**
 * Iterates through a paginated list endpoint one page at a time, yielding
 * each page as it arrives. Defaults to 100 items per page when limit is
 * not specified.
 *
 * @example
 * ```typescript
 * for await (const page of paginate((opts) => ro.listPlans(opts))) {
 *   for (const plan of page.data) {
 *     console.log(plan.name);
 *   }
 * }
 * ```
 */
export async function* paginate<T>(
  fn: (opts: ListOptions) => Promise<Page<T>>,
  opts?: ListOptions,
): AsyncGenerator<Page<T>> {
  const o: ListOptions = { ...opts };
  if (!o.limit || o.limit <= 0) o.limit = 100;

  while (true) {
    const page = await fn(o);
    if (page.data.length === 0) break;
    yield page;

    o.offset = (o.offset ?? 0) + page.data.length;
    if (page.data.length < o.limit || o.offset >= page.total) break;
  }
}

/**
 * Fetches all pages from a list endpoint and returns every item in a
 * single array, handling pagination automatically.
 *
 * @example
 * ```typescript
 * const allPlans = await collect((opts) => ro.listPlans(opts));
 * ```
 */
export async function collect<T>(
  fn: (opts: ListOptions) => Promise<Page<T>>,
  opts?: ListOptions,
): Promise<T[]> {
  const all: T[] = [];
  for await (const page of paginate(fn, opts)) {
    all.push(...page.data);
  }
  return all;
}
