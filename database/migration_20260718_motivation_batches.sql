SET NAMES utf8mb4;

ALTER TABLE motivational_points
  ADD COLUMN batch_id CHAR(32) NULL AFTER details,
  ADD INDEX idx_points_teacher_batch (teacher_id, batch_id);
