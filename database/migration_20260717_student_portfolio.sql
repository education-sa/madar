SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS student_portfolio_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  category ENUM('homework','worksheet','task','project','achievement_image','other') NOT NULL,
  title VARCHAR(190) NOT NULL,
  note VARCHAR(1000) NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(80) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  review_status ENUM('pending','approved','needs_revision') NOT NULL DEFAULT 'pending',
  teacher_comment VARCHAR(1000) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  awarded_points SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  motivation_point_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_portfolio_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_portfolio_reviewer FOREIGN KEY (reviewed_by) REFERENCES teachers(id) ON DELETE SET NULL,
  CONSTRAINT fk_portfolio_point FOREIGN KEY (motivation_point_id) REFERENCES motivational_points(id) ON DELETE SET NULL,
  INDEX idx_portfolio_student_date (student_id, created_at),
  INDEX idx_portfolio_status (review_status),
  INDEX idx_portfolio_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
