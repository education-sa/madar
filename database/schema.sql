SET NAMES utf8mb4;
SET time_zone = '+03:00';

CREATE TABLE IF NOT EXISTS owners (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teachers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('pending','active','disabled') NOT NULL DEFAULT 'pending',
  deleted_at DATETIME NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_teacher_approver FOREIGN KEY (approved_by) REFERENCES owners(id) ON DELETE SET NULL,
  INDEX idx_teachers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  stage ENUM('ابتدائي','متوسط','ثانوي') NOT NULL,
  grade_label VARCHAR(80) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_classes_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  UNIQUE KEY uq_teacher_class (teacher_id, name, academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id BIGINT UNSIGNED NULL,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  stage ENUM('ابتدائي','متوسط','ثانوي') NOT NULL,
  grade_label VARCHAR(80) NULL,
  learning_style ENUM('visual','auditory','reading_writing','kinesthetic','mixed','unknown') NOT NULL DEFAULT 'unknown',
  progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  deleted_at DATETIME NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  last_active DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  INDEX idx_students_class (class_id),
  INDEX idx_students_learning_style (learning_style)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_registration_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id BIGINT UNSIGNED NOT NULL,
  existing_student_id BIGINT UNSIGNED NULL,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_request_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_request_existing FOREIGN KEY (existing_student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES teachers(id) ON DELETE SET NULL,
  INDEX idx_student_request_email (email),
  INDEX idx_student_request_status (status),
  INDEX idx_student_request_class_status (class_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skills (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stage ENUM('ابتدائي','متوسط','ثانوي') NOT NULL,
  grade_label VARCHAR(80) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_skills_grade (stage, grade_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_bank (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  external_question_id VARCHAR(80) NULL,
  source_question_id VARCHAR(120) NULL,
  subject_id VARCHAR(120) NULL,
  subject_name VARCHAR(180) NULL,
  skill_id BIGINT UNSIGNED NULL,
  lesson_code VARCHAR(50) NULL,
  external_skill_id VARCHAR(120) NULL,
  import_batch VARCHAR(80) NULL,
  stage ENUM('ابتدائي','متوسط','ثانوي') NOT NULL,
  grade_label VARCHAR(80) NOT NULL,
  class_label VARCHAR(30) NULL,
  term_label VARCHAR(80) NULL,
  topic VARCHAR(180) NOT NULL,
  chapter_name VARCHAR(180) NULL,
  unit_id VARCHAR(120) NULL,
  unit_name VARCHAR(180) NULL,
  lesson_id VARCHAR(120) NULL,
  lesson_name VARCHAR(180) NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'medium',
  question_level ENUM('unclassified','applied','logical','analytical') NOT NULL DEFAULT 'unclassified',
  cognitive_type VARCHAR(80) NULL,
  question_category VARCHAR(120) NULL,
  bloom_level VARCHAR(50) NULL,
  skill_repeat_number SMALLINT UNSIGNED NULL,
  questions_to_display SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  question_order INT UNSIGNED NULL,
  question_type ENUM('mcq','true_false','short_answer') NOT NULL,
  question_text TEXT NOT NULL,
  options_json JSON NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NULL,
  reference_page VARCHAR(80) NULL,
  content_source VARCHAR(80) NULL,
  question_source VARCHAR(180) NULL,
  source_reference VARCHAR(500) NULL,
  status VARCHAR(80) NULL,
  points DECIMAL(6,2) NOT NULL DEFAULT 1,
  source ENUM('manual','ai','imported') NOT NULL DEFAULT 'manual',
  review_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bank_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_bank_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  UNIQUE KEY uq_bank_external (teacher_id,external_question_id),
  INDEX idx_bank_filters (teacher_id, stage, grade_label, class_label, term_label, difficulty, question_type),
  INDEX idx_bank_lesson_review (teacher_id,import_batch,lesson_code,review_status,is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_bank_repository_resets (
  teacher_id BIGINT UNSIGNED NOT NULL,
  reset_key VARCHAR(80) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, reset_key),
  CONSTRAINT fk_question_bank_reset_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS tests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NULL,
  skill_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  test_type ENUM('pre_diagnostic','post_diagnostic','quiz') NOT NULL,
  question_source ENUM('static','lesson_bank') NOT NULL DEFAULT 'static',
  bank_stage ENUM('ابتدائي','متوسط','ثانوي') NULL,
  bank_grade_label VARCHAR(80) NULL,
  bank_term_label VARCHAR(80) NULL,
  bank_import_batch VARCHAR(80) NULL,
  bank_skill_ids_json JSON NULL,
  expected_lesson_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft','published','closed') NOT NULL DEFAULT 'draft',
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 1,
  shuffle_questions TINYINT(1) NOT NULL DEFAULT 1,
  show_result TINYINT(1) NOT NULL DEFAULT 1,
  total_points DECIMAL(7,2) NOT NULL DEFAULT 0,
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  semester ENUM('first','second') NOT NULL DEFAULT 'first',
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tests_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_tests_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_tests_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  INDEX idx_tests_teacher_status (teacher_id, status),
  INDEX idx_tests_class (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT UNSIGNED NOT NULL,
  bank_question_id BIGINT UNSIGNED NULL,
  skill_id BIGINT UNSIGNED NULL,
  question_type ENUM('mcq','true_false','short_answer') NOT NULL,
  question_text TEXT NOT NULL,
  options_json JSON NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NULL,
  reference_page VARCHAR(80) NULL,
  content_source VARCHAR(80) NULL,
  points DECIMAL(6,2) NOT NULL DEFAULT 1,
  order_index SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_tq_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_tq_bank FOREIGN KEY (bank_question_id) REFERENCES question_bank(id) ON DELETE SET NULL,
  CONSTRAINT fk_tq_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  INDEX idx_tq_test_order (test_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  attempt_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
  distribution_version SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  distribution_ordinal INT UNSIGNED NULL,
  status ENUM('in_progress','submitted','graded') NOT NULL DEFAULT 'in_progress',
  score DECIMAL(7,2) NOT NULL DEFAULT 0,
  total_points DECIMAL(7,2) NOT NULL DEFAULT 0,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME NULL,
  graded_at DATETIME NULL,
  UNIQUE KEY uq_test_student_attempt (test_id, student_id, attempt_no),
  CONSTRAINT fk_attempt_test FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_attempt_student (student_id, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_attempt_questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT UNSIGNED NOT NULL,
  bank_question_id BIGINT UNSIGNED NULL,
  source_question_id BIGINT UNSIGNED NULL,
  skill_id BIGINT UNSIGNED NULL,
  lesson_code VARCHAR(50) NULL,
  skill_name VARCHAR(180) NULL,
  skill_repeat_number SMALLINT UNSIGNED NULL,
  distribution_variant SMALLINT UNSIGNED NULL,
  distribution_variant_count SMALLINT UNSIGNED NULL,
  question_type ENUM('mcq','true_false','short_answer') NOT NULL,
  question_text TEXT NOT NULL,
  options_json JSON NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NULL,
  reference_page VARCHAR(80) NULL,
  content_source VARCHAR(80) NULL,
  points DECIMAL(6,2) NOT NULL DEFAULT 1,
  order_index SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt_question_order (attempt_id,order_index),
  CONSTRAINT fk_attempt_question_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_question_bank FOREIGN KEY (bank_question_id) REFERENCES question_bank(id) ON DELETE SET NULL,
  CONSTRAINT fk_attempt_question_source FOREIGN KEY (source_question_id) REFERENCES test_questions(id) ON DELETE SET NULL,
  CONSTRAINT fk_attempt_question_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
  INDEX idx_attempt_question_attempt (attempt_id),
  INDEX idx_attempt_question_skill (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS answers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT UNSIGNED NOT NULL,
  question_id BIGINT UNSIGNED NULL,
  attempt_question_id BIGINT UNSIGNED NULL,
  answer_text TEXT NULL,
  is_correct TINYINT(1) NULL,
  review_required TINYINT(1) NOT NULL DEFAULT 0,
  points_earned DECIMAL(6,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attempt_question (attempt_id, question_id),
  UNIQUE KEY uq_answer_attempt_snapshot (attempt_id,attempt_question_id),
  CONSTRAINT fk_answer_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_answer_question FOREIGN KEY (question_id) REFERENCES test_questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_answer_attempt_question FOREIGN KEY (attempt_question_id) REFERENCES test_attempt_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_skills (
  student_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  mastery_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  evidence_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, skill_id),
  CONSTRAINT fk_ss_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_style_campaigns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  publish_date DATE NOT NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_learning_campaign_teacher_class_year (teacher_id,class_id,academic_year),
  INDEX idx_learning_campaign_status_date (status,publish_date),
  INDEX idx_learning_campaign_year (academic_year),
  CONSTRAINT fk_learning_campaign_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_campaign_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_style_assessments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NULL,
  visual_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  auditory_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  reading_writing_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kinesthetic_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  result_style ENUM('visual','auditory','reading_writing','kinesthetic','mixed') NOT NULL,
  answers_json JSON NOT NULL,
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lsa_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_lsa_campaign FOREIGN KEY (campaign_id) REFERENCES learning_style_campaigns(id) ON DELETE CASCADE,
  INDEX idx_lsa_student_date (student_id, completed_at),
  INDEX idx_lsa_campaign (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  teacher_id BIGINT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notes_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  student_id BIGINT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late','excused') NOT NULL,
  teacher_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (student_id, attendance_date),
  CONSTRAINT fk_att_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  teacher_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(190) NOT NULL,
  status ENUM('pending','completed','late') NOT NULL DEFAULT 'pending',
  due_date DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignment_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignment_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS follow_up_settings (
  teacher_id BIGINT UNSIGNED NOT NULL,
  period_no TINYINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  semester ENUM('first','second') NOT NULL DEFAULT 'first',
  periodic_test_max DECIMAL(7,2) NOT NULL DEFAULT 20,
  participation_max DECIMAL(7,2) NOT NULL DEFAULT 10,
  homework_max DECIMAL(7,2) NOT NULL DEFAULT 10,
  tasks_max DECIMAL(7,2) NOT NULL DEFAULT 10,
  quiz_max DECIMAL(7,2) NOT NULL DEFAULT 20,
  final_exam_max DECIMAL(7,2) NOT NULL DEFAULT 50,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, period_no, academic_year, semester),
  CONSTRAINT fk_follow_settings_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_follow_up (
  teacher_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  period_no TINYINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  semester ENUM('first','second') NOT NULL DEFAULT 'first',
  periodic_test_score DECIMAL(7,2) NULL,
  participation_score DECIMAL(7,2) NULL,
  homework_score DECIMAL(7,2) NULL,
  tasks_score DECIMAL(7,2) NULL,
  quiz_one_score DECIMAL(7,2) NULL,
  quiz_two_score DECIMAL(7,2) NULL,
  final_exam_score DECIMAL(7,2) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, student_id, period_no, academic_year, semester),
  CONSTRAINT fk_follow_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_follow_student_period (student_id, period_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS motivational_points (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  points SMALLINT NOT NULL,
  reason_type ENUM('homework','participation','attendance','task','other') NOT NULL DEFAULT 'other',
  reason VARCHAR(255) NOT NULL,
  details VARCHAR(500) NULL,
  batch_id CHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_points_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_points_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_points_student_date (student_id, created_at),
  INDEX idx_points_teacher_date (teacher_id, created_at),
  INDEX idx_points_teacher_batch (teacher_id, batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_resources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NULL,
  category ENUM('worksheet','summary','video') NOT NULL,
  title VARCHAR(190) NOT NULL,
  description VARCHAR(1000) NULL,
  resource_type ENUM('file','link') NOT NULL,
  original_name VARCHAR(255) NULL,
  stored_name VARCHAR(80) NULL UNIQUE,
  mime_type VARCHAR(100) NULL,
  size_bytes BIGINT UNSIGNED NULL,
  resource_url VARCHAR(2048) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_knowledge_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  INDEX idx_knowledge_teacher_category_date (teacher_id, category, created_at),
  INDEX idx_knowledge_resources_academic_year (academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_portfolio_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NULL,
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
  INDEX idx_portfolio_category (category),
  INDEX idx_student_portfolio_files_academic_year (academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NULL,
  student_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  body TEXT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_role VARCHAR(20) NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  real_actor_role VARCHAR(20) NULL,
  real_actor_id BIGINT UNSIGNED NULL,
  preview_role VARCHAR(20) NULL,
  academic_year VARCHAR(30) NULL,
  action VARCHAR(190) NOT NULL,
  details TEXT NULL,
  before_data LONGTEXT NULL,
  after_data LONGTEXT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_date (created_at),
  INDEX idx_activity_actor (actor_role, actor_id),
  INDEX idx_activity_log_academic_year (academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS teacher_school_settings (
  teacher_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  school_name VARCHAR(190) NOT NULL DEFAULT '',
  education_department VARCHAR(190) NOT NULL DEFAULT '',
  education_office VARCHAR(190) NOT NULL DEFAULT '',
  teacher_name VARCHAR(190) NOT NULL DEFAULT '',
  school_leader_name VARCHAR(190) NOT NULL DEFAULT '',
  subject_name VARCHAR(190) NOT NULL DEFAULT 'الرياضيات',
  stage_label VARCHAR(80) NOT NULL DEFAULT '',
  grade_label VARCHAR(80) NOT NULL DEFAULT '',
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  current_semester ENUM('first','second') NOT NULL DEFAULT 'first',
  period_start_date DATE NULL,
  period_end_date DATE NULL,
  term1_start_date DATE NULL,
  term2_start_date DATE NULL,
  additional_logo_original_name VARCHAR(255) NULL,
  additional_logo_stored_name VARCHAR(100) NULL,
  additional_logo_mime_type VARCHAR(100) NULL,
  additional_logo_size_bytes BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_school_settings_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE IF NOT EXISTS site_school_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  school_name VARCHAR(190) NOT NULL DEFAULT '',
  education_department VARCHAR(190) NOT NULL DEFAULT '',
  education_office VARCHAR(190) NOT NULL DEFAULT '',
  school_leader_name VARCHAR(190) NOT NULL DEFAULT '',
  teacher_name VARCHAR(190) NOT NULL DEFAULT '',
  subject_name VARCHAR(190) NOT NULL DEFAULT 'الرياضيات',
  stage_label VARCHAR(80) NOT NULL DEFAULT '',
  grade_label VARCHAR(80) NOT NULL DEFAULT '',
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  current_semester ENUM('first','second') NOT NULL DEFAULT 'first',
  period_start_date DATE NULL,
  period_end_date DATE NULL,
  additional_logo_original_name VARCHAR(255) NULL,
  additional_logo_stored_name VARCHAR(100) NULL,
  additional_logo_mime_type VARCHAR(100) NULL,
  additional_logo_size_bytes BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO site_school_settings (id,subject_name) VALUES (1,'الرياضيات');

CREATE TABLE IF NOT EXISTS academic_year_periods (
  academic_year VARCHAR(30) NOT NULL PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  semester ENUM('first','second') NOT NULL DEFAULT 'first',
  created_by_owner BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_academic_period_owner FOREIGN KEY (created_by_owner) REFERENCES owners(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_year_reset_operations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  target_academic_year VARCHAR(30) NOT NULL,
  new_academic_year VARCHAR(30) NOT NULL,
  status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  counts_json JSON NULL,
  error_message VARCHAR(1000) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_year_reset_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE RESTRICT,
  INDEX idx_year_reset_status_date (status,started_at),
  INDEX idx_year_reset_target (target_academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- المتابعة الأسبوعية المعزولة حسب العام الدراسي والترم
CREATE TABLE IF NOT EXISTS weekly_attendance (
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL,
  semester ENUM('first','second') NOT NULL,
  week_no TINYINT UNSIGNED NOT NULL,
  day_index TINYINT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  status ENUM('present','absent','late','excused') NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id,student_id,academic_year,semester,week_no,day_index),
  INDEX idx_weekly_attendance_class_context (class_id,academic_year,semester,week_no),
  CONSTRAINT fk_weekly_att_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_att_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_att_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_participation (
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  semester ENUM('first','second') NOT NULL DEFAULT 'first',
  week_no TINYINT UNSIGNED NOT NULL DEFAULT 0,
  day_index TINYINT UNSIGNED NOT NULL DEFAULT 0,
  participation_date DATE NOT NULL,
  score DECIMAL(7,2) NULL,
  max_score DECIMAL(7,2) NOT NULL DEFAULT 1,
  record_status ENUM('completed','needs_review') NOT NULL DEFAULT 'completed',
  note VARCHAR(255) NULL,
  PRIMARY KEY (teacher_id,student_id,participation_date),
  INDEX idx_weekly_participation_context (teacher_id,class_id,academic_year,semester,week_no,day_index),
  CONSTRAINT fk_weekly_part_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_part_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_part_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_follow_up_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  semester ENUM('first','second') NOT NULL DEFAULT 'first',
  week_no TINYINT UNSIGNED NOT NULL,
  item_type ENUM('platform_homework','school_homework','task') NOT NULL,
  title VARCHAR(190) NOT NULL,
  item_date DATE NOT NULL,
  max_score DECIMAL(7,2) NOT NULL DEFAULT 1,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_weekly_items_context (teacher_id,class_id,academic_year,semester,week_no,item_type),
  CONSTRAINT fk_weekly_item_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_item_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_follow_up_item_scores (
  item_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  score DECIMAL(7,2) NULL,
  record_status ENUM('completed','needs_review','missing','excused') NOT NULL DEFAULT 'missing',
  note VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id,student_id),
  CONSTRAINT fk_weekly_score_item FOREIGN KEY (item_id) REFERENCES weekly_follow_up_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_score_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  identity_hash CHAR(64) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_attempt_window (identity_hash, ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
('site_name', 'مدار'),
('teacher_registration', 'approval_required'),
('teacher_registration_enabled', 'true'),
('learning_style_notice', 'نتيجة نمط التعلم إرشادية وليست تشخيصًا ثابتًا.');

INSERT IGNORE INTO skills (stage, grade_label, code, name, description) VALUES
('ابتدائي','الصف الرابع','P4-NUM-01','القيمة المنزلية','قراءة وكتابة الأعداد والقيمة المنزلية'),
('ابتدائي','الصف الخامس','P5-FRA-01','الكسور الاعتيادية','تمثيل الكسور ومقارنتها'),
('ابتدائي','الصف السادس','P6-RAT-01','النسبة والتناسب','حل مسائل النسبة والتناسب'),
('متوسط','الصف الأول المتوسط','M1-ALG-01','العبارات الجبرية','تبسيط العبارات الجبرية'),
('متوسط','الصف الثاني المتوسط','M2-LIN-01','المعادلات الخطية','حل المعادلات الخطية'),
('متوسط','الصف الثالث المتوسط','M3-FUN-01','الدوال','تمثيل العلاقات والدوال'),
('ثانوي','الصف الأول الثانوي','S1-GEO-01','البرهان الهندسي','تطبيق مبادئ البرهان'),
('ثانوي','الصف الثاني الثانوي','S2-TRI-01','المثلثات','النسب والدوال المثلثية'),
('ثانوي','الصف الثالث الثانوي','S3-CAL-01','مبادئ التفاضل','المعدل اللحظي والمشتقة');


-- نظام صلاحيات مالك الموقع RBAC

CREATE TABLE IF NOT EXISTS rbac_roles (
  code VARCHAR(20) PRIMARY KEY,
  name_ar VARCHAR(80) NOT NULL,
  hierarchy_rank SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rbac_permissions (
  code VARCHAR(100) PRIMARY KEY,
  name_ar VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role_code VARCHAR(20) NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_code, permission_code),
  CONSTRAINT fk_rbac_role_permission_role FOREIGN KEY (role_code) REFERENCES rbac_roles(code) ON DELETE CASCADE,
  CONSTRAINT fk_rbac_role_permission_permission FOREIGN KEY (permission_code) REFERENCES rbac_permissions(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_role_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_type ENUM('owner','teacher','student','platform') NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  role_code VARCHAR(20) NOT NULL,
  assigned_by_owner BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_role_subject (subject_type, subject_id),
  INDEX idx_user_role_code (role_code),
  CONSTRAINT fk_user_role_assignment_role FOREIGN KEY (role_code) REFERENCES rbac_roles(code) ON DELETE RESTRICT,
  CONSTRAINT fk_user_role_assignment_owner FOREIGN KEY (assigned_by_owner) REFERENCES owners(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_code ENUM('ADMIN','PARENT') NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_platform_users_role_status (role_code,status),
  INDEX idx_platform_users_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS owner_security (
  owner_id BIGINT UNSIGNED PRIMARY KEY,
  two_factor_secret VARCHAR(128) NULL,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_confirmed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_owner_security_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_preview_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  preview_role VARCHAR(20) NOT NULL,
  preview_subject_type VARCHAR(20) NULL,
  preview_subject_id BIGINT UNSIGNED NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  CONSTRAINT fk_role_preview_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
  INDEX idx_role_preview_owner_active (owner_id,ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO rbac_roles (code,name_ar,hierarchy_rank,is_system) VALUES
('OWNER','مالك الموقع',1000,1),
('ADMIN','إداري',700,1),
('TEACHER','معلم',500,1),
('PARENT','ولي أمر',300,1),
('STUDENT','طالب',100,1)
ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar),hierarchy_rank=VALUES(hierarchy_rank),is_system=VALUES(is_system);

-- بوابة ولي الأمر وربط الأبناء ومجمع مدار
CREATE TABLE IF NOT EXISTS parent_student_links (
  parent_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  linked_by_teacher BIGINT UNSIGNED NULL,
  relation_label VARCHAR(60) NOT NULL DEFAULT 'ولي أمر',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_id,student_id),
  INDEX idx_parent_links_student (student_id,status),
  INDEX idx_parent_links_parent (parent_id,status),
  CONSTRAINT fk_parent_link_parent FOREIGN KEY (parent_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_link_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_link_teacher FOREIGN KEY (linked_by_teacher) REFERENCES teachers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parent_registration_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  parent_user_id BIGINT UNSIGNED NULL,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  student_emails_json LONGTEXT NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  review_note VARCHAR(500) NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent_request_teacher_status (teacher_id,status,created_at),
  INDEX idx_parent_request_email_status (email,status),
  CONSTRAINT fk_parent_request_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_request_user FOREIGN KEY (parent_user_id) REFERENCES platform_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parent_community_posts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('published','archived') NOT NULL DEFAULT 'published',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent_community_teacher_date (teacher_id,status,created_at),
  INDEX idx_parent_community_class_date (class_id,status,created_at),
  CONSTRAINT fk_parent_community_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_community_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- محاولات الألعاب التعليمية (v11)
CREATE TABLE IF NOT EXISTS game_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  game_key VARCHAR(100) NOT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'easy',
  score INT UNSIGNED NOT NULL DEFAULT 0,
  question_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  correct_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  best_streak SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_game_attempt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_game_attempt_student_date (student_id,played_at),
  INDEX idx_game_attempt_key_date (game_key,played_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
