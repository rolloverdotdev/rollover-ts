export class RolloverError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "RolloverError";
  }

  static async from(res: Response) {
    const body = (await res.json().catch(() => undefined)) as
      | { code?: string; message?: string }
      | undefined;
    return new RolloverError(res.status, body?.code ?? "unknown", body?.message ?? "Request failed");
  }
}
