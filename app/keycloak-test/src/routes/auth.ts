import { Router, Request, Response } from 'express';
import * as client from 'openid-client';
import { getConfig } from '../auth/oidc.js';

const BFF_BASE = process.env.BFF_BASE || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const REDIRECT_URI = `${BFF_BASE}/auth/callback`;

export function createAuthRouter(): Router {
  const router = Router();

  // ---- Start login: generate PKCE, redirect to Keycloak ----
  router.get('/auth/login', async (req: Request, res: Response) => {
    const config = getConfig();

    // PKCE: generate verifier + challenge
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();

    // Stash in session for the callback to use
    (req.session as any).pkce = { codeVerifier, state };

    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    res.redirect(authUrl.href);
  });

  // ---- Callback: exchange code for tokens, store in session ----
  router.get('/auth/callback', async (req: Request, res: Response) => {
    const config = getConfig();
    const pkce = (req.session as any).pkce;

    if (!pkce) {
      return res.status(400).send('No PKCE state in session — restart login');
    }

    try {
      const currentUrl = new URL(`${BFF_BASE}${req.originalUrl}`);

      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: pkce.codeVerifier,
        expectedState: pkce.state,
      });

      // Store tokens server-side only
      (req.session as any).tokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        id_token: tokens.id_token,
        expires_at: Date.now() + (tokens.expires_in ?? 0) * 1000,
      };

      // Decode the ID token claims for convenience
      const claims = tokens.claims();
      (req.session as any).user = {
        sub: claims?.sub,
        username: claims?.preferred_username,
        email: claims?.email,
      };

      delete (req.session as any).pkce;

      // Back to the frontend
      res.redirect(FRONTEND_URL);
    } catch (err: any) {
      console.error('Callback error:', err);
      res.status(500).send(`Login failed: ${err.message}`);
    }
  });

  // ---- Who am I (frontend polls this to know login state) ----
  router.get('/auth/me', (req: Request, res: Response) => {
    const user = (req.session as any).user;
    if (!user) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, user });
  });

  // ---- Logout: clear session + Keycloak SSO logout ----
  router.get('/auth/logout', (req: Request, res: Response) => {
    const config = getConfig();
    const idToken = (req.session as any).tokens?.id_token;

    req.session.destroy(() => {
      const logoutUrl = client.buildEndSessionUrl(config, {
        id_token_hint: idToken,
        post_logout_redirect_uri: FRONTEND_URL,
      });
      res.redirect(logoutUrl.href);
    });
  });

  return router;
}