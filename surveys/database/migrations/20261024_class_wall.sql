-- Additive class wall: existing posts, comments and file rows are retained.
CREATE TABLE IF NOT EXISTS mb_wall_folders (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 class_id BIGINT UNSIGNED NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 name VARCHAR(140) NOT NULL,
 description VARCHAR(1500) NOT NULL DEFAULT '',
 color CHAR(7) NOT NULL DEFAULT '#9b87c4',
 deleted_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (class_id) REFERENCES mb_classes(id),
 FOREIGN KEY (created_by) REFERENCES ms_users(id),
 INDEX idx_wall_class (class_id,deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_wall_posts (
 post_id BIGINT UNSIGNED PRIMARY KEY,
 folder_id BIGINT UNSIGNED NULL,
 deleted_at DATETIME NULL,
 FOREIGN KEY (post_id) REFERENCES mb_posts(id),
 FOREIGN KEY (folder_id) REFERENCES mb_wall_folders(id),
 INDEX idx_wall_folder (folder_id,deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
