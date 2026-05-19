import { Router, Request, Response } from 'express';

interface LoginConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
}

export function createLoginRouter(config: LoginConfig): Router {
  const router = Router();

  router.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'password',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        username,
        password,
      });

      const response = await fetch(
        `${config.keycloakUrl}/realms/${config.realm}/protocol/openid-connect/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      res.json(data);
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}