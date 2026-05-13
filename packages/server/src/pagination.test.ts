import { describe, test, expect } from "bun:test";
import { paginate, collect } from "./pagination.js";
import type { Page, ListOptions } from "./types.js";

function mockPageFn(pages: { data: string[]; total: number }[]) {
  let callIndex = 0;
  return (opts: ListOptions): Promise<Page<string>> => {
    const page = pages[callIndex] ?? { data: [], total: 0 };
    callIndex++;
    return Promise.resolve({
      data: page.data,
      total: page.total,
      limit: opts.limit ?? 0,
      offset: opts.offset ?? 0,
    });
  };
}

describe("paginate", () => {
  test("iterates through all pages", async () => {
    const fn = mockPageFn([
      { data: ["a", "b"], total: 5 },
      { data: ["c", "d"], total: 5 },
      { data: ["e"], total: 5 },
    ]);

    const results: string[] = [];
    for await (const page of paginate(fn, { limit: 2 })) {
      results.push(...page.data);
    }
    expect(results).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("stops on empty page", async () => {
    const fn = mockPageFn([
      { data: ["a", "b"], total: 4 },
      { data: [], total: 4 },
    ]);

    const results: string[] = [];
    for await (const page of paginate(fn, { limit: 2 })) {
      results.push(...page.data);
    }
    expect(results).toEqual(["a", "b"]);
  });

  test("stops on short page", async () => {
    const fn = mockPageFn([
      { data: ["a", "b"], total: 3 },
      { data: ["c"], total: 3 },
    ]);

    const results: string[] = [];
    for await (const page of paginate(fn, { limit: 2 })) {
      results.push(...page.data);
    }
    expect(results).toEqual(["a", "b", "c"]);
  });

  test("defaults to limit 100", async () => {
    let capturedLimit = 0;
    const fn = (opts: ListOptions): Promise<Page<string>> => {
      capturedLimit = opts.limit ?? 0;
      return Promise.resolve({ data: [], total: 0, limit: opts.limit ?? 0, offset: opts.offset ?? 0 });
    };

    for await (const _ of paginate(fn)) {
      // just need to trigger it
    }
    expect(capturedLimit).toBe(100);
  });
});

describe("collect", () => {
  test("returns all items in a single array", async () => {
    const fn = mockPageFn([
      { data: ["a", "b"], total: 3 },
      { data: ["c"], total: 3 },
    ]);

    const all = await collect(fn, { limit: 2 });
    expect(all).toEqual(["a", "b", "c"]);
  });

  test("returns empty array when no results", async () => {
    const fn = mockPageFn([{ data: [], total: 0 }]);
    const all = await collect(fn);
    expect(all).toEqual([]);
  });
});
