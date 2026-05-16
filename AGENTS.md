# AGENTS.md

## Project Purpose

Terraform project to deploy Keycloak (identity provider) with PostgreSQL (persistent storage) behind Nginx (reverse proxy) on GCP using Compute Engine VMs.

## Repository Layout

```
terraform/
  environments/
    dev/          # dev tfvars + backend config
    prod/         # prod tfvars + backend config
  modules/
    network/      # VPC, subnets, firewall rules
    postgresql/   # PostgreSQL VM, data disk, startup script, service account
    keycloak/     # Keycloak VM, startup script, service account
    nginx/        # Nginx VM, startup script, SSL termination
    lb/           # (optional) GCP Load Balancer / Cloud Armor
  main.tf         # root module wiring
  variables.tf
  outputs.tf
  versions.tf     # required_providers + terraform version pin
```

## Essential Commands

```bash
# Authenticate (run once per session)
gcloud auth application-default login

# Init (required after adding/changing modules or backend)
terraform -chdir=terraform init

# Plan against an environment
terraform -chdir=terraform plan -var-file=environments/dev/dev.tfvars

# Apply
terraform -chdir=terraform apply -var-file=environments/dev/dev.tfvars

# Destroy
terraform -chdir=terraform destroy -var-file=environments/dev/dev.tfvars

# Format check (run before commit)
terraform fmt -recursive terraform/

# Validate
terraform validate
```

## Required Prerequisites

- `gcloud` CLI installed and authenticated (`gcloud auth application-default login`)
- A GCP project with billing enabled; set `project_id` in tfvars
- APIs enabled: `compute.googleapis.com`, `iam.googleapis.com`, `cloudresourcemanager.googleapis.com`
- A GCS bucket for remote state (update `backend.tf` in each environment)
- SSH key pair for VM access; public key goes into `metadata` on VMs

## Key Variables (set in tfvars, never hardcode)

| Variable | Description |
|---|---|
| `project_id` | GCP project ID |
| `region` | GCP region (e.g. `us-central1`) |
| `zone` | GCP zone |
| `keycloak_admin_password` | Sensitive — use `TF_VAR_keycloak_admin_password` env var |
| `postgres_password` | Sensitive — PostgreSQL root password; use `TF_VAR_postgres_password` env var |
| `keycloak_db_password` | Sensitive — PostgreSQL Keycloak user password; use `TF_VAR_keycloak_db_password` env var |
| `domain` | Domain for Nginx SSL/vhost config |
| `ssl_cert_email` | Email for Let's Encrypt (if used) |

Sensitive values must NOT be committed. Use `TF_VAR_*` env vars or a secrets manager reference.

## Architecture Notes

- **Network**: VPC with public subnet (Nginx) and private subnet (Keycloak, PostgreSQL). Cloud NAT enables private VMs to pull Docker/software updates.
- **Nginx** sits in public subnet with external IP; routes HTTP/HTTPS traffic to Keycloak.
- **Keycloak** runs in private subnet (no external IP) via Docker on systemd, configured to use PostgreSQL for persistence (JDBC URL set via env vars).
- **PostgreSQL** runs in private subnet on a dedicated e2-standard-2 VM with 100GB persistent SSD data disk (`/data/postgresql`), initialized with a `keycloak` database and user.
- Firewall rules: only port 443/80 open to `0.0.0.0/0` on Nginx; port 8080 (Keycloak) open only from Nginx tag; port 5432 (PostgreSQL) open only from Keycloak tag.
- SSL termination at Nginx (Let's Encrypt via certbot); Keycloak runs plain HTTP internally.
- PostgreSQL `/var/lib/postgresql/15/main` symlinked to `/data/postgresql/main` to persist data across VM restarts.
- **Startup order**: PostgreSQL must initialize first; Keycloak depends on it and will retry connection until PostgreSQL is ready.

## Workflow Conventions

- Always run `terraform fmt -recursive` and `terraform validate` before committing.
- Modules must be called from `terraform/main.tf`; never apply a module directory directly.
- State is stored remotely in GCS; never commit `.tfstate` files.
- Add new environments by copying an existing `environments/<env>/` directory.
- Tag all resources with `environment` and `project` labels.

## Common Mistakes to Avoid

- Forgetting to enable GCP APIs before `terraform apply` — Terraform will fail with a 403.
- Changing `keycloak_admin_password` after initial deploy without migrating Keycloak DB data.
- Opening port 8080 to `0.0.0.0/0` in firewall rules (Keycloak should be internal only).
- Opening port 5432 to `0.0.0.0/0` in firewall rules (PostgreSQL should be internal only).
- Not running `terraform init` after adding a new module source.
- Not setting `TF_VAR_postgres_password` and `TF_VAR_keycloak_db_password` before `terraform apply`.
- Deleting or losing the PostgreSQL data disk without a backup — use snapshots for disaster recovery.
