module "network" {
  source = "./modules/network"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment
}

module "keycloak" {
  source = "./modules/keycloak"

  project_id              = var.project_id
  zone                    = var.zone
  environment             = var.environment
  subnet_id               = module.network.private_subnet_id
  machine_type            = var.keycloak_machine_type
  vm_image                = var.vm_image
  ssh_user                = var.ssh_user
  ssh_public_key          = var.ssh_public_key
  keycloak_admin_user     = var.keycloak_admin_user
  keycloak_admin_password = var.keycloak_admin_password
  nginx_subnet_cidr       = module.network.public_subnet_cidr
}

module "nginx" {
  source = "./modules/nginx"

  project_id           = var.project_id
  region               = var.region
  zone                 = var.zone
  environment          = var.environment
  subnet_id            = module.network.public_subnet_id
  machine_type         = var.nginx_machine_type
  vm_image             = var.vm_image
  ssh_user             = var.ssh_user
  ssh_public_key       = var.ssh_public_key
  domain               = var.domain
  ssl_cert_email       = var.ssl_cert_email
  keycloak_internal_ip = module.keycloak.internal_ip
}
