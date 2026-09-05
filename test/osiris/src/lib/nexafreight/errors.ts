/**
 * NexaFreight API — typed error classes
 *
 * Separating error types lets call-site code distinguish:
 *   - NexaHttpError   → server responded with a 4xx/5xx (structured body may exist)
 *   - NexaNetworkError → fetch itself threw (server down, CORS, timeout)
 *
 * Both extend NexaError so a single catch (err instanceof NexaError) covers all
 * NexaFreight failures without swallowing unrelated exceptions.
 */

export class NexaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NexaError'
  }
}

/**
 * The server responded, but with an error status (4xx or 5xx).
 *
 * `status`  — HTTP status code (e.g. 401, 404, 500)
 * `detail`  — server error message if the response was JSON with an
 *             `error` or `detail` key; otherwise the raw status text.
 */
export class NexaHttpError extends NexaError {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(`NexaFreight API error ${status}: ${detail}`)
    this.name = 'NexaHttpError'
    this.status = status
    this.detail = detail
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isServerError(): boolean {
    return this.status >= 500
  }
}

/**
 * fetch() itself threw — the server was unreachable, the network dropped,
 * or a CORS preflight was rejected before any HTTP status was received.
 */
export class NexaNetworkError extends NexaError {
  readonly cause: unknown

  constructor(cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`NexaFreight network error: ${msg}`)
    this.name = 'NexaNetworkError'
    this.cause = cause
  }
}
