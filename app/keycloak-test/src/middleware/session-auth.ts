import { Request, Response, NextFunction } from 'express';

// Decode JWT payload without verification (token already came from our own session)
function decodeJwt(token: string): any {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

// Require an authenticated session
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const tokens = (req.session as any).tokens;

  if (!tokens?.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (Date.now() >= tokens.expires_at) {
    return res.status(401).json({ error: 'Session expired — login again' });
  }

  // Attach decoded token for downstream handlers
  (req as any).tokenClaims = decodeJwt(tokens.access_token);
  next();
}

// Require a specific Keycloak role
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = (req as any).tokenClaims;

    const realmRoles: string[] = claims?.realm_access?.roles || [];
    const clientRoles: string[] = claims?.resource_access?.['test-app']?.roles || [];
    const allRoles = [...realmRoles, ...clientRoles];

    if (!allRoles.includes(role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${role}`,
        yourRoles: allRoles,
      });
    }
    next();
  };
}