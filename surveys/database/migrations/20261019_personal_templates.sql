-- Madar Surveys 2026-10-19: additive and idempotent (no existing data touched).
-- Apply ONCE on the same MySQL database as ms_surveys; safe to reapply.
CREATE TABLE IF NOT EXISTS ms_personal_templates (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 owner_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(200) NOT NULL,
 kind VARCHAR(20) NOT NULL DEFAULT 'custom',
 performance TINYINT NOT NULL DEFAULT 0,
 definition JSON NOT NULL,
 source_name VARCHAR(160) NOT NULL DEFAULT '',
 share_token CHAR(48) COLLATE utf8mb4_bin NOT NULL UNIQUE,
 sharing_enabled TINYINT NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_ms_personal_templates_owner FOREIGN KEY(owner_id) REFERENCES ms_users(id),
 INDEX idx_ms_personal_templates_owner(owner_id,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
