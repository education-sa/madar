SET NAMES utf8mb4;

ALTER TABLE student_portfolio_files
  ADD COLUMN review_status ENUM('pending','approved','needs_revision') NOT NULL DEFAULT 'pending' AFTER size_bytes,
  ADD COLUMN teacher_comment VARCHAR(1000) NULL AFTER review_status,
  ADD COLUMN reviewed_by BIGINT UNSIGNED NULL AFTER teacher_comment,
  ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by,
  ADD COLUMN awarded_points SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER reviewed_at,
  ADD COLUMN motivation_point_id BIGINT UNSIGNED NULL AFTER awarded_points,
  ADD INDEX idx_portfolio_status (review_status),
  ADD CONSTRAINT fk_portfolio_reviewer FOREIGN KEY (reviewed_by) REFERENCES teachers(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_portfolio_point FOREIGN KEY (motivation_point_id) REFERENCES motivational_points(id) ON DELETE SET NULL;
