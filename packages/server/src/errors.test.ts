import { describe, test, expect } from "bun:test";
import { RolloverError, AuthenticationError, RateLimitError, ErrorCode, isErrorCode, parseError } from "./errors.js";

describe("RolloverError", () => {
  test("sets statusCode, code, and message", () => {
    const err = new RolloverError(400, "bad_request", "invalid input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("bad_request");
    expect(err.message).toBe("invalid input");
    expect(err.name).toBe("RolloverError");
  });

  test("temporary returns true for 429 and 5xx", () => {
    expect(new RolloverError(429, ErrorCode.RateLimit, "slow down").temporary()).toBe(true);
    expect(new RolloverError(500, "internal", "oops").temporary()).toBe(true);
    expect(new RolloverError(502, "bad_gateway", "oops").temporary()).toBe(true);
    expect(new RolloverError(400, "bad_request", "nope").temporary()).toBe(false);
    expect(new RolloverError(404, "not_found", "gone").temporary()).toBe(false);
  });

  test("is an instance of Error", () => {
    const err = new RolloverError(500, "internal", "boom");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RolloverError);
  });
});

describe("isErrorCode", () => {
  test("returns true for matching code", () => {
    const err = new RolloverError(404, "not_found", "gone");
    expect(isErrorCode(err, "not_found")).toBe(true);
    expect(isErrorCode(err, "other")).toBe(false);
  });

  test("returns false for non-RolloverError", () => {
    expect(isErrorCode(new Error("nope"), "not_found")).toBe(false);
    expect(isErrorCode(null, "not_found")).toBe(false);
  });
});

describe("parseError", () => {
  test("parses JSON error body", async () => {
    const res = new Response(JSON.stringify({ code: "bad_request", message: "invalid" }), { status: 400 });
    const err = await parseError(res);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("bad_request");
    expect(err.message).toBe("invalid");
  });

  test("handles non-JSON body", async () => {
    const res = new Response("<html>error</html>", { status: 500, statusText: "Internal Server Error" });
    const err = await parseError(res);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("unknown");
  });

  test("handles empty body", async () => {
    const res = new Response("", { status: 500, statusText: "Internal Server Error" });
    const err = await parseError(res);
    expect(err.statusCode).toBe(500);
  });

  test("returns AuthenticationError for 401", async () => {
    const res = new Response(JSON.stringify({ code: "unauthorized", message: "bad key" }), { status: 401 });
    const err = await parseError(res);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.statusCode).toBe(401);
  });

  test("returns RateLimitError for 429", async () => {
    const res = new Response(JSON.stringify({ code: "rate_limit_exceeded", message: "slow down" }), {
      status: 429,
      headers: { "Retry-After": "30" },
    });
    const err = await parseError(res);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.code).toBe(ErrorCode.RateLimit);
    expect((err as RateLimitError).retryAfter).toBe(30);
  });
});
