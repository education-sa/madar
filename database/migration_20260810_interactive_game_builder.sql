SET NAMES utf8mb4;

-- ترحيل أحادي التشغيل لنظام إنشاء واستيراد الألعاب التفاعلية.
-- لا يحذف أو يعيد كتابة أي لعبة أو محاولة موجودة.

ALTER TABLE teacher_interactive_games
  MODIFY COLUMN lesson_name VARCHAR(190) NULL DEFAULT NULL,
  MODIFY COLUMN unit_number SMALLINT UNSIGNED NULL DEFAULT NULL,
  MODIFY COLUMN lesson_number SMALLINT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN name VARCHAR(190) NULL AFTER game_key,
  ADD COLUMN description TEXT NULL AFTER name,
  ADD COLUMN subject_name VARCHAR(190) NULL AFTER description,
  ADD COLUMN cover_original_name VARCHAR(255) NULL AFTER subject_name,
  ADD COLUMN cover_stored_name VARCHAR(100) NULL AFTER cover_original_name,
  ADD COLUMN cover_mime_type VARCHAR(100) NULL AFTER cover_stored_name,
  ADD COLUMN cover_size_bytes BIGINT UNSIGNED NULL AFTER cover_mime_type,
  ADD COLUMN source_type ENUM('template','package') NULL AFTER cover_size_bytes,
  ADD COLUMN template_type ENUM('multiple_choice','true_false','matching','ordering') NULL AFTER source_type,
  ADD COLUMN lifecycle_status ENUM('draft','published','disabled') NULL AFTER template_type,
  ADD COLUMN current_version_id BIGINT UNSIGNED NULL AFTER lifecycle_status,
  ADD COLUMN question_count SMALLINT UNSIGNED NULL AFTER current_version_id,
  ADD COLUMN allowed_difficulties_json JSON NULL AFTER question_count,
  ADD COLUMN points_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER certificate_portfolio_enabled,
  ADD COLUMN points_value SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER points_enabled,
  ADD COLUMN deleted_at DATETIME NULL AFTER is_active,
  ADD INDEX idx_teacher_interactive_games_lifecycle (teacher_id,lifecycle_status,deleted_at);

CREATE TABLE IF NOT EXISTS interactive_game_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  game_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  source_type ENUM('template','package') NOT NULL,
  template_type ENUM('multiple_choice','true_false','matching','ordering') NULL,
  manifest_json JSON NULL,
  settings_json JSON NULL,
  entry_file VARCHAR(255) NULL,
  runtime_key VARCHAR(80) NULL,
  storage_key VARCHAR(100) NULL,
  original_zip_name VARCHAR(255) NULL,
  package_size_bytes BIGINT UNSIGNED NULL,
  content_sha256 CHAR(64) NULL,
  validation_status ENUM('ready','needs_setup','rejected') NOT NULL DEFAULT 'ready',
  validation_message VARCHAR(1000) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_interactive_game_version (game_id,version_number),
  INDEX idx_interactive_game_version_status (game_id,validation_status,created_at),
  CONSTRAINT fk_interactive_game_version_game FOREIGN KEY (game_id) REFERENCES teacher_interactive_games(id),
  CONSTRAINT fk_interactive_game_version_teacher FOREIGN KEY (created_by) REFERENCES teachers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE teacher_interactive_games
  ADD CONSTRAINT fk_teacher_interactive_games_current_version
    FOREIGN KEY (current_version_id) REFERENCES interactive_game_versions(id);

CREATE TABLE IF NOT EXISTS interactive_game_questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version_id BIGINT UNSIGNED NOT NULL,
  question_key VARCHAR(120) NOT NULL,
  question_type ENUM('multiple_choice','true_false','matching','ordering') NOT NULL,
  prompt TEXT NOT NULL,
  options_json JSON NULL,
  correct_answer_json JSON NOT NULL,
  explanation TEXT NULL,
  points SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'medium',
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_interactive_game_question_key (version_id,question_key),
  UNIQUE INDEX uq_interactive_game_question_order (version_id,sort_order),
  INDEX idx_interactive_game_question_difficulty (version_id,difficulty),
  CONSTRAINT fk_interactive_game_question_version FOREIGN KEY (version_id) REFERENCES interactive_game_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interactive_game_question_skills (
  question_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (question_id,skill_id),
  INDEX idx_interactive_game_question_skill (skill_id,question_id),
  CONSTRAINT fk_interactive_game_question_skill_question FOREIGN KEY (question_id) REFERENCES interactive_game_questions(id),
  CONSTRAINT fk_interactive_game_question_skill_skill FOREIGN KEY (skill_id) REFERENCES skills(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interactive_game_version_skills (
  version_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (version_id,skill_id),
  INDEX idx_interactive_game_version_skill (skill_id,version_id),
  CONSTRAINT fk_interactive_game_version_skill_version FOREIGN KEY (version_id) REFERENCES interactive_game_versions(id),
  CONSTRAINT fk_interactive_game_version_skill_skill FOREIGN KEY (skill_id) REFERENCES skills(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interactive_game_publications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  game_id BIGINT UNSIGNED NOT NULL,
  version_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL,
  semester ENUM('first','second') NOT NULL,
  status ENUM('published','disabled') NOT NULL DEFAULT 'published',
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_interactive_game_publication (game_id,version_id,class_id,academic_year,semester),
  INDEX idx_interactive_game_publication_student (class_id,semester,status),
  INDEX idx_interactive_game_publication_game (game_id,status),
  CONSTRAINT fk_interactive_game_publication_game FOREIGN KEY (game_id) REFERENCES teacher_interactive_games(id),
  CONSTRAINT fk_interactive_game_publication_version FOREIGN KEY (version_id) REFERENCES interactive_game_versions(id),
  CONSTRAINT fk_interactive_game_publication_class FOREIGN KEY (class_id) REFERENCES classes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE game_attempts
  ADD COLUMN game_id BIGINT UNSIGNED NULL AFTER game_key,
  ADD COLUMN game_version_id BIGINT UNSIGNED NULL AFTER game_id,
  ADD COLUMN publication_id BIGINT UNSIGNED NULL AFTER game_version_id,
  ADD COLUMN result_source ENUM('server_verified','package_reported') NULL AFTER publication_id,
  ADD COLUMN max_score DECIMAL(8,2) NULL AFTER score,
  ADD COLUMN motivation_point_id BIGINT UNSIGNED NULL AFTER game_snapshot_json,
  ADD COLUMN run_token_hash CHAR(64) NULL AFTER motivation_point_id,
  ADD COLUMN run_status ENUM('in_progress','completed','abandoned') NULL AFTER run_token_hash,
  ADD COLUMN run_state_json JSON NULL AFTER run_status,
  ADD COLUMN started_at DATETIME NULL AFTER run_state_json,
  ADD COLUMN expires_at DATETIME NULL AFTER started_at,
  ADD UNIQUE INDEX uq_game_attempt_run_token (run_token_hash),
  ADD UNIQUE INDEX uq_game_attempt_motivation_point (motivation_point_id),
  ADD INDEX idx_game_attempt_game_version (game_id,game_version_id,played_at),
  ADD INDEX idx_game_attempt_publication (publication_id,played_at),
  ADD CONSTRAINT fk_game_attempt_game FOREIGN KEY (game_id) REFERENCES teacher_interactive_games(id),
  ADD CONSTRAINT fk_game_attempt_version FOREIGN KEY (game_version_id) REFERENCES interactive_game_versions(id),
  ADD CONSTRAINT fk_game_attempt_publication FOREIGN KEY (publication_id) REFERENCES interactive_game_publications(id),
  ADD CONSTRAINT fk_game_attempt_motivation_point FOREIGN KEY (motivation_point_id) REFERENCES motivational_points(id);

CREATE TABLE IF NOT EXISTS interactive_game_attempt_answers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NULL,
  question_key VARCHAR(120) NOT NULL,
  answer_json JSON NULL,
  is_correct TINYINT(1) NULL,
  points_earned DECIMAL(8,2) NOT NULL DEFAULT 0,
  duration_ms INT UNSIGNED NULL,
  skill_id BIGINT UNSIGNED NULL,
  verification_source ENUM('server_verified','package_reported') NOT NULL,
  answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_interactive_game_attempt_answer (attempt_id,question_key),
  INDEX idx_interactive_game_attempt_answer_skill (skill_id,attempt_id),
  CONSTRAINT fk_interactive_game_attempt_answer_attempt FOREIGN KEY (attempt_id) REFERENCES game_attempts(id),
  CONSTRAINT fk_interactive_game_attempt_answer_question FOREIGN KEY (question_id) REFERENCES interactive_game_questions(id),
  CONSTRAINT fk_interactive_game_attempt_answer_skill FOREIGN KEY (skill_id) REFERENCES skills(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interactive_game_attempt_skills (
  attempt_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  question_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  correct_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  points_earned DECIMAL(8,2) NOT NULL DEFAULT 0,
  max_points DECIMAL(8,2) NOT NULL DEFAULT 0,
  verification_source ENUM('server_verified','package_reported') NOT NULL,
  PRIMARY KEY (attempt_id,skill_id),
  INDEX idx_interactive_game_attempt_skill (skill_id,attempt_id),
  CONSTRAINT fk_interactive_game_attempt_skill_attempt FOREIGN KEY (attempt_id) REFERENCES game_attempts(id),
  CONSTRAINT fk_interactive_game_attempt_skill_skill FOREIGN KEY (skill_id) REFERENCES skills(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
