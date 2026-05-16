# AGENTS.md

## Project Purpose

Terraform project to deploy Keycloak (identity provider) behind Nginx (reverse proxy) on GCP using Compute Engine VMs.

## Repository Layout

```
terraform/
  environments/
    dev/          # dev tfvars + backend config
    prod/         # prod tfvars + backend config
  modules/
    network/      # VPC, subnets, firewall rules
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
| `domain` | Domain for Nginx SSL/vhost config |
| `ssl_cert_email` | Email for Let's Encrypt (if used) |

Sensitive values must NOT be committed. Use `TF_VAR_*` env vars or a secrets manager reference.

## Architecture Notes

- Nginx VM sits in a public subnet with an external IP; Keycloak VM is in a private subnet with no external IP.
- Nginx proxies `/` and `/auth` to Keycloak's internal IP on port 8080.
- Firewall rules: only port 443/80 open to `0.0.0.0/0` on Nginx; Keycloak port 8080 open only from Nginx's internal IP range.
- Keycloak runs in standalone mode via Docker on the VM (managed by a systemd unit in the startup script).
- SSL termination happens at Nginx; Keycloak runs plain HTTP internally.

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
- Not running `terraform init` after adding a new module source.
