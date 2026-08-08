-- مدار: إعدادات اللعبة التفاعلية وشهادات الإتقان المحفوظة في ملف الإنجاز.
-- لا ينشئ هذا التحديث جدولًا موازيًا للشهادات؛ تُحفظ داخل student_portfolio_files.
SET NAMES utf8mb4;

DELIMITER $$
DROP PROCEDURE IF EXISTS madar_game_add_column_if_missing$$
CREATE PROCEDURE madar_game_add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=p_table AND COLUMN_NAME=p_column
  ) THEN
    SET @madar_game_sql=CONCAT('ALTER TABLE `',p_table,'` ADD COLUMN `',p_column,'` ',p_definition);
    PREPARE madar_game_stmt FROM @madar_game_sql;
    EXECUTE madar_game_stmt;
    DEALLOCATE PREPARE madar_game_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS madar_game_add_index_if_missing$$
CREATE PROCEDURE madar_game_add_index_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student_portfolio_files' AND INDEX_NAME='uq_portfolio_student_certificate'
  ) THEN
    ALTER TABLE student_portfolio_files
      ADD UNIQUE INDEX uq_portfolio_student_certificate (student_id,certificate_key);
  END IF;
END$$
DELIMITER ;

CALL madar_game_add_column_if_missing('teacher_school_settings','game_unit_number','SMALLINT UNSIGNED NOT NULL DEFAULT 3');
CALL madar_game_add_column_if_missing('teacher_school_settings','game_lesson_number','SMALLINT UNSIGNED NOT NULL DEFAULT 2');
CALL madar_game_add_column_if_missing('teacher_school_settings','game_lesson_name',"VARCHAR(190) NOT NULL DEFAULT 'النسبة المئوية'");
CALL madar_game_add_column_if_missing('teacher_school_settings','game_time_mode',"ENUM('open','timed') NOT NULL DEFAULT 'open'");
CALL madar_game_add_column_if_missing('teacher_school_settings','game_time_seconds','SMALLINT UNSIGNED NOT NULL DEFAULT 30');
CALL madar_game_add_column_if_missing('teacher_school_settings','game_certificate_portfolio_enabled','TINYINT(1) NOT NULL DEFAULT 1');

CALL madar_game_add_column_if_missing('student_portfolio_files','certificate_key','VARCHAR(190) NULL');
CALL madar_game_add_column_if_missing('student_portfolio_files','certificate_data_json','LONGTEXT NULL');
CALL madar_game_add_index_if_missing();

DROP PROCEDURE IF EXISTS madar_game_add_index_if_missing;
DROP PROCEDURE IF EXISTS madar_game_add_column_if_missing;
