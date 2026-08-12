/**
 * DWS Hub token exchange — JSON body (not form-encoded).
 * See SSO-TARGET-APP-INTEGRATION.md §8.
 */

export interface OidcTokenExchangeParams {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
}

export interface OidcTokenResponse {
  id_token?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Build the JSON body Hub expects (exported for unit tests). */
export function buildTokenRequestBody(params: Omit<OidcTokenExchangeParams, "tokenEndpoint">): Record<string, string> {
  return {
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  };
}

export async function exchangeAuthorizationCode(
  params: OidcTokenExchangeParams
): Promise<OidcTokenResponse> {
  const body = buildTokenRequestBody(params);
  const resp = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  const text = await resp.text();
  let json: OidcTokenResponse;
  try {
    json = JSON.parse(text) as OidcTokenResponse;
  } catch {
    throw new Error(`token endpoint ${resp.status}: ${text.slice(0, 500)}`);
  }

  if (!resp.ok) {
    const detail = json.error_description || json.error || text.slice(0, 500);
    throw new Error(`token endpoint ${resp.status}: ${detail}`);
  }

  if (!json.id_token) {
    throw new Error("no id_token in token response");
  }

  return json;
}
