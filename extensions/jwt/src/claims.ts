/**
 * Human-readable names for the registered claim and JOSE header names defined by
 * RFC 7519 (JWT), RFC 7515 (JWS), RFC 9068 (JWT access tokens) and OpenID Connect Core 1.0.
 */
export const CLAIM_NAMES: Record<string, string> = {
  // JOSE header
  alg: "Algorithm",
  typ: "Type",
  cty: "Content type",
  kid: "Key ID",
  jku: "JWK Set URL",
  jwk: "JSON Web Key",
  x5u: "X.509 URL",
  x5c: "X.509 chain",
  x5t: "X.509 thumbprint",
  "x5t#S256": "X.509 thumbprint",
  crit: "Critical",
  enc: "Encryption",
  zip: "Compression",

  // RFC 7519 registered claims
  iss: "Issuer",
  sub: "Subject",
  aud: "Audience",
  exp: "Expires at",
  nbf: "Not before",
  iat: "Issued at",
  jti: "JWT ID",

  // OAuth 2.0 / RFC 9068
  scope: "Scope",
  client_id: "Client ID",
  roles: "Roles",
  groups: "Groups",
  entitlements: "Entitlements",
  act: "Actor",
  may_act: "May act",

  // OpenID Connect Core
  azp: "Authorized party",
  nonce: "Nonce",
  auth_time: "Authenticated at",
  acr: "Auth context",
  amr: "Auth methods",
  at_hash: "Access token hash",
  c_hash: "Code hash",
  sid: "Session ID",
  name: "Full name",
  given_name: "Given name",
  family_name: "Family name",
  middle_name: "Middle name",
  nickname: "Nickname",
  preferred_username: "Username",
  profile: "Profile URL",
  picture: "Picture URL",
  website: "Website",
  email: "Email",
  email_verified: "Email verified",
  gender: "Gender",
  birthdate: "Birthdate",
  zoneinfo: "Time zone",
  locale: "Locale",
  phone_number: "Phone number",
  phone_number_verified: "Phone verified",
  address: "Address",
  updated_at: "Updated at",
};

/** Claims shown first, in this order, because they define what the token is and when it is valid. */
const PRIORITY = ["iss", "sub", "aud", "azp", "client_id", "exp", "nbf", "iat", "auth_time", "scope", "jti"];

/** Claims whose value is epoch seconds rather than a plain scalar. */
export const TIME_CLAIMS = new Set(["exp", "nbf", "iat", "auth_time", "updated_at"]);

export function orderClaims(keys: string[]): string[] {
  const known = PRIORITY.filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !PRIORITY.includes(key)).sort();
  return [...known, ...rest];
}
