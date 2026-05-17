resource "google_service_account" "postgresql" {
  account_id   = "${var.environment}-postgresql-sa"
  display_name = "PostgreSQL VM Service Account (${var.environment})"
  project      = var.project_id
}

resource "google_project_iam_member" "postgresql_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.postgresql.email}"
}

resource "google_project_iam_member" "postgresql_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.postgresql.email}"
}

resource "google_compute_instance" "postgresql" {
  name         = "${var.environment}-postgresql"
  machine_type = var.machine_type
  zone         = var.zone
  project      = var.project_id

  tags = ["postgresql"]

  labels = {
    environment = var.environment
    project     = "keycloak-nginx"
    role        = "postgresql"
  }

  boot_disk {
    initialize_params {
      image = var.vm_image
      size  = 50  # Larger disk for database
      type  = "pd-ssd"
    }
  }

  network_interface {
    subnetwork = var.subnet_id
    # No access_config block = no external IP (private subnet)
  }

  metadata = {
    ssh-keys               = "${var.ssh_user}:${var.ssh_public_key}"
    startup-script         = local.startup_script
    block-project-ssh-keys = "true"
  }

  service_account {
    email  = google_service_account.postgresql.email
    scopes = ["cloud-platform"]
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
}

# Persistent data disk for PostgreSQL data directory
resource "google_compute_disk" "postgresql_data" {
  name   = "${var.environment}-postgresql-data-disk"
  type   = "pd-ssd"
  zone   = var.zone
  size   = 100
  project = var.project_id

  labels = {
    environment = var.environment
    project     = "keycloak-nginx"
    role        = "postgresql-data"
  }
}

resource "google_compute_attached_disk" "postgresql_data" {
  instance    = google_compute_instance.postgresql.id
  disk        = google_compute_disk.postgresql_data.id
  device_name = "postgresql-data"
}

locals {
  startup_script = <<-SCRIPT
    #!/bin/bash
    set -euo pipefail

    # Install PostgreSQL
    apt-get update -y
    apt-get install -y postgresql postgresql-contrib

    # Format and mount the persistent data disk
    if ! lsblk | grep -q sdb; then
      echo "Data disk not yet attached; will retry on next startup"
      exit 0
    fi

    # Create partition if needed (idempotent)
    if ! lsblk -o NAME,TYPE | grep -q "sdb.*part"; then
      parted -s /dev/sdb mklabel gpt mkpart primary ext4 0% 100%
      mkfs.ext4 -F /dev/sdb1
    fi

    # Mount the data disk
    mkdir -p /data/postgresql
    if ! mount | grep -q /data/postgresql; then
      mount /dev/sdb1 /data/postgresql
    fi

    # Persist mount in fstab
    if ! grep -q /data/postgresql /etc/fstab; then
      echo "/dev/sdb1 /data/postgresql ext4 defaults,nofail 0 2" >> /etc/fstab
    fi

    # Set permissions
    chown -R postgres:postgres /data/postgresql
    chmod 700 /data/postgresql

    # Stop PostgreSQL before reconfiguring
    systemctl stop postgresql || true

    # Initialize new data directory only if not already done
    if [ ! -f /data/postgresql/main/PG_VERSION ]; then
      rm -rf /data/postgresql/main
      sudo -u postgres /usr/lib/postgresql/15/bin/initdb -D /data/postgresql/main
    fi

    # Point postgresql.conf to new data directory
    sed -i "s|data_directory = '.*'|data_directory = '/data/postgresql/main'|" /etc/postgresql/15/main/postgresql.conf

    # Fix listen_addresses — replace default localhost with 0.0.0.0
    sed -i "s|#listen_addresses = 'localhost'|listen_addresses = '0.0.0.0'|" /etc/postgresql/15/main/postgresql.conf
    # In case it was already uncommented
    sed -i "s|^listen_addresses = 'localhost'|listen_addresses = '0.0.0.0'|" /etc/postgresql/15/main/postgresql.conf

    # Tune PostgreSQL
    cat >> /etc/postgresql/15/main/postgresql.conf <<EOF

# Keycloak tuning
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
EOF

    # Allow Keycloak VM connections in pg_hba.conf (idempotent)
    if ! grep -q "${var.keycloak_vm_cidr}" /etc/postgresql/15/main/pg_hba.conf; then
      cat >> /etc/postgresql/15/main/pg_hba.conf <<EOF
# Allow connections from Keycloak VM
host    ${var.keycloak_database}    ${var.keycloak_db_user}    ${var.keycloak_vm_cidr}    md5
EOF
    fi

    # Start PostgreSQL with new config
    systemctl start postgresql
    sleep 3

    # Set postgres superuser password
    sudo -u postgres psql -c "ALTER USER postgres PASSWORD '${var.postgres_password}';"

    # Create Keycloak database and user (idempotent)
    sudo -u postgres psql <<EOF
SELECT 'CREATE DATABASE ${var.keycloak_database}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${var.keycloak_database}')\gexec
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${var.keycloak_db_user}') THEN
    CREATE USER ${var.keycloak_db_user} WITH PASSWORD '${var.keycloak_db_password}';
  END IF;
END
\$\$;
ALTER ROLE ${var.keycloak_db_user} SET client_min_messages TO warning;
GRANT ALL PRIVILEGES ON DATABASE ${var.keycloak_database} TO ${var.keycloak_db_user};
\c ${var.keycloak_database}
GRANT ALL ON SCHEMA public TO ${var.keycloak_db_user};
EOF

    systemctl enable postgresql
    systemctl restart postgresql

    echo "PostgreSQL setup complete"
  SCRIPT
}
