CREATE TABLE IF NOT EXISTS student_registration_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id BIGINT UNSIGNED NOT NULL,
  existing_student_id BIGINT UNSIGNED NULL,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_request_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_request_existing FOREIGN KEY (existing_student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_student_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES teachers(id) ON DELETE SET NULL,
  INDEX idx_student_request_email (email),
  INDEX idx_student_request_status (status),
  INDEX idx_student_request_class_status (class_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
