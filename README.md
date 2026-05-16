# Keycloak + PostgreSQL + Nginx on GCP — Complete Terraform Deployment

A production-ready Terraform project to deploy a secure identity management stack on Google Cloud Platform using Compute Engine VMs.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│          Internet (HTTPS)                    │
│         (Client Browsers)                    │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │    Nginx (Public)       │
         │  - Static External IP   │
         │  - Port 443 (HTTPS)     │
         │  - SSL/TLS Termination  │
         │  - Reverse Proxy        │
         └───────┬────────────────┘
                 │ (Port 8080)
                 │ (Private)
         ┌───────▼────────────────┐
         │  Keycloak (Private)     │
         │  - Docker Container     │
         │  - No External IP       │
         │  - HTTP Only            │
         │  - Identity Provider    │
         └───────┬────────────────┘
                 │ (Port 5432)
                 │ (Private)
         ┌───────▼────────────────┐
         │  PostgreSQL (Private)   │
         │  - VM: e2-standard-2    │
         │  - 100GB Persistent SSD │
         │  - Data Directory       │
         └────────────────────────┘
```

**Network Security:**
- Nginx in public subnet with external IP
- Keycloak + PostgreSQL in private subnet
- Cloud NAT for private VM outbound access
- Firewall rules restrict all inter-service traffic
- SSH access only via IAP (Identity-Aware Proxy)

---

## 📋 Quick Start

### 1. Prerequisites

```bash
# Install gcloud CLI
gcloud auth application-default login

# Install Terraform (v1.5+)
terraform version

# Ensure these GCP APIs are enabled:
# - compute.googleapis.com
# - iam.googleapis.com
# - cloudresourcemanager.googleapis.com
```

### 2. Configure Variables

Edit `terraform/environments/dev/dev.tfvars`:

```bash
project_id              = "your-gcp-project-id"
region                  = "us-central1"
zone                    = "us-central1-a"
domain                  = "dev.auth.example.com"  # Your domain here
ssl_cert_email          = "ops@example.com"
ssh_public_key          = "ssh-rsa AAAA... your-key-here"
```

Set sensitive variables:

```bash
export TF_VAR_keycloak_admin_password="secure-admin-password"
export TF_VAR_postgres_password="secure-db-root-password"
export TF_VAR_keycloak_db_password="secure-db-keycloak-password"
```

### 3. Deploy

```bash
# Initialize Terraform
terraform -chdir=terraform init

# Plan (verify what will be created)
terraform -chdir=terraform plan -var-file=environments/dev/dev.tfvars

# Apply (create infrastructure)
terraform -chdir=terraform apply -var-file=environments/dev/dev.tfvars

# Get outputs
terraform -chdir=terraform output
```

### 4. Configure HTTPS

**Option A: Real Domain**
1. Point your domain DNS A record to the Nginx external IP
2. Wait for DNS propagation
3. Run: `bash fix_tls.sh dev dev.auth.example.com ops@example.com`

**Option B: Testing (Self-Signed)**
1. Run: `bash fix_tls.sh dev dev.auth.example.com ops@example.com`
2. Access with: `curl -k https://<NGINX_IP>/` (allow self-signed warning)

### 5. Access Keycloak

```
Admin Console: https://dev.auth.example.com/auth/admin/
Username: admin
Password: (your TF_VAR_keycloak_admin_password)
```

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| **AGENTS.md** | Architecture overview, conventions, common mistakes |
| **TESTING.md** | Complete testing guide for deployed stack |
| **TLS_SETUP.md** | Detailed HTTPS/TLS configuration and troubleshooting |
| **TLS_QUICK_START.md** | Quick reference for setting up HTTPS |
| **DEPLOYMENT_CHECKLIST.md** | Step-by-step validation checklist |
| **fix_tls.sh** | Automated TLS setup script |

---

## 🔧 Key Features

✅ **Keycloak**
- Identity and Access Management (IAM)
- OAuth 2.0 / OpenID Connect
- Docker-based deployment
- Auto-connects to PostgreSQL
- Persistent data across restarts

✅ **PostgreSQL**
- Relational database for Keycloak
- 100GB persistent SSD data disk
- Automatic initialization and user creation
- Backup-friendly via GCP Snapshots

✅ **Nginx**
- Reverse proxy and load balancer
- HTTPS/TLS termination
- Let's Encrypt integration (auto-renewal)
- HTTP → HTTPS redirect
- Security headers configured

✅ **Network**
- VPC with public/private subnets
- Cloud NAT for private VM outbound access
- Firewall rules: minimal attack surface
- IAP tunnel for secure SSH access
- Service accounts with least privilege

✅ **Infrastructure**
- Multi-environment support (dev, prod)
- Remote state storage (GCS)
- Auto-scaling network setup
- Shielded VM security
- Comprehensive logging

---

## 🚀 Deployment Flow

```bash
# 1. Get infrastructure IPs
NGINX_IP=$(terraform -chdir=terraform output -raw nginx_external_ip)
KEYCLOAK_IP=$(terraform -chdir=terraform output -raw keycloak_internal_ip)
POSTGRESQL_IP=$(terraform -chdir=terraform output -raw postgresql_internal_ip)

# 2. Verify services are running
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap -- sudo systemctl status nginx
gcloud compute ssh dev-keycloak --zone=us-central1-a --tunnel-through-iap -- sudo docker logs keycloak
gcloud compute ssh dev-postgresql --zone=us-central1-a --tunnel-through-iap -- sudo systemctl status postgresql

# 3. Set up HTTPS (automated)
bash fix_tls.sh dev dev.auth.example.com ops@example.com

# 4. Test HTTPS
curl -I https://dev.auth.example.com/  # Real domain
curl -k -I https://$NGINX_IP/  # Self-signed

# 5. Access admin console
# Browser: https://dev.auth.example.com/auth/admin/
```

---

## 📁 Project Structure

```
terraform/
├── versions.tf                 # Terraform & provider versions
├── variables.tf                # Input variables
├── main.tf                     # Module wiring
├── outputs.tf                  # Output values
│
├── environments/
│   ├── dev/
│   │   ├── dev.tfvars          # Dev-specific values
│   │   └── backend.tf          # GCS remote state config
│   └── prod/
│       ├── prod.tfvars         # Prod-specific values
│       └── backend.tf          # GCS remote state config
│
└── modules/
    ├── network/                # VPC, subnets, firewall, Cloud NAT
    ├── postgresql/             # PostgreSQL VM, persistent disk
    ├── keycloak/               # Keycloak Docker VM
    └── nginx/                  # Nginx reverse proxy VM
```

---

## 🔐 Security Best Practices

✅ **Network Security**
- Private subnets isolate databases and app servers
- Firewall rules restrict traffic to minimum required
- Cloud NAT hides private IP addresses
- SSH only via IAP (no exposed bastion)

✅ **Secret Management**
- Sensitive variables stored in `TF_VAR_*` env vars
- Never committed to version control
- Terraform state stored remotely in GCS (encrypted)
- `.tfstate` files in `.gitignore`

✅ **TLS/HTTPS**
- Let's Encrypt certificates (free, auto-renewing)
- HSTS header enforces HTTPS
- TLS 1.2 + 1.3 only
- Strong cipher suites

✅ **VM Hardening**
- Shielded VMs (Secure Boot, vTPM, Integrity Monitoring)
- Latest Debian image
- Minimal IAM permissions per service
- Block project-wide SSH keys

---

## 🧪 Testing & Validation

See **DEPLOYMENT_CHECKLIST.md** for complete validation steps:

1. Verify Terraform outputs
2. Check VM services
3. Test network connectivity
4. Set up HTTPS
5. Access admin console
6. Test data persistence
7. Production readiness

---

## 📊 Infrastructure Costs (Approximate, US Central)

| Resource | Type | Cost/Month |
|----------|------|-----------|
| Nginx VM | e2-small | $10 |
| Keycloak VM | e2-medium | $15 |
| PostgreSQL VM | e2-standard-2 | $30 |
| Boot disks | 3 × 20GB SSD | $15 |
| PostgreSQL data disk | 100GB SSD | $10 |
| Static IP (Nginx) | Unused hours | $3-5 |
| Cloud NAT | Data processed | $5-10 |
| **Total** | | **$80-95** |

---

## 🚨 Common Issues

| Issue | Solution |
|-------|----------|
| Certbot fails to issue cert | Domain DNS must resolve to Nginx IP; wait for propagation |
| Keycloak won't start | Check PostgreSQL is running; verify connection string in Docker logs |
| HTTPS cert error | Use `curl -k` for self-signed; or deploy Let's Encrypt cert |
| Can't SSH to VMs | Use IAP tunnel: `gcloud compute ssh ... --tunnel-through-iap` |
| PostgreSQL data lost | Verify persistent data disk is attached; check mount point `/data/postgresql` |

See **TLS_SETUP.md** and **TESTING.md** for detailed troubleshooting.

---

## 📈 Next Steps (Production)

- [ ] Set up automated PostgreSQL backups (GCP Snapshots)
- [ ] Enable Cloud Monitoring and alerting
- [ ] Configure VPC Flow Logs for debugging
- [ ] Scale PostgreSQL to dedicated database instances
- [ ] Add Cloud Load Balancer for multi-region
- [ ] Implement OIDC clients in Keycloak
- [ ] Set up disaster recovery procedures

---

## 🔄 Maintenance

### Regular Tasks

```bash
# Check certificate renewal (Let's Encrypt)
gcloud compute ssh dev-nginx --zone=us-central1-a --tunnel-through-iap \
  -- sudo certbot renew --dry-run

# Monitor PostgreSQL
gcloud compute ssh dev-postgresql --zone=us-central1-a --tunnel-through-iap \
  -- sudo journalctl -u postgresql -f

# Backup PostgreSQL (snapshots)
gcloud compute disks snapshot postgresql-data-disk \
  --snapshot-names postgresql-backup-$(date +%Y-%m-%d)
```

### Scaling

To scale resources, modify `terraform/environments/dev/dev.tfvars`:

```bash
postgresql_machine_type = "e2-standard-4"  # Larger DB VM
keycloak_machine_type   = "e2-medium"      # Larger app VM
```

Then reapply:
```bash
terraform -chdir=terraform apply -var-file=environments/dev/dev.tfvars
```

---

## 📝 License

This Terraform project is provided as-is for educational and operational purposes.

---

## 🤝 Contributing

To improve this project:
1. Test changes in dev environment first
2. Update documentation
3. Format: `terraform fmt -recursive terraform/`
4. Validate: `terraform validate`
5. Commit with clear messages

---

## 📧 Support

For issues or questions:
1. Check **TESTING.md** and **TLS_SETUP.md** for solutions
2. Review **AGENTS.md** for architecture details
3. Check GCP Cloud Logging for service logs
4. Inspect `/var/log/syslog` on VMs for system logs

---

## 🎯 Summary

This project provides a **complete, secure, production-ready Keycloak deployment** on GCP with:
- ✅ Database persistence
- ✅ TLS/HTTPS termination
- ✅ Private network security
- ✅ Auto-scaling infrastructure
- ✅ Comprehensive documentation

**Get started:** Follow the [Quick Start](#-quick-start) section above.
