import type { Fetch } from '../src/http.js'

export interface Call {
  method: string
  url: string
  body: string
  headers: Record<string, string>
}

type Route = [method: string, url: RegExp, reply: (call: Call) => { status?: number; json?: unknown; text?: string; headers?: Record<string, string> }]

/** A fetch that answers from a route table and records every call. */
export function mockFetch(routes: Route[]): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body === undefined ? '' : String(init.body)
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    const call = { method, url, body, headers }
    calls.push(call)
    const route = routes.find(([m, re]) => m === method && re.test(url))
    if (!route) return new Response(JSON.stringify({ error: `no route for ${method} ${url}` }), { status: 599 })
    const r = route[2](call)
    const payload = r.text ?? (r.json === undefined ? '' : JSON.stringify(r.json))
    return new Response(r.status === 204 ? null : payload, { status: r.status ?? 200, headers: r.headers })
  }) as Fetch
  return { fetch: fetchImpl, calls }
}
