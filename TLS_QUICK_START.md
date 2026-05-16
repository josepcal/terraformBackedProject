# TLS Quick Start — Access Nginx via HTTPS

## 🚀 Fastest Path to HTTPS

### If You Have a Domain (Recommended)

```bash
# 1. Get your Nginx public IP
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
echo "Nginx IP: $NGINX_IP"

# 2. Update your domain DNS (example with dev.auth.example.com):
#    Create A record:  dev.auth.example.com  A  $NGINX_IP

# 3. Wait for DNS to propagate (check with):
nslookup dev.auth.example.com
# Should return your NGINX_IP

# 4. Run the TLS setup script
bash fix_tls.sh dev dev.auth.example.com ops@example.com

# 5. Test HTTPS
curl -I https://dev.auth.example.com/
```

**Expected output:**
```
HTTP/2 200
Server: nginx
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

### If You Don't Have a Domain (Quick Test)

```bash
# 1. Get Nginx IP
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
echo "Nginx IP: $NGINX_IP"

# 2. Run setup with dummy domain (uses self-signed cert)
bash fix_tls.sh dev dev.auth.example.com ops@example.com

# 3. Test HTTPS (allow self-signed warning)
curl -k -I https://$NGINX_IP/

# 4. In browser: https://$NGINX_IP/ (click "Advanced" → "Proceed anyway")
```

**Expected output:**
```
HTTP/2 200
Server: nginx
```

---

## 📋 Step-by-Step Manual Setup

If the script doesn't work or you want to do it manually:

### Step 1: SSH to Nginx VM

```bash
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap
```

### Step 2: Check Current Status

```bash
# Check if Certbot already issued a certificate
sudo certbot certificates

# Check Nginx logs
sudo tail -50 /var/log/nginx/error.log
```

### Step 3: Option A — Let's Encrypt (if domain is ready)

```bash
# Run Certbot
sudo certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email ops@example.com \
  --domains dev.auth.example.com

# Reload Nginx
sudo systemctl reload nginx
```

### Step 3: Option B — Self-Signed (for testing)

```bash
# Create directory
sudo mkdir -p /etc/nginx/ssl

# Generate self-signed cert
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=dev.auth.example.com"

# Get Keycloak IP
KEYCLOAK_IP=$(terraform -chdir=terraform output -raw keycloak_internal_ip)

# Update Nginx config
sudo tee /etc/nginx/sites-available/keycloak > /dev/null <<EOF
server {
    listen 80;
    server_name _;
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate     /etc/nginx/ssl/nginx-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass          http://$KEYCLOAK_IP:8080;
        proxy_set_header    Host \$host;
        proxy_set_header    X-Real-IP \$remote_addr;
        proxy_set_header    X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto \$scheme;
    }
}
EOF

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: Verify

```bash
# Check Nginx is running
sudo systemctl status nginx

# View error log if there are issues
sudo tail -50 /var/log/nginx/error.log
```

---

## 🔍 Testing HTTPS Access

### From Your Local Machine

**Test Let's Encrypt (if you used a real domain):**
```bash
curl -I https://dev.auth.example.com/
```

**Test Self-Signed (allow cert warning):**
```bash
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
curl -k -I https://$NGINX_IP/
```

**Expected response:**
```
HTTP/2 200
Server: nginx
Strict-Transport-Security: max-age=31536000
```

### In a Browser

**Let's Encrypt:**
```
https://dev.auth.example.com/
```

**Self-Signed:**
```
https://<NGINX_IP>/
# Then click "Advanced" → "Proceed anyway"
```

### Check Certificate Details

```bash
# View certificate info (allows self-signed)
openssl s_client -connect <NGINX_IP>:443 -servername dev.auth.example.com < /dev/null | openssl x509 -text -noout

# Quick check
openssl s_client -connect <NGINX_IP>:443 < /dev/null | grep "Issuer\|Subject\|Not Before\|Not After"
```

---

## ⚠️ Common Issues & Fixes

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| `curl: (60) SSL: CERTIFICATE_VERIFY_FAILED` | Cert not issued yet | Use `curl -k` (self-signed) or wait for DNS/Certbot |
| `curl: (7) Failed to connect to port 443` | Port 443 blocked | Check firewall rule `dev-allow-http-https` exists |
| `HTTP/1.1 502 Bad Gateway` | Keycloak not reachable | SSH to Keycloak VM, check `sudo docker logs keycloak` |
| `nginx: [error] open() "/etc/letsencrypt/live/..." failed` | Cert path wrong | Update Nginx config to use actual cert path |
| DNS not resolving | `nslookup dev.auth.example.com` fails | Update domain DNS, wait 5-30 min for propagation |

---

## 🎯 Full Testing Flow

```bash
# 1. Get IPs
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
KEYCLOAK_IP=$(terraform -chdir=terraform output -raw keycloak_internal_ip)

# 2. Set up DNS (if you have a domain)
# Create A record: dev.auth.example.com  A  $NGINX_IP
# Wait for propagation: nslookup dev.auth.example.com

# 3. Set up TLS (automated)
bash fix_tls.sh dev dev.auth.example.com ops@example.com

# 4. Test HTTPS
curl -I https://dev.auth.example.com/  # or curl -k https://$NGINX_IP/

# 5. Access Keycloak Admin Console
# Browser: https://dev.auth.example.com/auth/admin/
# Login: admin / (your keycloak_admin_password)

# 6. Check Keycloak database connection
gcloud compute ssh dev-keycloak --zone=us-central1-a --tunnel-through-iap
sudo docker logs keycloak | grep -i database
```

---

## 📝 Notes

- **Let's Encrypt** certificates are free and valid for 90 days, auto-renewing daily
- **Self-signed** certificates work for testing but will show browser warnings
- **HTTP → HTTPS redirect** is configured to force secure connections
- **Keycloak** runs on plain HTTP internally; Nginx handles SSL termination (secure design)
- Use **IAP tunnel** for SSH; direct SSH is blocked for security

---

## 🆘 Still Having Issues?

Check logs on Nginx VM:
```bash
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap -- sudo tail -f /var/log/nginx/error.log
```

Full troubleshooting guide: See `TLS_SETUP.md`
