export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_status"
  | "invalid_request"
  | "feishu_reply_failed"
  | "internal_error";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
