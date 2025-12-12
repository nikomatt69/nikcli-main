import { createHash, randomBytes } from 'node:crypto'

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'

const BETA_HEADERS = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
]

export interface OAuthTokens {
  access: string
  refresh: string
  expires: number
}

interface PKCEChallenge {
  verifier: string
  challenge: string
}

function generatePKCE(): PKCEChallenge {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function getAuthorizationUrl(mode: 'max' | 'console' = 'max'): { url: string; verifier: string } {
  const pkce = generatePKCE()
  const baseUrl = mode === 'console' ? 'https://console.anthropic.com' : 'https://claude.ai'
  const url = new URL(`${baseUrl}/oauth/authorize`)

  url.searchParams.set('code', 'true')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('scope', 'org:create_api_key user:profile user:inference')
  url.searchParams.set('code_challenge', pkce.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', pkce.verifier)

  return { url: url.toString(), verifier: pkce.verifier }
}

export async function exchangeCodeForTokens(code: string, verifier: string): Promise<OAuthTokens | null> {
  const splits = code.split('#')
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: splits[0],
      state: splits[1] || verifier,
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error')
    console.error(`OAuth exchange failed: ${response.status} - ${error}`)
    return null
  }

  const json = await response.json()
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
  }
}

export async function refreshTokens(refreshToken: string): Promise<OAuthTokens | null> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  })

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error')
    console.error(`Token refresh failed: ${response.status} - ${error}`)
    return null
  }

  const json = await response.json()
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
  }
}

export function createOAuthFetch(
  getTokens: () => Promise<OAuthTokens | null>,
  saveTokens: (tokens: OAuthTokens) => void
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let tokens = await getTokens()
    if (!tokens) {
      throw new Error('No OAuth tokens available. Run /auth anthropic to authenticate.')
    }

    if (tokens.expires < Date.now()) {
      const newTokens = await refreshTokens(tokens.refresh)
      if (!newTokens) {
        throw new Error('Token refresh failed. Run /auth anthropic to re-authenticate.')
      }
      tokens = newTokens
      saveTokens(tokens)
    }

    const headers = new Headers(init?.headers)
    headers.set('authorization', `Bearer ${tokens.access}`)

    const existingBeta = headers.get('anthropic-beta') || ''
    const existingBetaList = existingBeta
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean)
    const mergedBetas = [...new Set([...BETA_HEADERS, ...existingBetaList])].join(',')
    headers.set('anthropic-beta', mergedBetas)

    headers.delete('x-api-key')

    return fetch(input, { ...init, headers })
  }
}

export async function createApiKeyFromOAuth(accessToken: string): Promise<string | null> {
  const response = await fetch('https://api.anthropic.com/api/oauth/claude_cli/create_api_key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    return null
  }

  const json = await response.json()
  return json.raw_key || null
}
