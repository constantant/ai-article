/** Calls rest-api's public register endpoint and its service-gated
 *  credential-check endpoint — the only two things the OAuth login form needs. */
export class UsersApiClient {
  constructor(
    private readonly restApiBaseUrl: string,
    private readonly serviceKey: string,
  ) {}

  async register(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const res = await fetch(`${this.restApiBaseUrl}/users/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(`registration failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as { id: string; email: string };
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<{ userId: string } | null> {
    const res = await fetch(`${this.restApiBaseUrl}/users/verify-credentials`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-key': this.serviceKey,
      },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `verify-credentials failed (${res.status}): ${await res.text()}`,
      );
    }
    return (await res.json()) as { userId: string };
  }
}
