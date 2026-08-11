-- نظام تحليل المهارات والمرفقات للمعلمة.
-- هذا الملف آمن للإضافة فقط ولا يحتوي أوامر حذف بيانات أو جداول.

CREATE TABLE IF NOT EXISTS teacher_analysis_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NULL,
  test_id BIGINT UNSIGNED NULL,
  skill_id BIGINT UNSIGNED NULL,
  academic_year VARCHAR(30) NOT NULL,
  semester ENUM('first','second') NOT NULL,
  test_type ENUM('pre_diagnostic','post_diagnostic','quiz') NULL,
  subject_name VARCHAR(190) NULL,
  unit_name VARCHAR(190) NULL,
  lesson_name VARCHAR(190) NULL,
  note VARCHAR(1000) NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(80) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  CONSTRAINT fk_teacher_analysis_attachment_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  CONSTRAINT fk_teacher_analysis_attachment_class FOREIGN KEY (class_id) REFERENCES classes(id),
  CONSTRAINT fk_teacher_analysis_attachment_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_teacher_analysis_attachment_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE SET NULL,
  CONSTRAINT fk_teacher_analysis_attachment_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  UNIQUE KEY uq_teacher_analysis_attachment_stored (stored_name),
  INDEX idx_teacher_analysis_attachment_scope (teacher_id,class_id,academic_year,semester,deleted_at),
  INDEX idx_teacher_analysis_attachment_student (student_id,created_at),
  INDEX idx_teacher_analysis_attachment_test (test_id,created_at),
  INDEX idx_teacher_analysis_attachment_skill (skill_id,created_at),
  INDEX idx_teacher_analysis_attachment_context (teacher_id,subject_name,unit_name,lesson_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_skill_assessments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL,
  semester ENUM('first','second') NOT NULL,
  title VARCHAR(190) NOT NULL,
  assessment_date DATE NOT NULL,
  input_mode ENUM('quick','detailed') NOT NULL DEFAULT 'quick',
  mastery_threshold TINYINT UNSIGNED NOT NULL DEFAULT 80,
  roster_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  subject_name VARCHAR(190) NULL,
  unit_name VARCHAR(190) NULL,
  lesson_name VARCHAR(190) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  CONSTRAINT fk_teacher_skill_assessment_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_skill_assessment_class FOREIGN KEY (class_id) REFERENCES classes(id),
  INDEX idx_teacher_skill_assessment_scope (teacher_id,class_id,academic_year,semester,deleted_at),
  INDEX idx_teacher_skill_assessment_date (teacher_id,assessment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_skill_assessment_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NULL,
  skill_name_snapshot VARCHAR(180) NOT NULL,
  question_count SMALLINT UNSIGNED NOT NULL,
  mastered_count SMALLINT UNSIGNED NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_teacher_skill_item_assessment FOREIGN KEY (assessment_id) REFERENCES teacher_skill_assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_skill_item_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  UNIQUE KEY uq_teacher_skill_item (assessment_id,skill_id),
  INDEX idx_teacher_skill_item_assessment (assessment_id,sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_skill_assessment_scores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NULL,
  student_name_snapshot VARCHAR(140) NOT NULL,
  correct_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_teacher_skill_score_item FOREIGN KEY (item_id) REFERENCES teacher_skill_assessment_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_skill_score_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  UNIQUE KEY uq_teacher_skill_score (item_id,student_id),
  INDEX idx_teacher_skill_score_student (student_id,item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
