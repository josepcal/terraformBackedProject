# TLS Setup Guide — Accessing Nginx via Public IP with HTTPS

## Problem

Certbot (Let's Encrypt) in the Nginx startup script may fail if:
1. Domain DNS hasn't resolved yet
2. Domain doesn't exist yet
3. You only have a public IP, not a domain

This guide provides **3 solutions**:
- **Option A**: Use a real domain (recommended)
- **Option B**: Self-signed certificate (for testing)
- **Option C**: Self-signed + manual Certbot renewal

---

## Option A: Use a Real Domain (Recommended for Production)

### Step 1: Point Domain to Nginx Public IP

```bash
# Get Nginx public IP
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
echo $NGINX_IP
# Example: 35.192.123.45
```

**In your DNS provider (GCP Cloud DNS, Route53, etc.):**

Create an A record:
```
dev.auth.example.com  A  35.192.123.45  (TTL: 300 seconds for faster propagation)
```

Wait for DNS to propagate (check with `nslookup`):
```bash
nslookup dev.auth.example.com
# Should resolve to 35.192.123.45
```

### Step 2: Issue Let's Encrypt Certificate

**SSH to Nginx VM:**
```bash
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap
```

**Inside Nginx VM:**
```bash
# Test Nginx is working
sudo nginx -t

# Run Certbot manually (the startup script may have already tried)
sudo certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email ops@example.com \
  --domains dev.auth.example.com

# Expected output:
# Successfully received certificate.
# Certificate is saved at: /etc/letsencrypt/live/dev.auth.example.com/fullchain.pem
```

### Step 3: Verify Certificate and Restart Nginx

```bash
# Check certificate is valid
sudo certbot certificates

# Should show:
# Certificate Name: dev.auth.example.com
# Domains: dev.auth.example.com
# Expiry Date: (90 days from now)

# Reload Nginx
sudo systemctl reload nginx

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Step 4: Test HTTPS Access

```bash
# From local machine:
curl -I https://dev.auth.example.com/

# Expected output:
# HTTP/2 200
# Server: nginx/1.18.0
# (or similar version)
```

---

## Option B: Self-Signed Certificate (For Testing Only)

**Use this if you don't have a domain yet or want to test quickly.**

### Step 1: Generate Self-Signed Certificate

**SSH to Nginx VM:**
```bash
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap
```

**Inside Nginx VM:**
```bash
# Create certificate directory
sudo mkdir -p /etc/nginx/ssl

# Generate self-signed certificate (valid for 365 days)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=dev.auth.example.com"

# Verify certificate was created
sudo ls -la /etc/nginx/ssl/
```

### Step 2: Update Nginx Config

**Edit Nginx config:**
```bash
sudo nano /etc/nginx/sites-available/keycloak
```

**Replace the SSL block with:**
```nginx
server {
    listen 80;
    server_name _;

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name _;

    # Self-signed certificate
    ssl_certificate     /etc/nginx/ssl/nginx-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;

    location / {
        proxy_pass          http://KEYCLOAK_INTERNAL_IP:8080;
        proxy_set_header    Host $host;
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
        proxy_read_timeout  90;
        proxy_connect_timeout 90;
        proxy_buffer_size   128k;
        proxy_buffers       4 256k;
        proxy_busy_buffers_size 256k;
    }
}
```

**Replace `KEYCLOAK_INTERNAL_IP` with actual IP:**
```bash
KEYCLOAK_IP=$(terraform -chdir=terraform output -raw keycloak_internal_ip)
sudo sed -i "s|KEYCLOAK_INTERNAL_IP|$KEYCLOAK_IP|g" /etc/nginx/sites-available/keycloak
```

### Step 3: Test and Reload Nginx

```bash
# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check status
sudo systemctl status nginx
```

### Step 4: Test HTTPS Access (Allow Self-Signed)

**From local machine:**
```bash
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)

# Allow self-signed cert warning with -k flag
curl -k -I https://$NGINX_IP/

# Expected output:
# HTTP/2 200
# Server: nginx

# Or in a browser, ignore the self-signed warning
# https://35.192.123.45/
```

---

## Option C: Self-Signed + Upgrade to Let's Encrypt Later

Deploy with self-signed cert now, then upgrade to Let's Encrypt once domain is ready.

### Step 1: Deploy with Self-Signed (Option B above)

### Step 2: Once Domain is Ready, Switch to Let's Encrypt

**SSH to Nginx VM:**
```bash
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap
```

**Run Certbot:**
```bash
sudo certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email ops@example.com \
  --domains dev.auth.example.com

# Certbot will update the Nginx config automatically if configured correctly
sudo systemctl reload nginx
```

---

## Troubleshooting TLS Issues

### Issue 1: Certbot Fails with "Couldn't resolve host"

**Cause**: Domain DNS not yet propagated

**Solution:**
```bash
# Check DNS resolution
nslookup dev.auth.example.com

# If not resolving, wait and try again (DNS propagation takes 5-30 min)

# Once DNS is resolving:
sudo certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email ops@example.com \
  --domains dev.auth.example.com
```

### Issue 2: Nginx Fails to Load SSL Certificate

**Error**: `SSL_ERROR_RX_RECORD_TOO_LONG` in browser

**Cause**: Nginx config pointing to non-existent certificate file

**Solution:**
```bash
# Check certificate path exists
sudo ls -la /etc/letsencrypt/live/dev.auth.example.com/ \
  || sudo ls -la /etc/nginx/ssl/

# Check Nginx config syntax
sudo nginx -t

# View error log
sudo tail -50 /var/log/nginx/error.log

# Reload if syntax is OK
sudo systemctl reload nginx
```

### Issue 3: Self-Signed Cert Warnings

**Browser shows**: "Your connection is not private" or "NET::ERR_CERT_AUTHORITY_INVALID"

**This is normal for self-signed certs. Click "Advanced" → "Proceed anyway"**

Or use curl to bypass:
```bash
curl -k https://NGINX_IP/
```

### Issue 4: Certbot Certificate Renewal Failed

**Check renewal status:**
```bash
sudo certbot renew --dry-run

# If dry-run passes:
sudo certbot renew

# Check renewal is scheduled
sudo systemctl list-timers | grep certbot
```

### Issue 5: Mixed Content Error (HTTP vs HTTPS)

**Browser console shows**: "Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource"

**Cause**: Nginx redirecting to HTTP instead of HTTPS

**Solution** — Ensure this in Nginx config:
```nginx
location / {
    proxy_set_header    X-Forwarded-Proto $scheme;
    # ... rest of config
}
```

---

## Complete Nginx Config for TLS

Here's a complete, tested Nginx config supporting both HTTP redirect and HTTPS:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name _;

    location / {
        return 301 https://$host$request_uri;
    }

    # Let Certbot validate HTTP challenges
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    # Let's Encrypt certificate (replace with self-signed path if needed)
    ssl_certificate     /etc/letsencrypt/live/dev.auth.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.auth.example.com/privkey.pem;

    # SSL/TLS configuration
    ssl_protocols           TLSv1.2 TLSv1.3;
    ssl_ciphers             HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache       shared:SSL:10m;
    ssl_session_timeout     10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Keycloak proxy
    location / {
        proxy_pass              http://KEYCLOAK_IP:8080;
        proxy_set_header        Host $host;
        proxy_set_header        X-Real-IP $remote_addr;
        proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto $scheme;
        proxy_read_timeout      90;
        proxy_connect_timeout   90;
        proxy_buffer_size       128k;
        proxy_buffers           4 256k;
        proxy_busy_buffers_size 256k;
    }
}
```

---

## Testing TLS Connection

### Test 1: Basic HTTPS Connection

```bash
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)

# Self-signed (with -k to ignore cert warning)
curl -k -I https://$NGINX_IP/

# Real certificate (no -k needed)
curl -I https://dev.auth.example.com/
```

### Test 2: TLS Version and Ciphers

```bash
# Check TLS version
openssl s_client -connect $NGINX_IP:443 -tls1_2 < /dev/null | grep "Protocol\|Cipher"

# Check certificate details
openssl s_client -connect $NGINX_IP:443 < /dev/null | openssl x509 -text -noout | grep -A 2 "Subject:\|Issuer:\|Not Before\|Not After"
```

### Test 3: HTTPS Redirect

```bash
# Should redirect HTTP to HTTPS
curl -i http://$NGINX_IP/
# Expected: 301 Moved Permanently with Location: https://...
```

---

## Summary: Quick Steps to TLS Access

### For Testing (Self-Signed)
1. SSH to Nginx VM
2. Generate self-signed cert (OpenSSL)
3. Update Nginx config to use self-signed cert
4. Reload Nginx
5. Test with `curl -k https://$NGINX_IP/`

### For Production (Let's Encrypt)
1. Point domain DNS to Nginx public IP
2. Wait for DNS to propagate
3. SSH to Nginx VM
4. Run `sudo certbot certonly --nginx ...`
5. Test with `curl https://dev.auth.example.com/`
6. Certbot auto-renewal runs daily via systemd timer

### Current Terraform Status
The Nginx module's startup script already attempts Certbot setup, but it will fail silently if DNS isn't ready. You can:
- **Regenerate Nginx VM** with `terraform taint` (will try again on next apply)
- **Manually run Certbot** on the VM (recommended if DNS is now ready)
- **Deploy self-signed** for immediate testing
