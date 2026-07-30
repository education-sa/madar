SET NAMES utf8mb4;
SET time_zone = '+03:00';

CREATE TABLE IF NOT EXISTS rbac_roles (
  code VARCHAR(20) PRIMARY KEY,
  name_ar VARCHAR(80) NOT NULL,
  hierarchy_rank SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rbac_permissions (
  code VARCHAR(100) PRIMARY KEY,
  name_ar VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role_code VARCHAR(20) NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_code, permission_code),
  CONSTRAINT fk_rbac_role_permission_role FOREIGN KEY (role_code) REFERENCES rbac_roles(code) ON DELETE CASCADE,
  CONSTRAINT fk_rbac_role_permission_permission FOREIGN KEY (permission_code) REFERENCES rbac_permissions(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_role_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_type ENUM('owner','teacher','student','platform') NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  role_code VARCHAR(20) NOT NULL,
  assigned_by_owner BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_role_subject (subject_type, subject_id),
  INDEX idx_user_role_code (role_code),
  CONSTRAINT fk_user_role_assignment_role FOREIGN KEY (role_code) REFERENCES rbac_roles(code) ON DELETE RESTRICT,
  CONSTRAINT fk_user_role_assignment_owner FOREIGN KEY (assigned_by_owner) REFERENCES owners(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_code ENUM('ADMIN','PARENT') NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_platform_users_role_status (role_code,status),
  INDEX idx_platform_users_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS owner_security (
  owner_id BIGINT UNSIGNED PRIMARY KEY,
  two_factor_secret VARCHAR(128) NULL,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_confirmed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_owner_security_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  identity_hash CHAR(64) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_attempt_window (identity_hash, ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_preview_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  preview_role VARCHAR(20) NOT NULL,
  preview_subject_type VARCHAR(20) NULL,
  preview_subject_id BIGINT UNSIGNED NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  CONSTRAINT fk_role_preview_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  INDEX idx_role_preview_owner_active (owner_id,ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO rbac_roles (code,name_ar,hierarchy_rank,is_system) VALUES
('OWNER','مالك الموقع',1000,1),
('ADMIN','إداري',700,1),
('TEACHER','معلم',500,1),
('PARENT','ولي أمر',300,1),
('STUDENT','طالب',100,1)
ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar),hierarchy_rank=VALUES(hierarchy_rank),is_system=VALUES(is_system);
