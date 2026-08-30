# JWT for Vicinae

Decode a JSON Web Token from your clipboard and read it without leaving the keyboard.
An extension for [Vicinae](https://vicinae.com).

<img src="https://raw.githubusercontent.com/balazsorban44/vicinae-jwt/main/docs/screenshot.png" alt="Decoded payload, signature verification and a diff between two tokens">

## Features

### Decode

Takes the token from the clipboard, or as a command argument. Arrow keys move between
sections, Enter acts on the one you are on.

| Section | Enter | Shows |
|---|---|---|
| Payload | Copy JSON | Claims annotated with their registered names, timestamps as dates |
| Header | Copy JSON | The JOSE header, annotated the same way |
| Signature | Verify | The verdict, the algorithm, the issuer's discovery document |
| Diff | Copy patch | A unified diff against the previously decoded token |
| Specs | Open RFC 7519 | RFC 7519, RFC 7515, RFC 9068, OpenID Connect Core |

### Expiry

Reads the clipboard and shows a HUD:
`Active - Aug 30, 2026, 2:52 AM - in 2 hours - web-app - 1234567890`.

## Verifying

Verification runs only when you ask for it, and only talks to the token's own issuer.

* **RS, ES, PS**: the `iss` claim leads to the discovery document, then the JWKS, then
  the key matching `kid`.
* **HS256/384/512**: a form asks for the shared secret. It is tried as raw text and as
  base64url, the result says which matched, and it is never stored.

## Source

Developed at [balazsorban44/vicinae-jwt](https://github.com/balazsorban44/vicinae-jwt).

## License

MIT
