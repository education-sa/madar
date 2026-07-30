-- تحديث مستودع مدار: أعمدة المرجع والمصدر والتكرار، مع تفريغ آمن مرة واحدة لكل معلمة
SET @db = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='question_bank' AND COLUMN_NAME='skill_repeat_number')=0,
  'ALTER TABLE question_bank ADD COLUMN skill_repeat_number SMALLINT UNSIGNED NULL AFTER bloom_level',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='question_bank' AND COLUMN_NAME='reference_page')=0,
  'ALTER TABLE question_bank ADD COLUMN reference_page VARCHAR(80) NULL AFTER explanation',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='question_bank' AND COLUMN_NAME='content_source')=0,
  'ALTER TABLE question_bank ADD COLUMN content_source VARCHAR(80) NULL AFTER reference_page',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS question_bank_repository_resets (
  teacher_id BIGINT UNSIGNED NOT NULL,
  reset_key VARCHAR(80) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id,reset_key),
  CONSTRAINT fk_question_bank_reset_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
