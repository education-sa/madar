SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_resources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  category ENUM('worksheet','summary','video') NOT NULL,
  title VARCHAR(190) NOT NULL,
  description VARCHAR(1000) NULL,
  resource_type ENUM('file','link') NOT NULL,
  original_name VARCHAR(255) NULL,
  stored_name VARCHAR(80) NULL UNIQUE,
  mime_type VARCHAR(100) NULL,
  size_bytes BIGINT UNSIGNED NULL,
  resource_url VARCHAR(2048) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_knowledge_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  INDEX idx_knowledge_teacher_category_date (teacher_id, category, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
