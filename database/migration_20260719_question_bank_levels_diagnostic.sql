-- تحديث آمن ومتكرر لبنك الأسئلة والتشخيصي حسب المهارات - 2026-07-19
-- المشروع يطبق هذه الحقول تلقائيًا، وهذا الملف متاح للتحديث اليدوي عند الحاجة.

SET @db := DATABASE();

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='question_bank' AND COLUMN_NAME='question_level')=0,
  "ALTER TABLE question_bank ADD COLUMN question_level ENUM('unclassified','applied','logical','analytical') NOT NULL DEFAULT 'unclassified' AFTER difficulty",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='question_bank' AND COLUMN_NAME='cognitive_type')=0,
  'ALTER TABLE question_bank ADD COLUMN cognitive_type VARCHAR(80) NULL AFTER question_level',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='question_bank' AND COLUMN_NAME='bloom_level')=0,
  'ALTER TABLE question_bank ADD COLUMN bloom_level VARCHAR(50) NULL AFTER cognitive_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='tests' AND COLUMN_NAME='bank_term_label')=0,
  'ALTER TABLE tests ADD COLUMN bank_term_label VARCHAR(80) NULL AFTER bank_grade_label',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='tests' AND COLUMN_NAME='bank_skill_ids_json')=0,
  'ALTER TABLE tests ADD COLUMN bank_skill_ids_json JSON NULL AFTER bank_import_batch',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
