-- Madar School Library extension (additive, idempotent)
CREATE TABLE IF NOT EXISTS ms_school_template_listings (
 template_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 school_key VARCHAR(200) NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_ms_school_tpl FOREIGN KEY (template_id) REFERENCES ms_personal_templates(id) ON DELETE CASCADE,
 INDEX idx_ms_school_key(school_key,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
