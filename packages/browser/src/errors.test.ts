import { describe, test, expect } from "bun:test";
import { RolloverError } from "./errors.js";

describe("RolloverError", () => {
  test("sets status, code, and message", () => {
    const err = new RolloverError(402, "payment_required", "Payment is required");
    expect(err.status).toBe(402);
    expect(err.code).toBe("payment_required");
    expect(err.message).toBe("Payment is required");
    expect(err.name).toBe("RolloverError");
  });

  test("is an instance of Error", () => {
    const err = new RolloverError(500, "internal", "something broke");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RolloverError);
  });
});
