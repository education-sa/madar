SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS follow_up_settings (
  teacher_id BIGINT UNSIGNED NOT NULL,
  period_no TINYINT UNSIGNED NOT NULL,
  periodic_test_max DECIMAL(7,2) NOT NULL DEFAULT 20,
  participation_max DECIMAL(7,2) NOT NULL DEFAULT 10,
  homework_max DECIMAL(7,2) NOT NULL DEFAULT 10,
  tasks_max DECIMAL(7,2) NOT NULL DEFAULT 10,
  quiz_max DECIMAL(7,2) NOT NULL DEFAULT 20,
  final_exam_max DECIMAL(7,2) NOT NULL DEFAULT 50,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, period_no),
  CONSTRAINT fk_follow_settings_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_follow_up (
  teacher_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  period_no TINYINT UNSIGNED NOT NULL,
  periodic_test_score DECIMAL(7,2) NULL,
  participation_score DECIMAL(7,2) NULL,
  homework_score DECIMAL(7,2) NULL,
  tasks_score DECIMAL(7,2) NULL,
  quiz_one_score DECIMAL(7,2) NULL,
  quiz_two_score DECIMAL(7,2) NULL,
  final_exam_score DECIMAL(7,2) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, student_id, period_no),
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
