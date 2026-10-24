-- Additive management metadata. Native credentials and historic records are retained.
CREATE TABLE IF NOT EXISTS mb_assistant_grants (
 teacher_id BIGINT UNSIGNED NOT NULL,
 class_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
 permission_code VARCHAR(40) NOT NULL,
 granted_by BIGINT UNSIGNED NOT NULL,
 granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(teacher_id,class_id,permission_code),
 FOREIGN KEY(teacher_id) REFERENCES ms_users(id),
 FOREIGN KEY(granted_by) REFERENCES ms_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_management_migrations (
 migration_key VARCHAR(80) PRIMARY KEY,
 applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_class_madar_links (
 class_id BIGINT UNSIGNED PRIMARY KEY,
 native_class_id BIGINT UNSIGNED NULL UNIQUE,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 updated_by BIGINT UNSIGNED NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(class_id) REFERENCES mb_classes(id),
 FOREIGN KEY(native_class_id) REFERENCES classes(id) ON DELETE SET NULL,
 FOREIGN KEY(updated_by) REFERENCES ms_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
