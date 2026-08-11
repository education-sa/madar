SET NAMES utf8mb4;

-- لقطة إعداد اللعبة المستخدمة لإصدار شهادة تاريخية صحيحة.
SET @game_snapshot_sql=IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='game_attempts' AND COLUMN_NAME='game_snapshot_json')=0,
  'ALTER TABLE game_attempts ADD COLUMN game_snapshot_json LONGTEXT NULL AFTER duration_seconds',
  'SELECT 1'
);
PREPARE game_snapshot_statement FROM @game_snapshot_sql;EXECUTE game_snapshot_statement;DEALLOCATE PREPARE game_snapshot_statement;

-- أعمدة التنبيهات التي كانت تُضاف سابقًا أثناء الطلبات.
DROP PROCEDURE IF EXISTS madar_add_notification_column;
DELIMITER $$
CREATE PROCEDURE madar_add_notification_column(IN column_name_value VARCHAR(64),IN definition_value TEXT)
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND COLUMN_NAME=column_name_value)=0 THEN
    SET @sql_text=CONCAT('ALTER TABLE notifications ADD COLUMN `',column_name_value,'` ',definition_value);
    PREPARE statement_to_run FROM @sql_text;EXECUTE statement_to_run;DEALLOCATE PREPARE statement_to_run;
  END IF;
END$$
DELIMITER ;
CALL madar_add_notification_column('severity',"ENUM('info','success','warning','danger') NOT NULL DEFAULT 'info' AFTER body");
CALL madar_add_notification_column('route',"VARCHAR(190) NULL AFTER severity");
CALL madar_add_notification_column('dedupe_key',"VARCHAR(190) NULL AFTER route");
DROP PROCEDURE IF EXISTS madar_add_notification_column;

SET @notification_index_sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND INDEX_NAME='idx_notifications_teacher_read')=0,'ALTER TABLE notifications ADD INDEX idx_notifications_teacher_read (teacher_id,is_read,created_at)','SELECT 1');
PREPARE notification_index_statement FROM @notification_index_sql;EXECUTE notification_index_statement;DEALLOCATE PREPARE notification_index_statement;

SET @notification_unique_sql=IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND INDEX_NAME='uq_notifications_dedupe')=0,'ALTER TABLE notifications ADD UNIQUE INDEX uq_notifications_dedupe (teacher_id,dedupe_key)','SELECT 1');
PREPARE notification_unique_statement FROM @notification_unique_sql;EXECUTE notification_unique_statement;DEALLOCATE PREPARE notification_unique_statement;
