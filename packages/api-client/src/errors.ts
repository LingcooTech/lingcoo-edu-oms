import type { ApiErrorResponse } from '@lingcoo-edu-oms/contracts';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, response: ApiErrorResponse) {
    super(response.error.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = response.error.code;
    this.details = response.error.details;
    this.requestId = response.error.requestId;
  }
}
