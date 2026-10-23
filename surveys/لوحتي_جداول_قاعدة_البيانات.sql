-- لوحة المدرسة - إضافة فقط. لا تعدل أيًا من جداول الاستبيانات الحالية.
-- نفّذي هذا الملف مرة واحدة في قاعدة بيانات مدار، بعد نسخة احتياطية.
CREATE TABLE IF NOT EXISTS mb_classes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(140) NOT NULL, academic_year VARCHAR(25) NOT NULL,
 grade VARCHAR(80) NOT NULL DEFAULT '', section_name VARCHAR(40) NOT NULL DEFAULT '',
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 created_by BIGINT UNSIGNED NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_class (academic_year, grade, section_name, title),
 CONSTRAINT fk_mb_class_owner FOREIGN KEY (created_by) REFERENCES ms_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_teachers (
 class_id BIGINT UNSIGNED NOT NULL, teacher_id BIGINT UNSIGNED NOT NULL,
 can_view TINYINT(1) NOT NULL DEFAULT 1, can_post TINYINT(1) NOT NULL DEFAULT 0,
 can_upload TINYINT(1) NOT NULL DEFAULT 0, can_manage_students TINYINT(1) NOT NULL DEFAULT 0,
 can_manage_posts TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (class_id,teacher_id), FOREIGN KEY (class_id) REFERENCES mb_classes(id) ON DELETE CASCADE,
 FOREIGN KEY (teacher_id) REFERENCES ms_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_students (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 -- الرقم الحقيقي من قاعدة مدار، ولا نستنتجه من الاسم
 madar_student_id BIGINT UNSIGNED NOT NULL UNIQUE,
 display_name VARCHAR(160) NOT NULL,
 entry_mode ENUM('school_only','madar') NOT NULL DEFAULT 'school_only',
 school_enabled TINYINT(1) NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_class_students (
 class_id BIGINT UNSIGNED NOT NULL, student_id BIGINT UNSIGNED NOT NULL,
 joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (class_id,student_id),
 FOREIGN KEY (class_id) REFERENCES mb_classes(id) ON DELETE CASCADE,
 FOREIGN KEY (student_id) REFERENCES mb_students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_posts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, class_id BIGINT UNSIGNED NOT NULL,
 author_id BIGINT UNSIGNED NULL, student_id BIGINT UNSIGNED NULL,
 title VARCHAR(170) NOT NULL, content TEXT NOT NULL,
 status ENUM('published','pending','hidden') NOT NULL DEFAULT 'published',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (class_id) REFERENCES mb_classes(id) ON DELETE CASCADE,
 FOREIGN KEY (author_id) REFERENCES ms_users(id) ON DELETE SET NULL,
 FOREIGN KEY (student_id) REFERENCES mb_students(id) ON DELETE SET NULL,
 INDEX idx_class_posts (class_id,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_comments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,post_id BIGINT UNSIGNED NOT NULL,
 author_id BIGINT UNSIGNED NOT NULL,body TEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (post_id) REFERENCES mb_posts(id) ON DELETE CASCADE,
 FOREIGN KEY (author_id) REFERENCES ms_users(id), INDEX idx_post_comments (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_files (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,class_id BIGINT UNSIGNED NOT NULL,
 student_id BIGINT UNSIGNED NULL,post_id BIGINT UNSIGNED NULL,
 subject VARCHAR(85) NOT NULL DEFAULT '',file_name VARCHAR(200) NOT NULL,
 storage_name CHAR(48) NOT NULL UNIQUE,mime VARCHAR(110) NOT NULL,
 file_size BIGINT UNSIGNED NOT NULL,uploaded_by BIGINT UNSIGNED NULL,
 uploaded_by_student BIGINT UNSIGNED NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at DATETIME NULL,
 FOREIGN KEY (class_id) REFERENCES mb_classes(id) ON DELETE CASCADE,
 FOREIGN KEY (student_id) REFERENCES mb_students(id) ON DELETE SET NULL,
 FOREIGN KEY (post_id) REFERENCES mb_posts(id) ON DELETE SET NULL,
 FOREIGN KEY (uploaded_by) REFERENCES ms_users(id),
 FOREIGN KEY (uploaded_by_student) REFERENCES mb_students(id), INDEX idx_files_student (student_id,deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id BIGINT UNSIGNED NOT NULL,
 event_type VARCHAR(60) NOT NULL,entity_type VARCHAR(60) NOT NULL,
 entity_id BIGINT UNSIGNED NOT NULL,details VARCHAR(500) NOT NULL DEFAULT '',
 happened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (actor_id) REFERENCES ms_users(id),INDEX idx_board_audit (happened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
