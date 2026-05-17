# HTTPS Access Guide — Three Simple Paths

Your Nginx is deployed with a public IP, but needs TLS to access Keycloak securely.

---

## 🚀 Path 1: Fastest — Self-Signed (Testing, 5 minutes)

**No domain required. Works immediately.**

```bash
# 1. Run automated setup
bash fix_tls.sh dev dev.auth.example.com ops@example.com

# 2. Test (allow self-signed warning)
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
curl -k -I https://$NGINX_IP/

# 3. Access in browser
# https://$NGINX_IP/
# (Click "Advanced" → "Proceed anyway")
```

**Status:** ✅ Works immediately, ⚠️ Browser warnings (self-signed cert)

---

## 🌐 Path 2: Production — Let's Encrypt (Real Domain, 10 minutes)

**Use a real domain for automatic certificate renewal.**

```bash
# 1. Get your Nginx IP
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
echo $NGINX_IP
# Example: 35.192.123.45

# 2. Update your domain DNS
# Create A record:
#   dev.auth.example.com  A  35.192.123.45
# (Wait 5-30 minutes for DNS propagation)

# 3. Verify DNS is working
nslookup dev.auth.example.com
# Should return: 35.192.123.45

# 4. Run automated setup
bash fix_tls.sh dev dev.auth.example.com ops@example.com

# 5. Test
curl -I https://dev.auth.example.com/
# Expected: HTTP/2 200

# 6. Access in browser
# https://dev.auth.example.com/auth/admin/
```

**Status:** ✅ Valid certificate, ✅ No browser warnings, ✅ Auto-renewal

---

## 🔧 Path 3: Manual — Control Everything (Advanced)

**If the script doesn't work, do it manually.**

### Step 1: SSH to Nginx VM

```bash
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap
```

### Step 2A: Install Self-Signed Cert

```bash
# Create certificate directory
sudo mkdir -p /etc/nginx/ssl

# Generate certificate (valid 365 days)
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=Org/CN=dev.auth.example.com"

echo "✓ Self-signed certificate created"
```

### Step 2B: Install Let's Encrypt Cert (if domain ready)

```bash
# Run Certbot
sudo certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email ops@example.com \
  --domains dev.auth.example.com

echo "✓ Let's Encrypt certificate issued"
```

### Step 3: Update Nginx Config

Get Keycloak IP (from local machine):
```bash
KEYCLOAK_IP=$(terraform -chdir=terraform output -raw keycloak_internal_ip)
```

On Nginx VM, create the config:
```bash
# Backup original
sudo cp /etc/nginx/sites-available/keycloak /etc/nginx/sites-available/keycloak.backup

# Create new config (replace KEYCLOAK_IP with actual IP)
sudo tee /etc/nginx/sites-available/keycloak > /dev/null <<'NGINX'
# HTTP redirect
server {
    listen 80;
    server_name _;
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name _;

    # Certificate (choose one):
    # For self-signed:
    ssl_certificate     /etc/nginx/ssl/nginx-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;

    # For Let's Encrypt:
    # ssl_certificate     /etc/letsencrypt/live/dev.auth.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/dev.auth.example.com/privkey.pem;

    # TLS configuration
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;

    # Keycloak proxy
    location / {
        proxy_pass              http://KEYCLOAK_IP:8080;
        proxy_set_header        Host $host;
        proxy_set_header        X-Real-IP $remote_addr;
        proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto $scheme;
        proxy_read_timeout      90;
        proxy_connect_timeout   90;
    }
}
NGINX
```

### Step 4: Test and Enable

```bash
# Test configuration syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Verify running
sudo systemctl status nginx
```

### Step 5: Verify Locally

Exit Nginx VM and test:
```bash
# Self-signed (allow warning)
curl -k -I https://$NGINX_IP/

# Let's Encrypt (should have no warning)
curl -I https://dev.auth.example.com/
```

---

## 🔍 Troubleshooting

### Problem: "Connection refused" on port 443

```bash
# Check Nginx is listening on 443
sudo ss -tlnp | grep 443

# If not shown, check error log
sudo tail -50 /var/log/nginx/error.log
```

### Problem: "SSL certificate problem" from curl

**For self-signed:** Use `curl -k` to allow
**For Let's Encrypt:** Check DNS and Certbot logs

```bash
# Check certificate path
sudo ls -la /etc/letsencrypt/live/dev.auth.example.com/ || \
sudo ls -la /etc/nginx/ssl/
```

### Problem: Nginx won't start after config update

```bash
# Test configuration
sudo nginx -t

# View detailed error
sudo systemctl status nginx

# View logs
sudo journalctl -xe
sudo tail -100 /var/log/nginx/error.log
```

### Problem: Certificate renewal failing

```bash
# Check renewal status
sudo certbot renew --dry-run

# View renewal timer
sudo systemctl list-timers | grep certbot

# Manually renew
sudo certbot renew
```

---

## 📊 Quick Comparison

| Method | Setup Time | Cert Type | Browser Warning | Auto-Renew | Best For |
|--------|-----------|-----------|-----------------|-----------|----------|
| **Self-Signed** | 5 min | Self-signed | ⚠️ Yes | ❌ No | Testing |
| **Let's Encrypt** | 10 min | Real (Free) | ✅ No | ✅ Yes | Production |
| **Manual (Both)** | 15 min | Custom | Varies | Manual | Control |

---

## ✅ Verification Checklist

After setup, verify:

```bash
# 1. HTTP redirects to HTTPS
curl -i http://$(terraform -chdir=terraform output -raw nginx_external_ip)/
# Expected: 301 Moved Permanently

# 2. HTTPS works (self-signed)
curl -k -I https://$(terraform -chdir=terraform output -raw nginx_external_ip)/
# Expected: HTTP/2 200

# 3. HTTPS works (Let's Encrypt)
curl -I https://dev.auth.example.com/
# Expected: HTTP/2 200 (no errors)

# 4. Certificate chain is valid
openssl s_client -connect $(terraform -chdir=terraform output -raw nginx_external_ip):443 < /dev/null | openssl x509 -text -noout | grep -i issuer

# 5. Security headers present
curl -I https://dev.auth.example.com/ | grep -i "strict-transport\|x-frame\|x-content"
```

---

## 🎯 Next: Access Keycloak Admin

Once HTTPS is working:

```bash
# Browser (replace with your domain/IP)
https://dev.auth.example.com/auth/admin/

# OR via port-forward
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap \
  -- -L 8443:localhost:443

# Then: https://localhost:8443/auth/admin/
```

**Login:**
- Username: `admin`
- Password: (your `TF_VAR_keycloak_admin_password`)

---

## 🚀 Recommended Path

1. **Immediate Testing:** Path 1 (Self-Signed) — 5 min
2. **Prepare Domain:** Point DNS to Nginx IP
3. **Production:** Path 2 (Let's Encrypt) — once DNS is ready

**Current Status:** You're at step 1 (HTTP running). Choose above path to add HTTPS.
