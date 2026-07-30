SET NAMES utf8mb4;


CREATE TABLE IF NOT EXISTS game_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  game_key VARCHAR(100) NOT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'easy',
  score INT UNSIGNED NOT NULL DEFAULT 0,
  question_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  correct_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  best_streak SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_game_attempt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_game_attempt_student_date (student_id,played_at),
  INDEX idx_game_attempt_key_date (game_key,played_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS remedial_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NULL,
  source_test_id BIGINT UNSIGNED NULL,
  reassessment_test_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  diagnosis TEXT NULL,
  recommended_activity VARCHAR(1000) NULL,
  recommended_resource_url VARCHAR(2048) NULL,
  before_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  target_percent DECIMAL(5,2) NOT NULL DEFAULT 70,
  after_percent DECIMAL(5,2) NULL,
  due_date DATE NULL,
  status ENUM('planned','in_progress','completed','reassessed','cancelled') NOT NULL DEFAULT 'planned',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_remedial_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_remedial_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_remedial_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  CONSTRAINT fk_remedial_source_test FOREIGN KEY (source_test_id) REFERENCES tests(id) ON DELETE SET NULL,
  CONSTRAINT fk_remedial_reassessment FOREIGN KEY (reassessment_test_id) REFERENCES tests(id) ON DELETE SET NULL,
  INDEX idx_remedial_teacher_status (teacher_id,status,due_date),
  INDEX idx_remedial_student (student_id,created_at),
  INDEX idx_remedial_skill (skill_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_resource_links (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NULL,
  skill_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  resource_type ENUM('game','training','worksheet','video','link') NOT NULL DEFAULT 'link',
  resource_url VARCHAR(2048) NOT NULL,
  description VARCHAR(1000) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_learning_resource_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_resource_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  INDEX idx_learning_resource_skill (skill_id,is_active),
  INDEX idx_learning_resource_teacher (teacher_id,is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calendar_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NULL,
  student_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  description VARCHAR(1000) NULL,
  event_type ENUM('test','homework','task','meeting','announcement','remedial','other') NOT NULL DEFAULT 'other',
  audience ENUM('teacher','class','student','parents','class_and_parents') NOT NULL DEFAULT 'class',
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_calendar_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_calendar_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_calendar_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_calendar_teacher_date (teacher_id,starts_at,status),
  INDEX idx_calendar_class_date (class_id,starts_at,status),
  INDEX idx_calendar_student_date (student_id,starts_at,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parent_private_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  sender_role ENUM('teacher','parent') NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(190) NOT NULL,
  body TEXT NOT NULL,
  teacher_seen_at DATETIME NULL,
  parent_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_parent_message_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_message_parent FOREIGN KEY (parent_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_message_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_parent_message_teacher (teacher_id,teacher_seen_at,created_at),
  INDEX idx_parent_message_parent (parent_id,parent_seen_at,created_at),
  INDEX idx_parent_message_thread (teacher_id,parent_id,student_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requested_role ENUM('STUDENT','PARENT','TEACHER','ADMIN') NOT NULL,
  subject_type ENUM('student','teacher','platform') NULL,
  subject_id BIGINT UNSIGNED NULL,
  first_name VARCHAR(60) NULL,
  last_name VARCHAR(60) NULL,
  identifier_hint VARCHAR(190) NULL,
  student_reference VARCHAR(190) NULL,
  request_note VARCHAR(500) NULL,
  status ENUM('pending','resolved','rejected') NOT NULL DEFAULT 'pending',
  handled_by_role VARCHAR(20) NULL,
  handled_by_id BIGINT UNSIGNED NULL,
  resolution_note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at DATETIME NULL,
  INDEX idx_password_request_status_role (status,requested_role,created_at),
  INDEX idx_password_request_subject (subject_type,subject_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS privacy_consents (
  subject_type ENUM('owner','teacher','student','platform') NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  policy_version VARCHAR(30) NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  PRIMARY KEY (subject_type,subject_id,policy_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_backup_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  backup_type ENUM('manual','daily','academic_year') NOT NULL DEFAULT 'manual',
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256 CHAR(64) NULL,
  status ENUM('created','verified','failed','deleted') NOT NULL DEFAULT 'created',
  created_by_role VARCHAR(20) NULL,
  created_by_id BIGINT UNSIGNED NULL,
  details VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME NULL,
  INDEX idx_backup_status_date (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_error_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  severity ENUM('notice','warning','error','critical') NOT NULL DEFAULT 'error',
  source VARCHAR(120) NOT NULL,
  message VARCHAR(2000) NOT NULL,
  context_json LONGTEXT NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_system_error_status (resolved_at,severity,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity ENUM('info','success','warning','danger') NOT NULL DEFAULT 'info' AFTER body;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS route VARCHAR(190) NULL AFTER severity;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(190) NULL AFTER route;
ALTER TABLE notifications ADD INDEX IF NOT EXISTS idx_notifications_teacher_read (teacher_id,is_read,created_at);
ALTER TABLE notifications ADD UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe (teacher_id,dedupe_key);
