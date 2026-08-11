SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS madar_add_game_audience_column;
DELIMITER $$
CREATE PROCEDURE madar_add_game_audience_column(IN column_name_value VARCHAR(64),IN definition_value TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='teacher_interactive_games' AND COLUMN_NAME=column_name_value)=0 THEN
    SET @sql_text=CONCAT('ALTER TABLE teacher_interactive_games ADD COLUMN `',column_name_value,'` ',definition_value);
    PREPARE statement_to_run FROM @sql_text;EXECUTE statement_to_run;DEALLOCATE PREPARE statement_to_run;
  END IF;
END$$
DELIMITER ;

CALL madar_add_game_audience_column('stage',"ENUM('all','ابتدائي','متوسط','ثانوي') NOT NULL DEFAULT 'all' AFTER lesson_number");
CALL madar_add_game_audience_column('grade_label',"VARCHAR(80) NOT NULL DEFAULT 'all' AFTER stage");
DROP PROCEDURE IF EXISTS madar_add_game_audience_column;
