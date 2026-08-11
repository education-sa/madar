-- اختبارات ورقية: تسجيل مجمع بواسطة المعلمة أو تسجيل فردي بواسطة الطالبات.
-- آمن للتشغيل مرة واحدة ولا يحذف أو يعدل أي بيانات حالية.

CREATE TABLE IF NOT EXISTS teacher_paper_assessments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL,
  semester ENUM('first','second') NOT NULL,
  title VARCHAR(190) NOT NULL,
  test_type VARCHAR(40) NOT NULL DEFAULT 'periodic_1',
  assessment_date DATE NOT NULL,
  collection_mode ENUM('teacher_aggregate','student_entry') NOT NULL,
  workflow_status ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',
  mastery_threshold TINYINT UNSIGNED NOT NULL DEFAULT 80,
  subject_name VARCHAR(190) NULL,
  unit_name VARCHAR(190) NULL,
  lesson_name VARCHAR(190) NULL,
  instructions VARCHAR(2000) NULL,
  opens_at DATETIME NULL,
  closes_at DATETIME NULL,
  require_approval TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  CONSTRAINT fk_paper_assessment_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_paper_assessment_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  INDEX idx_paper_assessment_scope (teacher_id,class_id,academic_year,semester,deleted_at),
  INDEX idx_paper_assessment_student_window (class_id,collection_mode,workflow_status,opens_at,closes_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_paper_assessment_skill_summaries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NULL,
  skill_name_snapshot VARCHAR(180) NOT NULL,
  participant_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  mastered_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_paper_summary_assessment FOREIGN KEY (assessment_id) REFERENCES teacher_paper_assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_paper_summary_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  UNIQUE KEY uq_paper_summary_skill (assessment_id,skill_id),
  INDEX idx_paper_summary_order (assessment_id,sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_paper_assessment_questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NULL,
  skill_name_snapshot VARCHAR(180) NOT NULL,
  question_number VARCHAR(40) NOT NULL,
  question_text VARCHAR(500) NULL,
  max_points DECIMAL(8,2) UNSIGNED NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_paper_question_assessment FOREIGN KEY (assessment_id) REFERENCES teacher_paper_assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_paper_question_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  UNIQUE KEY uq_paper_question_number (assessment_id,question_number),
  INDEX idx_paper_question_order (assessment_id,sort_order),
  INDEX idx_paper_question_skill (skill_id,assessment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_paper_assessment_submissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NULL,
  student_name_snapshot VARCHAR(140) NOT NULL,
  status ENUM('draft','submitted','approved','returned') NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  return_note VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_paper_submission_assessment FOREIGN KEY (assessment_id) REFERENCES teacher_paper_assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_paper_submission_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  UNIQUE KEY uq_paper_submission_student (assessment_id,student_id),
  INDEX idx_paper_submission_status (assessment_id,status,submitted_at),
  INDEX idx_paper_submission_student (student_id,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_paper_assessment_answers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NOT NULL,
  earned_points DECIMAL(8,2) UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_paper_answer_submission FOREIGN KEY (submission_id) REFERENCES teacher_paper_assessment_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_paper_answer_question FOREIGN KEY (question_id) REFERENCES teacher_paper_assessment_questions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_paper_answer_question (submission_id,question_id),
  INDEX idx_paper_answer_question (question_id,submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_paper_assessment_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(80) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  CONSTRAINT fk_paper_file_submission FOREIGN KEY (submission_id) REFERENCES teacher_paper_assessment_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_paper_file_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  UNIQUE KEY uq_paper_file_stored (stored_name),
  INDEX idx_paper_file_submission (submission_id,deleted_at,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
