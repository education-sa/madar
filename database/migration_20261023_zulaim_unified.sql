-- Additive only. No passwords, accounts, surveys, results or files are deleted.
CREATE TABLE IF NOT EXISTS mb_native_access (
 subject_type VARCHAR(16) NOT NULL, subject_id BIGINT UNSIGNED NOT NULL,
 access_mode ENUM('madar_only','portal_only','both') NOT NULL DEFAULT 'madar_only',
 portal_enabled TINYINT(1) NOT NULL DEFAULT 0,
 updated_by BIGINT UNSIGNED NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(subject_type,subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_access_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, owner_id BIGINT UNSIGNED NOT NULL,
 subject_type VARCHAR(16) NOT NULL, subject_id BIGINT UNSIGNED NOT NULL,
 event_type VARCHAR(50) NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_native_audit(subject_type,subject_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Keep current survey access for existing teachers; new accounts default to Madar only.
INSERT IGNORE INTO mb_native_access(subject_type,subject_id,access_mode,portal_enabled)
 SELECT 'teacher',t.id,IF(ms.setting_value='surveys_only','portal_only','both'),1 FROM teachers t LEFT JOIN ms_settings ms ON ms.setting_key=CONCAT('teacher_scope_',t.id) WHERE t.deleted_at IS NULL;
INSERT IGNORE INTO mb_native_access(subject_type,subject_id,access_mode,portal_enabled)
 SELECT 'student',s.madar_student_id,IF(s.entry_mode='school_only','portal_only','both'),s.school_enabled FROM mb_students s;

CREATE TABLE IF NOT EXISTS mb_class_identity (
 identity_key CHAR(64) NOT NULL PRIMARY KEY,
 class_id BIGINT UNSIGNED NULL,
 CONSTRAINT fk_mb_class_identity FOREIGN KEY(class_id) REFERENCES mb_classes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO mb_class_identity(identity_key,class_id)
 SELECT SHA2(CONCAT(TRIM(academic_year),'|',TRIM(grade),'|',TRIM(section_name)),256),MIN(id)
 FROM mb_classes GROUP BY SHA2(CONCAT(TRIM(academic_year),'|',TRIM(grade),'|',TRIM(section_name)),256);

INSERT IGNORE INTO mb_native_access(subject_type,subject_id,access_mode,portal_enabled)
 SELECT 'platform',id,'madar_only',0 FROM platform_users WHERE role_code='PARENT' AND deleted_at IS NULL;
