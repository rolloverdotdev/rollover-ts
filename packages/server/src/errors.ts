export const ErrorCode = {
  InvalidAPIKey: "invalid_api_key",
  Unauthorized: "unauthorized",
  RateLimit: "rate_limit_exceeded",
  NotFound: "not_found",
  InsufficientCredits: "insufficient_credits",
  Validation: "validation_error",
} as const;

export class RolloverError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "RolloverError";
    this.statusCode = statusCode;
    this.code = code;
  }

  temporary(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

export class AuthenticationError extends RolloverError {
  constructor(message: string) {
    super(401, "unauthorized", message);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends RolloverError {
  public readonly retryAfter: number | undefined;

  constructor(message: string, retryAfter?: number) {
    super(429, ErrorCode.RateLimit, message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export function isErrorCode(err: unknown, code: string): boolean {
  return err instanceof RolloverError && err.code === code;
}

export async function parseError(response: Response): Promise<RolloverError> {
  let body: { code?: string; message?: string };
  try {
    body = await response.json();
  } catch {
    body = { code: "unknown", message: response.statusText };
  }

  const code = body.code ?? "unknown";
  const message = body.message ?? "Request failed";

  if (response.status === 401) {
    return new AuthenticationError(message);
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    return new RateLimitError(message, retryAfter ? parseInt(retryAfter, 10) : undefined);
  }

  return new RolloverError(response.status, code, message);
}
