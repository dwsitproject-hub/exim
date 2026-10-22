/**
 * Typed DHM API error. Callers must branch on `code`, never on `message` (§11 Error contract).
 */

import type { DhmErrorBody } from "./types.js";

export class DhmApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    message: string,
    public readonly body?: DhmErrorBody
  ) {
    super(message);
    this.name = "DhmApiError";
  }

  /** `410 RECORD_DELETED` — tombstone; do not re-create. */
  get isDeleted(): boolean {
    return this.httpStatus === 410 && this.code === "RECORD_DELETED";
  }

  /** `410 RECORD_MERGED` — the code was merged away. */
  get isMerged(): boolean {
    return this.httpStatus === 410 && this.code === "RECORD_MERGED";
  }

  get isVersionConflict(): boolean {
    return this.httpStatus === 409 && this.code === "VERSION_CONFLICT";
  }

  get isDuplicate(): boolean {
    return this.httpStatus === 409 && this.code === "DUPLICATE";
  }

  get isRateLimited(): boolean {
    return this.httpStatus === 429 && this.code === "RATE_LIMITED";
  }

  get isRetryable(): boolean {
    return this.isRateLimited || this.httpStatus >= 500;
  }
}
