-- منصة مدار: إعدادات العام الدراسي والمدرسة وعزل سجل المتابعة حسب الترم
-- آمن للنسخ الحالية: لا يحذف أي بيانات ولا يستبدل بيانات ترم سابق.

CREATE TABLE IF NOT EXISTS teacher_school_settings (
  teacher_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  school_name VARCHAR(190) NOT NULL DEFAULT '',
  education_department VARCHAR(190) NOT NULL DEFAULT '',
  education_office VARCHAR(190) NOT NULL DEFAULT '',
  teacher_name VARCHAR(190) NOT NULL DEFAULT '',
  school_leader_name VARCHAR(190) NOT NULL DEFAULT '',
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  current_semester ENUM('first','second') NOT NULL DEFAULT 'first',
  term1_start_date DATE NULL,
  term2_start_date DATE NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_school_settings_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
DROP PROCEDURE IF EXISTS madar_add_column_if_missing$$
CREATE PROCEDURE madar_add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND COLUMN_NAME=p_column
  ) THEN
    SET @madar_sql=CONCAT('ALTER TABLE `',p_table,'` ADD COLUMN `',p_column,'` ',p_definition);
    PREPARE madar_stmt FROM @madar_sql;
    EXECUTE madar_stmt;
    DEALLOCATE PREPARE madar_stmt;
  END IF;
END$$
DELIMITER ;

CALL madar_add_column_if_missing('teacher_school_settings','school_leader_name',"VARCHAR(190) NOT NULL DEFAULT '' AFTER `teacher_name`");
CALL madar_add_column_if_missing('tests','academic_year',"VARCHAR(30) NOT NULL DEFAULT '' AFTER `total_points`");
CALL madar_add_column_if_missing('tests','semester',"ENUM('first','second') NOT NULL DEFAULT 'first' AFTER `academic_year`");
CALL madar_add_column_if_missing('follow_up_settings','academic_year',"VARCHAR(30) NOT NULL DEFAULT '' AFTER `period_no`");
CALL madar_add_column_if_missing('follow_up_settings','semester',"ENUM('first','second') NOT NULL DEFAULT 'first' AFTER `academic_year`");
CALL madar_add_column_if_missing('student_follow_up','academic_year',"VARCHAR(30) NOT NULL DEFAULT '' AFTER `period_no`");
CALL madar_add_column_if_missing('student_follow_up','semester',"ENUM('first','second') NOT NULL DEFAULT 'first' AFTER `academic_year`");

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

CALL madar_add_column_if_missing('weekly_participation','academic_year',"VARCHAR(30) NOT NULL DEFAULT '' AFTER `class_id`");
CALL madar_add_column_if_missing('weekly_participation','semester',"ENUM('first','second') NOT NULL DEFAULT 'first' AFTER `academic_year`");
CALL madar_add_column_if_missing('weekly_participation','week_no',"TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER `semester`");
CALL madar_add_column_if_missing('weekly_participation','day_index',"TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER `week_no`");

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

CALL madar_add_column_if_missing('weekly_follow_up_items','academic_year',"VARCHAR(30) NOT NULL DEFAULT '' AFTER `class_id`");
CALL madar_add_column_if_missing('weekly_follow_up_items','semester',"ENUM('first','second') NOT NULL DEFAULT 'first' AFTER `academic_year`");

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

DROP PROCEDURE IF EXISTS madar_add_column_if_missing;
