import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/session-auth.js';

const REQUIRED_ROLE = process.env.REQUIRED_ROLE || 'grantedrole';

export function createSecureActionRouter(): Router {
  const router = Router();

  router.post(
    '/mysecureaction',
    requireAuth,
    requireRole(REQUIRED_ROLE),
    (req: Request, res: Response) => {
      const claims = (req as any).tokenClaims;

      console.log(`✓ Secure action invoked by ${claims.preferred_username}`);

      res.json({
        success: true,
        message: 'Secure action executed successfully',
        performedBy: claims.preferred_username,
        timestamp: new Date().toISOString(),
        payload: req.body,
      });
    }
  );

  return router;
}