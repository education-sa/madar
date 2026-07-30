SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS site_school_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  school_name VARCHAR(190) NOT NULL DEFAULT '',
  education_department VARCHAR(190) NOT NULL DEFAULT '',
  education_office VARCHAR(190) NOT NULL DEFAULT '',
  school_leader_name VARCHAR(190) NOT NULL DEFAULT '',
  teacher_name VARCHAR(190) NOT NULL DEFAULT '',
  subject_name VARCHAR(190) NOT NULL DEFAULT 'الرياضيات',
  stage_label VARCHAR(80) NOT NULL DEFAULT '',
  grade_label VARCHAR(80) NOT NULL DEFAULT '',
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  current_semester ENUM('first','second') NOT NULL DEFAULT 'first',
  period_start_date DATE NULL,
  period_end_date DATE NULL,
  additional_logo_original_name VARCHAR(255) NULL,
  additional_logo_stored_name VARCHAR(100) NULL,
  additional_logo_mime_type VARCHAR(100) NULL,
  additional_logo_size_bytes BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO site_school_settings (id,subject_name) VALUES (1,'الرياضيات');

CREATE TABLE IF NOT EXISTS academic_year_periods (
  academic_year VARCHAR(30) NOT NULL PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  semester ENUM('first','second') NOT NULL DEFAULT 'first',
  created_by_owner BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_academic_period_owner FOREIGN KEY (created_by_owner) REFERENCES owners(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_year_reset_operations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  target_academic_year VARCHAR(30) NOT NULL,
  new_academic_year VARCHAR(30) NOT NULL,
  status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  counts_json JSON NULL,
  error_message VARCHAR(1000) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_year_reset_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE RESTRICT,
  INDEX idx_year_reset_status_date (status,started_at),
  INDEX idx_year_reset_target (target_academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- بقية الأعمدة تُضاف تلقائيًا بأمان عبر ensure_academic_year_management_schema()
-- لتفادي فشل التحديث عند وجود عمود مسبقًا في بعض نسخ الموقع.
