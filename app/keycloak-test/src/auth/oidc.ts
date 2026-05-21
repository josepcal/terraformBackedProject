import * as client from 'openid-client';

let config: client.Configuration;

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://104.155.154.161';
const REALM = process.env.KEYCLOAK_REALM || 'myapp';
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'test-app';
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';

// Allow self-signed cert in dev (REMOVE in production)
const allowInsecure = process.env.NODE_ENV !== 'production';

export async function initOIDC(): Promise<client.Configuration> {
  const issuerUrl = new URL(`${KEYCLOAK_URL}/realms/${REALM}`);

  config = await client.discovery(
    issuerUrl,
    CLIENT_ID,
    CLIENT_SECRET,
    undefined,
    allowInsecure
      ? { execute: [client.allowInsecureRequests] }
      : undefined
  );

  console.log('✓ OIDC discovered:', config.serverMetadata().issuer);
  return config;
}

export function getConfig(): client.Configuration {
  if (!config) throw new Error('OIDC not initialized — call initOIDC() first');
  return config;
}