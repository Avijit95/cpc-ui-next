// ApiError captures the standard error envelope from the backend
// (statusCode/error/code/message/path/timestamp). `message` may be a
// string or an array of strings (DTO validation case).

export type ApiErrorPayload = {
  statusCode: number;
  error: string;
  code?: string;
  message: string | string[];
  path?: string;
  timestamp?: string;
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorName: string;
  readonly code?: string;
  readonly messages: string[];
  readonly path?: string;
  readonly timestamp?: string;

  constructor(payload: ApiErrorPayload) {
    const messages = Array.isArray(payload.message)
      ? payload.message
      : [payload.message];
    super(messages[0] ?? payload.error ?? "Request failed");
    this.name = "ApiError";
    this.statusCode = payload.statusCode;
    this.errorName = payload.error;
    this.code = payload.code;
    this.messages = messages;
    this.path = payload.path;
    this.timestamp = payload.timestamp;
  }

  // Convenience: render either the validation list or the single message.
  get displayMessage(): string {
    return this.messages.join("\n");
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
