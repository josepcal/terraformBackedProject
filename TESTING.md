# TESTING.md — Deployed Stack Testing Guide

## Quick Start

## 0.verify gcp resources
```bash

gcloud asset search-all-resources --scope=projects/terraform-project-496514
				
				#(all resource list -1.400 lines-)
				
gcloud asset search-all-resources --scope=projects/terraform-project-496514 --format="table(name, assetType, location)"
				
				#(summary in 147 lines)
```


```bash
# Get infrastructure IPs
terraform -chdir=terraform output

# Test Nginx is reachable
curl -i http://$(terraform -chdir=terraform output -raw nginx_external_ip)/
```

## 1. Terraform Outputs

```bash
# Show all outputs
terraform -chdir=terraform output

# Extract individual values
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
KEYCLOAK_IP=$(terraform -chdir=terraform output -raw keycloak_internal_ip)
POSTGRESQL_IP=$(terraform -chdir=terraform output -raw postgresql_internal_ip)
```

## 2. Network Tests

### Test Nginx External IP
```bash
# Should return 301 redirect (HTTP → HTTPS)
curl -i http://$NGINX_IP/

# Expected output:
# HTTP/1.1 301 Moved Permanently
# Location: https://dev.auth.example.com/
```

### Test DNS Resolution (once configured)
```bash
nslookup dev.auth.example.com
# Should resolve to $NGINX_IP
```

## 3. SSH Access via IAP Tunnel

```bash
# Nginx VM
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap

# Keycloak VM
gcloud compute ssh dev-keycloak --zone=us-central1-a --tunnel-through-iap

# PostgreSQL VM
gcloud compute ssh dev-postgresql --zone=us-central1-a --tunnel-through-iap
```

## 4. PostgreSQL Verification

**SSH to PostgreSQL VM, then:**

```bash
# Check service status
sudo systemctl status postgresql

# Connect as postgres user
sudo -u postgres psql

# Inside psql:
\l                        # List databases (should have 'keycloak')
\du                       # List users (should have 'keycloak' user)
\c keycloak               # Connect to keycloak database
SELECT version();         # Verify PostgreSQL version
\dt                       # List tables
\q                        # Exit
```

### Verify Data Disk
```bash
# Check mount point
df -h | grep /data/postgresql

# Verify disk is formatted and mounted
lsblk
```

## 5. Keycloak Service Verification

**SSH to Keycloak VM, then:**

```bash
# Check systemd service
sudo systemctl status keycloak

# View Docker container logs
sudo docker logs -f keycloak

# Verify port 8080 is listening
sudo ss -tlnp | grep 8080

# Test connectivity to PostgreSQL
psql -h <POSTGRESQL_IP> -U keycloak -d keycloak
# Password: (your $TF_VAR_keycloak_db_password)
```

## 6. Keycloak Admin Console Access

### Option A: Domain DNS Already Configured
```bash
# Open in browser:
https://dev.auth.example.com/auth/admin/
# or
https://dev.auth.example.com/admin/

# Login with:
# Username: admin
# Password: (your $TF_VAR_keycloak_admin_password)
```

### Option B: Port-Forward via IAP Tunnel
```bash
# Terminal 1: Create tunnel
gcloud compute ssh dev-nginx \
  --zone=us-central1-a \
  --tunnel-through-iap \
  -- -L 8443:localhost:443

# Terminal 2: Add to /etc/hosts:
# 127.0.0.1 dev.auth.example.com

# Then open in browser:
# https://dev.auth.example.com:8443/auth/admin/
```

### Option C: Allow Self-Signed Cert
```bash
curl -k https://dev.auth.example.com/
# -k allows self-signed certs
```

## 7. Test Keycloak ↔ PostgreSQL Connection

**From Keycloak VM:**
```bash
# Test database connectivity
psql -h <POSTGRESQL_IP> -U keycloak -d keycloak

# Check Keycloak has created tables
\dt

# Keycloak should have tables like: USER_ENTITY, REALM, CLIENT, etc.
```

**From Keycloak Docker logs:**
```bash
sudo docker logs keycloak | grep -i "database\|connection\|liquibase"
# Should show successful DB initialization on first boot
```

## 8. Test Data Persistence

1. **SSH to Keycloak VM**
2. **Access admin console** (see Step 6)
3. **Create a test user or realm**
4. **Restart Keycloak:**
   ```bash
   sudo systemctl restart keycloak
   ```
5. **Wait 30 seconds for startup**
6. **Check logs:**
   ```bash
   sudo docker logs keycloak | tail -20
   ```
7. **Access admin console again** — test data should still exist (proof of persistence)

## 9. Firewall Rule Verification

**From your local machine:**

```bash
# Check firewall rules were created
gcloud compute firewall-rules list --filter="name~'dev-'"

# Expected rules:
# - dev-allow-http-https     (port 80/443 to nginx only)
# - dev-allow-keycloak-from-nginx  (port 8080 from nginx tag)
# - dev-allow-postgresql-from-keycloak  (port 5432 from keycloak tag)
# - dev-allow-ssh            (IAP range only)
```

## 10. Health Check Script

Save as `test_deployment.sh`:

```bash
#!/bin/bash
set -e

ENVIRONMENT="${1:-dev}"
ZONE="us-central1-a"

echo "Testing $ENVIRONMENT deployment..."
echo ""

# Get IPs
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
KEYCLOAK_IP=$(terraform -chdir=terraform output -raw keycloak_internal_ip)
POSTGRESQL_IP=$(terraform -chdir=terraform output -raw postgresql_internal_ip)

echo "Infrastructure IPs:"
echo "  Nginx: $NGINX_IP"
echo "  Keycloak: $KEYCLOAK_IP"
echo "  PostgreSQL: $POSTGRESQL_IP"
echo ""

echo "Testing Nginx connectivity..."
curl -s -o /dev/null -w "  HTTP Status: %{http_code}\n" http://$NGINX_IP/

echo ""
echo "VM Status:"
gcloud compute instances describe dev-nginx --zone=$ZONE --format="table(name,status)"
gcloud compute instances describe dev-keycloak --zone=$ZONE --format="table(name,status)"
gcloud compute instances describe dev-postgresql --zone=$ZONE --format="table(name,status)"

echo ""
echo "To SSH into VMs, run:"
echo "  gcloud compute ssh dev-nginx --zone=$ZONE --tunnel-through-iap"
echo "  gcloud compute ssh dev-keycloak --zone=$ZONE --tunnel-through-iap"
echo "  gcloud compute ssh dev-postgresql --zone=$ZONE --tunnel-through-iap"
```

Run:
```bash
bash test_deployment.sh dev
```

## 11. Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| Nginx not reachable | `curl http://$NGINX_IP/` | Verify external IP assigned; check firewall rules |
| HTTPS cert error | `sudo certbot certificates` (on Nginx) | Domain DNS must resolve to Nginx IP; re-run certbot |
| Keycloak not starting | `sudo docker logs keycloak` | Check PostgreSQL is reachable; verify env vars |
| PostgreSQL connection refused | `psql -h $PG_IP -U keycloak` | Verify firewall rule allows keycloak→postgresql; check PG service |
| Data disk not found | `df -h /data/postgresql` | Check disk attachment; verify filesystem mount |
| Keycloak loses data after restart | Check Keycloak logs for DB errors | Verify PostgreSQL has persistent data disk |

## 12. Monitoring

**Real-time logs:**

```bash
# Nginx access logs
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap \
  -- sudo tail -f /var/log/nginx/access.log

# Keycloak logs
gcloud compute ssh dev-keycloak --zone=us-central1-a --tunnel-through-iap \
  -- sudo docker logs -f keycloak

# PostgreSQL logs
gcloud compute ssh dev-postgresql --zone=us-central1-a --tunnel-through-iap \
  -- sudo journalctl -u postgresql -f
```

## 13. Next Steps

1. **Set up domain DNS** to point to Nginx external IP
2. **Wait for Let's Encrypt cert** to be issued automatically (via certbot in Nginx startup script)
3. **Create realms and users** in Keycloak admin console
4. **Configure applications** to use Keycloak for authentication
5. **Set up automated backups** for PostgreSQL data disk (GCP Snapshots)
6. **Monitor resources** via GCP Cloud Monitoring
