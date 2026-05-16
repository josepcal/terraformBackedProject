# Deployment Checklist & TLS Setup

## ✅ Phase 1: Verify Terraform Deployment

- [ ] `terraform -chdir=terraform output` shows all three IPs:
  - [ ] `nginx_external_ip`
  - [ ] `keycloak_internal_ip`
  - [ ] `postgresql_internal_ip`

- [ ] All three VMs running (check GCP Console or `gcloud compute instances list`)

## ✅ Phase 2: Verify VM Services

### PostgreSQL VM
```bash
gcloud compute ssh dev-postgresql --zone=us-central1-a --tunnel-through-iap
sudo systemctl status postgresql
sudo -u postgres psql -c "SELECT version();"
\q
```

- [ ] PostgreSQL running
- [ ] `keycloak` database exists
- [ ] `keycloak` user exists

### Keycloak VM
```bash
gcloud compute ssh dev-keycloak --zone=us-central1-a --tunnel-through-iap
sudo systemctl status keycloak
sudo docker logs keycloak | tail -20
psql -h <POSTGRESQL_IP> -U keycloak -d keycloak
```

- [ ] Docker container running
- [ ] Connected to PostgreSQL
- [ ] No connection errors in logs

### Nginx VM
```bash
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap
sudo systemctl status nginx
```

- [ ] Nginx running
- [ ] Config syntax OK

## ✅ Phase 3: Network Tests (from local machine)

```bash
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
curl -i http://$NGINX_IP/
```

- [ ] HTTP returns 301 redirect to HTTPS

## ✅ Phase 4: TLS Setup (Choose One)

### Option A: Real Domain + Let's Encrypt

1. [ ] Update domain DNS A record to `$NGINX_IP`
2. [ ] Verify DNS propagation: `nslookup dev.auth.example.com`
3. [ ] Run setup: `bash fix_tls.sh dev dev.auth.example.com ops@example.com`
4. [ ] Verify cert: `curl -I https://dev.auth.example.com/`

### Option B: Self-Signed Cert (Testing)

1. [ ] Run setup: `bash fix_tls.sh dev dev.auth.example.com ops@example.com`
2. [ ] Verify cert: `curl -k -I https://$NGINX_IP/`

## ✅ Phase 5: Access Keycloak

### Admin Console
```
https://dev.auth.example.com/auth/admin/
Username: admin
Password: (your $TF_VAR_keycloak_admin_password)
```

Or via port-forward:
```bash
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap \
  -- -L 8443:localhost:443
# Then: https://localhost:8443/auth/admin/
```

- [ ] Admin console accessible
- [ ] Can log in
- [ ] Can create realms/users

## ✅ Phase 6: Test Data Persistence

1. [ ] Create a test user in Keycloak
2. [ ] SSH to Keycloak VM
3. [ ] Restart service: `sudo systemctl restart keycloak`
4. [ ] Wait 30 seconds
5. [ ] Access admin console again
6. [ ] Verify test user still exists

## ✅ Phase 7: Production Readiness

- [ ] Enable GCP Cloud Monitoring
- [ ] Set up PostgreSQL backup (GCP Snapshots)
- [ ] Configure firewall for production CIDR ranges
- [ ] Enable VPC Flow Logs
- [ ] Set up Cloud NAT for private VMs
- [ ] Update AGENTS.md with production values
- [ ] Document custom configurations

## 🔗 Quick Commands Reference

```bash
# Get IPs
terraform -chdir=terraform output

# SSH to VMs (via IAP)
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap
gcloud compute ssh dev-keycloak --zone=us-central1-a --tunnel-through-iap
gcloud compute ssh dev-postgresql --zone=us-central1-a --tunnel-through-iap

# View logs
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap -- sudo tail -f /var/log/nginx/error.log
gcloud compute ssh dev-keycloak --zone=us-central1-a --tunnel-through-iap -- sudo docker logs -f keycloak
gcloud compute ssh dev-postgresql --zone=us-central1-a --tunnel-through-iap -- sudo journalctl -u postgresql -f

# Test HTTPS
curl -k https://$NGINX_IP/
curl -I https://dev.auth.example.com/

# Replan (don't apply)
terraform -chdir=terraform plan -var-file=environments/dev/dev.tfvars
```

## 📚 Documentation Files

- `AGENTS.md` — Project architecture and conventions
- `TESTING.md` — Full testing guide
- `TLS_SETUP.md` — Detailed TLS troubleshooting
- `TLS_QUICK_START.md` — Quick reference for HTTPS setup
- `DEPLOYMENT_CHECKLIST.md` — This file

## 🚨 Emergency Procedures

### Destroy Everything (Dev Only)
```bash
terraform -chdir=terraform destroy -var-file=environments/dev/dev.tfvars
```

### Restart Services
```bash
# Keycloak
gcloud compute ssh dev-keycloak --zone=us-central1-a --tunnel-through-iap -- sudo systemctl restart keycloak

# Nginx
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap -- sudo systemctl restart nginx

# PostgreSQL
gcloud compute ssh dev-postgresql --zone=us-central1-a --tunnel-through-iap -- sudo systemctl restart postgresql
```

### Recover PostgreSQL Data Disk
```bash
# List snapshots
gcloud compute snapshots list --filter="name~'postgresql'"

# Restore from snapshot (if available)
gcloud compute disks create restored-disk \
  --source-snapshot=postgresql-backup-2024-01-01 \
  --zone=us-central1-a
```
