#!/bin/bash
# fix_tls.sh — Quick TLS setup for Nginx VM

set -e

ENVIRONMENT="${1:-dev}"
ZONE="us-central1-a"
DOMAIN="${2:-dev.auth.example.com}"
EMAIL="${3:-ops@example.com}"

echo "=========================================="
echo "TLS Setup for Nginx — $ENVIRONMENT"
echo "=========================================="
echo ""

# Get Nginx IP
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
KEYCLOAK_IP=$(terraform -chdir=terraform output -raw keycloak_internal_ip)

echo "Nginx Public IP: $NGINX_IP"
echo "Keycloak Internal IP: $KEYCLOAK_IP"
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# Check if domain resolves
echo "Checking DNS resolution for $DOMAIN..."
if nslookup $DOMAIN &> /dev/null; then
    RESOLVED_IP=$(nslookup $DOMAIN | grep "Address:" | tail -1 | awk '{print $2}')
    echo "✓ Domain resolves to: $RESOLVED_IP"
    
    if [ "$RESOLVED_IP" == "$NGINX_IP" ]; then
        echo "✓ Domain correctly points to Nginx IP"
        USE_LETS_ENCRYPT=true
    else
        echo "✗ Domain does NOT point to Nginx IP ($NGINX_IP)"
        echo "  Please update your DNS and try again."
        USE_LETS_ENCRYPT=false
    fi
else
    echo "✗ Domain does not resolve"
    echo "  Will use self-signed certificate for now."
    USE_LETS_ENCRYPT=false
fi

echo ""
echo "=========================================="
echo "Connecting to Nginx VM..."
echo "=========================================="
echo ""

# SSH command
SSH_CMD="gcloud compute ssh ${ENVIRONMENT}-nginx --zone=$ZONE --tunnel-through-iap"

# Check Nginx status
echo "Checking Nginx status..."
$SSH_CMD -- sudo systemctl status nginx || true

echo ""
echo "=========================================="
echo "Setting up TLS..."
echo "=========================================="
echo ""

if [ "$USE_LETS_ENCRYPT" = true ]; then
    echo "Using Let's Encrypt (Certbot)..."
    echo ""
    
    # Run Certbot
    $SSH_CMD -- sudo certbot certonly --nginx \
        --non-interactive \
        --agree-tos \
        --email $EMAIL \
        --domains $DOMAIN \
        --redirect || true
    
    # Check if certificate was issued
    echo ""
    echo "Checking certificate status..."
    $SSH_CMD -- sudo certbot certificates
    
else
    echo "Using self-signed certificate..."
    echo ""
    
    # Generate self-signed certificate
    $SSH_CMD << EOF
        set -e
        echo "Generating self-signed certificate..."
        
        # Create SSL directory
        sudo mkdir -p /etc/nginx/ssl
        
        # Generate certificate
        sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\
            -keyout /etc/nginx/ssl/nginx-selfsigned.key \\
            -out /etc/nginx/ssl/nginx-selfsigned.crt \\
            -subj "/C=US/ST=State/L=City/O=Organization/CN=$NGINX_IP" \\
            -addext "subjectAltName=IP:$NGINX_IP"
        
        echo "✓ Self-signed certificate created"
        sudo openssl x509 -in /etc/nginx/ssl/nginx-selfsigned.crt -noout -subject -ext subjectAltName
        ls -la /etc/nginx/ssl/
EOF
    
    # Update Nginx config
    echo ""
    echo "Updating Nginx configuration for self-signed cert..."
    $SSH_CMD << EOF
        set -e
        
        # Backup original config
        sudo cp /etc/nginx/sites-available/keycloak /etc/nginx/sites-available/keycloak.backup
        
        # Create new config with self-signed cert
        sudo tee /etc/nginx/sites-available/keycloak > /dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name _;

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    # Self-signed certificate
    ssl_certificate     /etc/nginx/ssl/nginx-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;

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

    location / {
        proxy_pass              http://$KEYCLOAK_IP:8080;
        proxy_set_header        Host \$host;
        proxy_set_header        X-Real-IP \$remote_addr;
        proxy_set_header        X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto \$scheme;
        proxy_read_timeout      90;
        proxy_connect_timeout   90;
        proxy_buffer_size       128k;
        proxy_buffers           4 256k;
        proxy_busy_buffers_size 256k;
    }
}
NGINX

        echo "✓ Nginx configuration updated"
EOF
fi

echo ""
echo "Testing Nginx configuration..."
$SSH_CMD -- sudo nginx -t

echo ""
echo "Reloading Nginx..."
$SSH_CMD -- sudo systemctl reload nginx

echo ""
echo "Checking Nginx status..."
$SSH_CMD -- sudo systemctl status nginx

echo ""
echo "=========================================="
echo "TLS Setup Complete!"
echo "=========================================="
echo ""

if [ "$USE_LETS_ENCRYPT" = true ]; then
    echo "✓ Let's Encrypt certificate issued"
    echo "  Access at: https://$DOMAIN/"
else
    echo "✓ Self-signed certificate deployed"
    echo "  Access at: https://$NGINX_IP/ (allow self-signed warning)"
    echo ""
    echo "  Or use curl with -k flag:"
    echo "  curl -k https://$NGINX_IP/"
fi

echo ""
echo "Testing HTTPS connection..."
if [ "$USE_LETS_ENCRYPT" = true ]; then
    curl -I https://$DOMAIN/ || echo "⚠ HTTPS request failed; check certificate chain"
else
    curl -k -I https://$NGINX_IP/ || echo "⚠ HTTPS request failed; check Nginx logs"
fi

echo ""
echo "To view logs on Nginx VM:"
echo "  $SSH_CMD -- sudo tail -f /var/log/nginx/error.log"
echo "  $SSH_CMD -- sudo tail -f /var/log/nginx/access.log"
