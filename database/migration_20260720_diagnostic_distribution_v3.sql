-- توزيع منظم وثابت لأسئلة الاختبار التشخيصي حسب المهارات.

CREATE TABLE IF NOT EXISTS student_distribution_ordinals (
  class_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  ordinal_number INT UNSIGNED NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, student_id),
  UNIQUE KEY uq_distribution_class_ordinal (class_id, ordinal_number),
  CONSTRAINT fk_distribution_ordinal_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_distribution_ordinal_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE test_attempts
  ADD COLUMN IF NOT EXISTS distribution_version SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER attempt_no,
  ADD COLUMN IF NOT EXISTS distribution_ordinal INT UNSIGNED NULL AFTER distribution_version;

ALTER TABLE test_attempt_questions
  ADD COLUMN IF NOT EXISTS skill_repeat_number SMALLINT UNSIGNED NULL AFTER skill_name,
  ADD COLUMN IF NOT EXISTS distribution_variant SMALLINT UNSIGNED NULL AFTER skill_repeat_number,
  ADD COLUMN IF NOT EXISTS distribution_variant_count SMALLINT UNSIGNED NULL AFTER distribution_variant;
