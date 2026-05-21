import { Router, Request, Response } from 'express';

interface TestPkceConfig {
  bffBase: string;       // e.g. http://localhost:4000
}

export function createTestPkceRouter(config: TestPkceConfig): Router {
  const router = Router();

  router.get('/test-pkce', (_req: Request, res: Response) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>BFF + PKCE Test</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 1rem; }
    h1 { color: #333; }
    .card { border: 1px solid #ddd; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
    button { padding: 0.55rem 1rem; background: #0070f3; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin: 0.25rem; font-size: 0.95rem; }
    button:hover { background: #0051cc; }
    button.danger { background: #d33; }
    button.danger:hover { background: #a00; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
    .success { color: green; font-weight: bold; }
    .error { color: red; font-weight: bold; }
    .muted { color: #777; font-size: 0.85rem; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; }
    .badge.in { background: #d4edda; color: #155724; }
    .badge.out { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <h1>🔐 BFF + PKCE Test</h1>
  <p class="muted">
    This page tests the Authorization Code + PKCE flow. Tokens stay in the BFF session —
    the browser only holds an httpOnly cookie.
  </p>

  <div class="card">
    <h2>Auth status: <span id="authBadge" class="badge out">checking…</span></h2>
    <div id="userInfo" class="muted">—</div>
    <br/>
    <button onclick="login()">🔑 Login with Keycloak</button>
    <button onclick="checkAuth()">🔄 Refresh status</button>
    <button class="danger" onclick="logout()">🚪 Logout</button>
  </div>

  <div class="card">
    <h2>Test the secured endpoint</h2>
    <p class="muted">POST /mysecureaction — requires role <code>grantedrole</code>.</p>
    <button onclick="callSecureAction()">▶ Call /mysecureaction</button>
  </div>

  <div class="card">
    <h2>Response</h2>
    <div id="status"></div>
    <pre id="response">No response yet…</pre>
  </div>

  <script>
    const BFF = '${config.bffBase}';

    // Check auth state on page load (e.g. after returning from Keycloak)
    window.addEventListener('load', checkAuth);

    function login() {
      // Full-page redirect — the BFF handles PKCE generation
      window.location.href = BFF + '/auth/login';
    }

    function logout() {
      window.location.href = BFF + '/auth/logout';
    }

    async function checkAuth() {
      try {
        const res = await fetch(BFF + '/auth/me', { credentials: 'include' });
        const badge = document.getElementById('authBadge');
        const info = document.getElementById('userInfo');

        if (res.ok) {
          const data = await res.json();
          badge.className = 'badge in';
          badge.textContent = 'logged in';
          info.textContent = 'User: ' + data.user.username + '  |  Email: ' + (data.user.email || '—');
          showResponse({ authenticated: true, user: data.user }, 'success');
        } else {
          badge.className = 'badge out';
          badge.textContent = 'logged out';
          info.textContent = '—';
          showResponse({ authenticated: false }, 'error');
        }
      } catch (err) {
        showResponse({ error: err.message }, 'error');
      }
    }

    async function callSecureAction() {
      try {
        const res = await fetch(BFF + '/mysecureaction', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'test-from-pkce-ui', timestamp: new Date().toISOString() }),
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
      status.textContent = type === 'success' ? '✓ Success' : '✗ Failed / Denied';
      document.getElementById('response').textContent = JSON.stringify(data, null, 2);
    }
  </script>
</body>
</html>
    `);
  });

  return router;
}