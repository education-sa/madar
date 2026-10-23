-- Additive school permissions for the Zulaim portal. Safe to re-run.
-- Existing Madar accounts and survey data are not changed or removed.
CREATE TABLE IF NOT EXISTS mb_school_roles (
 user_id BIGINT UNSIGNED NOT NULL,
 role ENUM('first_teacher') NOT NULL,
 granted_by BIGINT UNSIGNED NOT NULL,
 granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id, role),
 CONSTRAINT fk_mb_school_role_user FOREIGN KEY (user_id) REFERENCES ms_users(id) ON DELETE CASCADE,
 CONSTRAINT fk_mb_school_role_grantor FOREIGN KEY (granted_by) REFERENCES ms_users(id),
 INDEX idx_mb_school_role(role, granted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mb_teacher_profiles (
 class_id BIGINT UNSIGNED NOT NULL,
 teacher_id BIGINT UNSIGNED NOT NULL,
 specialty VARCHAR(100) NOT NULL DEFAULT '',
 subject VARCHAR(85) NOT NULL DEFAULT '',
 grade_scope VARCHAR(100) NOT NULL DEFAULT '',
 approved TINYINT(1) NOT NULL DEFAULT 0,
 approved_by BIGINT UNSIGNED NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(class_id, teacher_id),
 CONSTRAINT fk_mb_profile_membership FOREIGN KEY(class_id,teacher_id) REFERENCES mb_teachers(class_id,teacher_id) ON DELETE CASCADE,
 CONSTRAINT fk_mb_profile_approver FOREIGN KEY(approved_by) REFERENCES ms_users(id) ON DELETE SET NULL,
 INDEX idx_mb_profile_subject(class_id,subject,approved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Keep prior class assignments visible in management for review, but require
-- each one to be explicitly approved with a subject before subject files open.
INSERT IGNORE INTO mb_teacher_profiles(class_id,teacher_id,grade_scope,approved)
 SELECT t.class_id,t.teacher_id,c.grade,0
 FROM mb_teachers t JOIN mb_classes c ON c.id=t.class_id;
