export interface AuthorizeFormParams {
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge: string;
  resource?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hiddenFields(params: AuthorizeFormParams): string {
  const fields: Array<[string, string | undefined]> = [
    ['client_id', params.clientId],
    ['redirect_uri', params.redirectUri],
    ['response_type', 'code'],
    ['code_challenge', params.codeChallenge],
    ['code_challenge_method', 'S256'],
    ['scope', params.scope],
    ['state', params.state],
    ['resource', params.resource],
  ];
  return fields
    .filter(([, value]) => value !== undefined)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${name}" value="${escapeHtml(value ?? '')}">`,
    )
    .join('\n');
}

/**
 * Deliberately dependency-free (no template engine, no client framework) —
 * this is the one HTML page the whole system serves, matching the project's
 * existing "self-serve, no key to ask anyone for" ethos for account creation.
 */
export function renderLoginPage(
  params: AuthorizeFormParams,
  error?: string,
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — AI Article Platform</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 360px; margin: 4rem auto; padding: 0 1rem; }
  h1 { font-size: 1.25rem; }
  label { display: block; margin-top: 0.75rem; font-size: 0.9rem; }
  input[type="email"], input[type="password"] { width: 100%; padding: 0.5rem; margin-top: 0.25rem; box-sizing: border-box; }
  button { width: 100%; padding: 0.6rem; margin-top: 1rem; cursor: pointer; }
  .error { color: #b00020; font-size: 0.9rem; margin-top: 0.75rem; }
  .hint { color: #666; font-size: 0.8rem; margin-top: 1.5rem; }
</style>
</head>
<body>
<h1>Sign in to AI Article Platform</h1>
<p>Approve access for the connecting app, and manage your linked article-app API keys.</p>
<form method="post">
${hiddenFields(params)}
<label>Email<input type="email" name="email" required autofocus></label>
<label>Password<input type="password" name="password" required minlength="8"></label>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
<button type="submit" name="formAction" value="login">Log in</button>
<button type="submit" name="formAction" value="register">Create account &amp; continue</button>
</form>
<p class="hint">No email verification or password reset — this is a self-serve account, same trust level as this platform's self-serve app registration.</p>
</body>
</html>`;
}
