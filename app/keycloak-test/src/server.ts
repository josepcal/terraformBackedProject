import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { createTestUIRouter } from './routes/test-ui';
import { createLoginRouter } from './routes/login';
import 'dotenv/config';

const app = express();
const PORT = 4000;

// Keycloak configuration
const KEYCLOAK_URL = 'https://104.155.154.161';
const REALM = 'myapp';
const REQUIRED_ROLE = 'grantedrole';
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';
const CLIENT_ID = process.env.CLIENT_ID || 'test-app';

if (!CLIENT_SECRET) {
  console.error('✗ KEYCLOAK_CLIENT_SECRET not set in .env');
  process.exit(1);
}

// Allow self-signed cert in dev
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

// ---------- JWT Verification Setup ----------

const jwks = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwks.getSigningKey(header.kid!, (err, key) => {
    if (err) return callback(err);
    callback(null, key!.getPublicKey());
  });
}

// Extend Express Request to include user
interface AuthRequest extends Request {
  user?: any;
}

// ---------- Middleware: Verify JWT ----------

function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.substring(7);

  jwt.verify(token, getKey, {
    algorithms: ['RS256'],
    issuer: `${KEYCLOAK_URL}/realms/${REALM}`,
  }, (err, decoded) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid token', details: err.message });
    }
    req.user = decoded;
    next();
  });
}

// ---------- Middleware: Check Role ----------

function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.user;

    // Keycloak puts realm roles in: realm_access.roles
    // Client-specific roles in: resource_access.<client_id>.roles
    const realmRoles: string[] = user?.realm_access?.roles || [];
    const clientRoles: string[] = user?.resource_access?.['test-app']?.roles || [];
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

// ---------- Routes ----------

// Public endpoint (no auth)
app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

// Authenticated endpoint (any logged-in user)
app.get('/me', authenticate, (req: AuthRequest, res) => {
  res.json({
    user: req.user.preferred_username,
    email: req.user.email,
    realm_roles: req.user.realm_access?.roles || [],
  });
});

// SECURED endpoint — requires 'grantedrole'
app.post('/mysecureaction', authenticate, requireRole(REQUIRED_ROLE), (req: AuthRequest, res) => {
  console.log(`✓ Secure action invoked by ${req.user.preferred_username}`);

  res.json({
    success: true,
    message: 'Secure action executed successfully',
    performedBy: req.user.preferred_username,
    timestamp: new Date().toISOString(),
    payload: req.body,
  });
});


// Where you mount the test-ui router, add:
app.use('/', createLoginRouter({
  keycloakUrl: KEYCLOAK_URL,
  realm: REALM,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
}));

app.use('/', createTestUIRouter({
  keycloakUrl: KEYCLOAK_URL,
  realm: REALM,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  backendPort: PORT,
}));


app.listen(PORT, () => {
  console.log(`✓ Backend running at http://localhost:${PORT}`);
  console.log(`  Public: GET  /health`);
  console.log(`  Auth:   GET  /me`);
  console.log(`  Role:   POST /mysecureaction  (requires role '${REQUIRED_ROLE}')`);
});