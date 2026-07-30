-- سجل المتابعة الأسبوعي لمنصة مدار
CREATE TABLE IF NOT EXISTS weekly_follow_up_settings (
  teacher_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  academic_start_date DATE NULL,
  date_mode ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_weekly_settings_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_follow_up_dates (
  teacher_id BIGINT UNSIGNED NOT NULL,
  week_no TINYINT UNSIGNED NOT NULL,
  day_index TINYINT UNSIGNED NOT NULL,
  tracking_date DATE NOT NULL,
  PRIMARY KEY (teacher_id,week_no,day_index),
  UNIQUE KEY uq_weekly_teacher_date (teacher_id,tracking_date),
  CONSTRAINT fk_weekly_date_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_participation (
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  participation_date DATE NOT NULL,
  score DECIMAL(7,2) NULL,
  max_score DECIMAL(7,2) NOT NULL DEFAULT 1,
  record_status ENUM('completed','needs_review') NOT NULL DEFAULT 'completed',
  note VARCHAR(255) NULL,
  PRIMARY KEY (teacher_id,student_id,participation_date),
  INDEX idx_weekly_participation_class_date (class_id,participation_date),
  CONSTRAINT fk_weekly_part_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_part_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_weekly_part_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_follow_up_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  week_no TINYINT UNSIGNED NOT NULL,
  item_type ENUM('platform_homework','school_homework','task') NOT NULL,
  title VARCHAR(190) NOT NULL,
  item_date DATE NOT NULL,
  max_score DECIMAL(7,2) NOT NULL DEFAULT 1,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_weekly_items_class_week (class_id,week_no,item_type),
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
