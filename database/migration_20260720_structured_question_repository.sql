-- دعم مخطط المستودع البرمجي ذي الأعمدة الإنجليزية مع الحفاظ على نموذج مدار العربي.
SET @db = DATABASE();

DROP PROCEDURE IF EXISTS madar_add_question_bank_column;
DELIMITER $$
CREATE PROCEDURE madar_add_question_bank_column(IN column_name_value VARCHAR(64), IN definition_value TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=@db AND TABLE_NAME='question_bank' AND COLUMN_NAME=column_name_value)=0 THEN
    SET @sql_text = CONCAT('ALTER TABLE question_bank ADD COLUMN `', column_name_value, '` ', definition_value);
    PREPARE statement_to_run FROM @sql_text;
    EXECUTE statement_to_run;
    DEALLOCATE PREPARE statement_to_run;
  END IF;
END$$
DELIMITER ;

CALL madar_add_question_bank_column('source_question_id', 'VARCHAR(120) NULL AFTER external_question_id');
CALL madar_add_question_bank_column('subject_id', 'VARCHAR(120) NULL AFTER source_question_id');
CALL madar_add_question_bank_column('subject_name', 'VARCHAR(180) NULL AFTER subject_id');
CALL madar_add_question_bank_column('external_skill_id', 'VARCHAR(120) NULL AFTER lesson_code');
CALL madar_add_question_bank_column('unit_id', 'VARCHAR(120) NULL AFTER chapter_name');
CALL madar_add_question_bank_column('unit_name', 'VARCHAR(180) NULL AFTER unit_id');
CALL madar_add_question_bank_column('lesson_id', 'VARCHAR(120) NULL AFTER unit_name');
CALL madar_add_question_bank_column('lesson_name', 'VARCHAR(180) NULL AFTER lesson_id');
CALL madar_add_question_bank_column('question_category', 'VARCHAR(120) NULL AFTER cognitive_type');
CALL madar_add_question_bank_column('questions_to_display', 'SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER skill_repeat_number');
CALL madar_add_question_bank_column('question_order', 'INT UNSIGNED NULL AFTER questions_to_display');
CALL madar_add_question_bank_column('question_source', 'VARCHAR(180) NULL AFTER content_source');
CALL madar_add_question_bank_column('source_reference', 'VARCHAR(500) NULL AFTER question_source');
CALL madar_add_question_bank_column('status', 'VARCHAR(80) NULL AFTER source_reference');

DROP PROCEDURE IF EXISTS madar_add_question_bank_column;
