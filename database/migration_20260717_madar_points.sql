SET NAMES utf8mb4;

ALTER TABLE motivational_points
  ADD COLUMN reason_type ENUM('homework','participation','attendance','task','other') NOT NULL DEFAULT 'other' AFTER points,
  ADD COLUMN details VARCHAR(500) NULL AFTER reason;
