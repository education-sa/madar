SET NAMES utf8mb4;
SET time_zone = '+03:00';

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

INSERT INTO rbac_permissions(code,name_ar,category) VALUES
('parents.manage','إدارة حسابات أولياء أمور طالباتي','المستخدمون'),
('parent_community.manage','إدارة مجمع مدار لأولياء الأمور','المحتوى'),
('parent.children.view','عرض بيانات الأبناء المرتبطين','صلاحيات ولي الأمر'),
('parent.results.view','عرض اختبارات ودرجات الأبناء','صلاحيات ولي الأمر'),
('parent.points.view','عرض نقاط تحفيز الأبناء','صلاحيات ولي الأمر'),
('parent.analytics.view','عرض تحليل ومهارات الأبناء','صلاحيات ولي الأمر'),
('parent.follow_up.view','عرض الحضور والمتابعة والواجبات للأبناء','صلاحيات ولي الأمر'),
('parent.files.view','عرض ملفات وموارد الأبناء','صلاحيات ولي الأمر'),
('parent.community.view','عرض مجمع مدار لأولياء الأمور','صلاحيات ولي الأمر')
ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar),category=VALUES(category);

INSERT IGNORE INTO rbac_role_permissions(role_code,permission_code) VALUES
('TEACHER','parents.manage'),
('TEACHER','parent_community.manage'),
('PARENT','parent.children.view'),
('PARENT','parent.results.view'),
('PARENT','parent.points.view'),
('PARENT','parent.analytics.view'),
('PARENT','parent.follow_up.view'),
('PARENT','parent.files.view'),
('PARENT','parent.community.view');
