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
  const code = typeof body.error === 'string' ? body.error : 'server'
  const message = typeof body.message === 'string' && body.message ? body.message : FALLBACK
  throw new ApiError(response.status, code, message, body)
}
