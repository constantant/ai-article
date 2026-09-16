import { SignJWT, jwtVerify } from 'jose';

/**
 * Authorization codes and access/refresh tokens are stateless signed JWTs,
 * not a Lambda-unfriendly DB-backed store — see UsedCodeGuard for the one
 * piece of state this still needs (single-use replay protection for codes,
 * which a signature alone can't provide).
 */
export const CODE_TTL_SECONDS = 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface CodeClaims {
  sub: string; // userId
  clientId: string;
  scope: string;
  redirectUri: string;
  codeChallenge: string;
  jti: string;
}

export interface TokenClaims {
  sub: string; // userId
  clientId: string;
  scope: string;
}

export class JwtIssuer {
  private readonly key: Uint8Array;

  constructor(signingKey: string) {
    this.key = new TextEncoder().encode(signingKey);
  }

  signCode(claims: CodeClaims): Promise<string> {
    return new SignJWT({ ...claims, typ: 'code' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setJti(claims.jti)
      .setIssuedAt()
      .setExpirationTime(`${CODE_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyCode(token: string): Promise<CodeClaims> {
    const { payload } = await jwtVerify(token, this.key);
    if (payload['typ'] !== 'code') {
      throw new Error('not an authorization code');
    }
    return payload as unknown as CodeClaims;
  }

  async signAccessToken(
    claims: TokenClaims,
  ): Promise<{ token: string; expiresAt: number }> {
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
    const token = await new SignJWT({ ...claims, typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.key);
    return { token, expiresAt };
  }

  async verifyAccessToken(
    token: string,
  ): Promise<TokenClaims & { exp: number }> {
    const { payload } = await jwtVerify(token, this.key);
    if (payload['typ'] !== 'access' || typeof payload['exp'] !== 'number') {
      throw new Error('not an access token');
    }
    return payload as unknown as TokenClaims & { exp: number };
  }

  signRefreshToken(claims: TokenClaims): Promise<string> {
    return new SignJWT({ ...claims, typ: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyRefreshToken(token: string): Promise<TokenClaims> {
    const { payload } = await jwtVerify(token, this.key);
    if (payload['typ'] !== 'refresh') {
      throw new Error('not a refresh token');
    }
    return payload as unknown as TokenClaims;
  }
}
