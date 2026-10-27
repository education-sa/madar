-- Additive metadata: existing folders, posts and files remain intact.
CREATE TABLE IF NOT EXISTS mb_wall_folder_state (
 folder_id BIGINT UNSIGNED PRIMARY KEY,
 is_open TINYINT(1) NOT NULL DEFAULT 1,
 FOREIGN KEY (folder_id) REFERENCES mb_wall_folders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS mb_file_titles (
 file_id BIGINT UNSIGNED PRIMARY KEY,
 title VARCHAR(170) NOT NULL,
 FOREIGN KEY (file_id) REFERENCES mb_files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
