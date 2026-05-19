import { Router, Request, Response } from 'express';

interface TestUIConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  backendPort: number;
}

export function createTestUIRouter(config: TestUIConfig): Router {
  const router = Router();

  router.get('/test', (_req: Request, res: Response) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Keycloak Test UI</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 700px; margin: 2rem auto; padding: 1rem; }
    h1 { color: #333; }
    .card { border: 1px solid #ddd; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
    input, textarea { width: 100%; padding: 0.5rem; margin: 0.25rem 0; box-sizing: border-box; font-family: monospace; }
    textarea { min-height: 100px; }
    button { padding: 0.5rem 1rem; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 0.25rem; }
    button:hover { background: #0051cc; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>🔐 Keycloak Backend Test UI</h1>

  <div class="card">
    <h2>Step 1 — Get access token</h2>
    <label>Username:</label>
    <input id="username" value="testuser" />
    <label>Password:</label>
    <input id="password" type="password" />
    <button onclick="login()">Login & Get Token</button>
  </div>

  <div class="card">
    <h2>Step 2 — Access token</h2>
    <textarea id="token" placeholder="Token will appear here after login..."></textarea>
    <small>You can paste a token here manually if you already have one.</small>
  </div>

  <div class="card">
    <h2>Step 3 — Call endpoints</h2>
    <button onclick="callEndpoint('/health', 'GET', false)">GET /health (public)</button>
    <button onclick="callEndpoint('/me', 'GET', true)">GET /me (authenticated)</button>
    <button onclick="callSecureAction()">POST /mysecureaction (role required)</button>
  </div>

  <div class="card">
    <h2>Response</h2>
    <div id="status"></div>
    <pre id="response">No response yet...</pre>
  </div>

  <script>
    const KEYCLOAK_URL = '${config.keycloakUrl}';
    const REALM = '${config.realm}';
    const CLIENT_ID = '${config.clientId}';
    const CLIENT_SECRET = '${config.clientSecret}';
    const BACKEND_PORT = ${config.backendPort};

    async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const res = await fetch(\`http://localhost:\${BACKEND_PORT}/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (data.access_token) {
        document.getElementById('token').value = data.access_token;
        showResponse({ message: 'Token acquired ✓', expires_in: data.expires_in }, 'success');
        } else {
        showResponse(data, 'error');
        }
    } catch (err) {
        showResponse({ error: err.message }, 'error');
    }
    }

    async function callEndpoint(path, method, useAuth) {
      const headers = { 'Content-Type': 'application/json' };
      if (useAuth) {
        const token = document.getElementById('token').value;
        if (!token) {
          showResponse({ error: 'No token! Login first.' }, 'error');
          return;
        }
        headers['Authorization'] = \`Bearer \${token}\`;
      }

      try {
        const res = await fetch(\`http://localhost:\${BACKEND_PORT}\${path}\`, { method, headers });
        const data = await res.json();
        showResponse({ status: res.status, body: data }, res.ok ? 'success' : 'error');
      } catch (err) {
        showResponse({ error: err.message }, 'error');
      }
    }

    async function callSecureAction() {
      const token = document.getElementById('token').value;
      if (!token) {
        showResponse({ error: 'No token! Login first.' }, 'error');
        return;
      }

      try {
        const res = await fetch(\`http://localhost:\${BACKEND_PORT}/mysecureaction\`, {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'test-from-ui', timestamp: new Date().toISOString() }),
        });
        const data = await res.json();
        showResponse({ status: res.status, body: data }, res.ok ? 'success' : 'error');
      } catch (err) {
        showResponse({ error: err.message }, 'error');
      }
    }

    function showResponse(data, type) {
      const status = document.getElementById('status');
      status.className = type;
      status.textContent = type === 'success' ? '✓ Success' : '✗ Failed';
      document.getElementById('response').textContent = JSON.stringify(data, null, 2);
    }
  </script>
</body>
</html>
    `);
  });

  return router;
}