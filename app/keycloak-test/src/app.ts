import express from 'express';
import session from 'express-session';
import { Issuer, generators, Client } from 'openid-client';
import 'dotenv/config';


const app = express();
const PORT = 3000;

// Keycloak configuration
const KEYCLOAK_URL = 'https://104.155.154.161';
const REALM = 'myapp';
const CLIENT_ID = 'test-app';
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3000/callback';

// Disable TLS verification for self-signed cert (DEV ONLY!)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

app.use(session({
  secret: 'change-me-in-prod',
  resave: false,
  saveUninitialized: true,
}));

let client: Client;

async function setupClient() {
  const issuer = await Issuer.discover(`${KEYCLOAK_URL}/realms/${REALM}`);
  console.log('Discovered Keycloak issuer:', issuer.metadata.issuer);

  client = new issuer.Client({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uris: [REDIRECT_URI],
    response_types: ['code'],
  });
}

// Home page
app.get('/', (req: any, res) => {
  if (req.session.user) {
    res.send(`
      <h1>Logged in as ${req.session.user.preferred_username}</h1>
      <pre>${JSON.stringify(req.session.user, null, 2)}</pre>
      <a href="/logout">Logout</a>
    `);
  } else {
    res.send('<h1>Not logged in</h1><a href="/login">Login with Keycloak</a>');
  }
});

// Trigger login
app.get('/login', (req: any, res) => {
  const state = generators.state();
  const nonce = generators.nonce();
  req.session.state = state;
  req.session.nonce = nonce;

  const authUrl = client.authorizationUrl({
    scope: 'openid profile email',
    state,
    nonce,
  });

  res.redirect(authUrl);
});

// OAuth callback
app.get('/callback', async (req: any, res) => {
  try {
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(REDIRECT_URI, params, {
      state: req.session.state,
      nonce: req.session.nonce,
    });

    console.log('Tokens received:', tokenSet);
    const userInfo = await client.userinfo(tokenSet.access_token!);

    req.session.user = userInfo;
    req.session.tokens = tokenSet;
    res.redirect('/');
  } catch (err: any) {
    console.error('Callback error:', err);
    res.status(500).send(`Login failed: ${err.message}`);
  }
});

// Logout
app.get('/logout', (req: any, res) => {
  const idToken = req.session.tokens?.id_token;
  req.session.destroy(() => {
    const logoutUrl = client.endSessionUrl({
      id_token_hint: idToken,
      post_logout_redirect_uri: `http://localhost:${PORT}/`,
    });
    res.redirect(logoutUrl);
  });
});

// Start
setupClient().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Server running at http://localhost:${PORT}`);
    console.log(`  Visit http://localhost:${PORT} to test login`);
  });
}).catch((err) => {
  console.error('Failed to setup OIDC client:', err);
});