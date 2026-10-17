/**
 * Constants shared between the edge middleware and the Node server store.
 *
 * This module must stay free of Node built-ins (`node:fs`, `node:path`) and
 * `next/headers` so it can be imported by `src/middleware.ts`, which runs in
 * the edge runtime.
 */

export const SESSION_COOKIE = 'ym_session'
