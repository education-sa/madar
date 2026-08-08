SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS teacher_interactive_games (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  game_key VARCHAR(100) NOT NULL,
  lesson_name VARCHAR(190) NOT NULL,
  unit_number SMALLINT UNSIGNED NOT NULL,
  lesson_number SMALLINT UNSIGNED NOT NULL,
  time_mode ENUM('open','timed') NOT NULL DEFAULT 'open',
  time_per_question_seconds SMALLINT UNSIGNED NULL DEFAULT NULL,
  certificate_portfolio_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_teacher_interactive_games_teacher
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  UNIQUE INDEX uq_teacher_interactive_games_teacher_key (teacher_id, game_key),
  INDEX idx_teacher_interactive_games_teacher_active (teacher_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
