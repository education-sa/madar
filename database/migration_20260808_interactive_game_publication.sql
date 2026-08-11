SET NAMES utf8mb4;

SET @publication_columns_before=(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='teacher_interactive_games' AND COLUMN_NAME IN('semester','class_id'));

DROP PROCEDURE IF EXISTS madar_add_game_publication_column;
DELIMITER $$
CREATE PROCEDURE madar_add_game_publication_column(IN column_name_value VARCHAR(64),IN definition_value TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='teacher_interactive_games' AND COLUMN_NAME=column_name_value)=0 THEN
    SET @sql_text=CONCAT('ALTER TABLE teacher_interactive_games ADD COLUMN `',column_name_value,'` ',definition_value);
    PREPARE statement_to_run FROM @sql_text;EXECUTE statement_to_run;DEALLOCATE PREPARE statement_to_run;
  END IF;
END$$
DELIMITER ;

CALL madar_add_game_publication_column('semester',"ENUM('first','second') NULL DEFAULT NULL AFTER grade_label");
CALL madar_add_game_publication_column('class_id',"BIGINT UNSIGNED NULL DEFAULT NULL AFTER semester");
DROP PROCEDURE IF EXISTS madar_add_game_publication_column;

ALTER TABLE teacher_interactive_games MODIFY COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0;
SET @publication_reset_sql=IF(@publication_columns_before<2,'UPDATE teacher_interactive_games SET is_active=0','SELECT 1');
PREPARE publication_reset_statement FROM @publication_reset_sql;EXECUTE publication_reset_statement;DEALLOCATE PREPARE publication_reset_statement;

SET @publication_index_sql=IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='teacher_interactive_games' AND INDEX_NAME='idx_teacher_interactive_games_publication')=0,
  'ALTER TABLE teacher_interactive_games ADD INDEX idx_teacher_interactive_games_publication (teacher_id,is_active,semester,stage,grade_label,class_id)',
  'SELECT 1'
);
PREPARE publication_index_statement FROM @publication_index_sql;EXECUTE publication_index_statement;DEALLOCATE PREPARE publication_index_statement;
