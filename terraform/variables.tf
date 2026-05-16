variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "environment" {
  description = "Deployment environment (dev, prod)"
  type        = string
}

variable "domain" {
  description = "Domain name for Nginx SSL/vhost config"
  type        = string
}

variable "ssl_cert_email" {
  description = "Email address for Let's Encrypt certificate"
  type        = string
}

variable "keycloak_admin_user" {
  description = "Keycloak admin username"
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "Keycloak admin password — set via TF_VAR_keycloak_admin_password"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key content for VM access (e.g. 'ssh-rsa AAAA...')"
  type        = string
}

variable "ssh_user" {
  description = "SSH username for VM access"
  type        = string
  default     = "gcpuser"
}

variable "nginx_machine_type" {
  description = "Machine type for the Nginx VM"
  type        = string
  default     = "e2-small"
}

variable "keycloak_machine_type" {
  description = "Machine type for the Keycloak VM"
  type        = string
  default     = "e2-medium"
}

variable "vm_image" {
  description = "Boot disk image for both VMs"
  type        = string
  default     = "debian-cloud/debian-12"
}
