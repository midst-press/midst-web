/*
 * Calls to the beta app's back end (docs/app-api.md). Adds the signed-in person's token and turns the
 * contract's error shape into an ApiError a page can show.
 */

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly body: Record<string, unknown> = {}) {
    super(message)
  }
}

export interface Me {
  username: string
  email: string
  groups: string[]
}

const FALLBACK = 'Something went wrong on our side. Please try again.'
const GATEWAY: Record<number, [string, string]> = {
  401: ['unauthenticated', 'Please sign in again.'],
  403: ['forbidden', 'Your account cannot do that.'],
  429: ['busy', 'Too many requests just now. Please wait a moment and try again.'],
}

export async function apiFetch<T>(
  baseUrl: string,
  idToken: string,
  path: string,
  init: { method?: string, body?: unknown } = {},
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  let response: Response
  try {
    response = await fetchFn(baseUrl + path, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError(0, 'network', 'The app could not be reached. Check your connection and try again.')
  }
  const text = await response.text()
  let body: Record<string, unknown> = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    // Not JSON: a gateway or proxy page. Say nothing from it.
  }
  if (response.ok) return body as T
  if (typeof body.error === 'string') {
    const message = typeof body.message === 'string' && body.message ? body.message : FALLBACK
    throw new ApiError(response.status, body.error, message, body)
  }
  // Not our shape: API Gateway's own answers, e.g. its JWT authoriser's 401 {"message":"Unauthorized"}.
  // Their words are not shown; the status says what to tell the person.
  const [code, message] = GATEWAY[response.status] ?? ['server', FALLBACK]
  throw new ApiError(response.status, code, message, body)
}
