-- تصحيح إعدادات شهادة الألعاب: لا نستخدم بيانات درس افتراضية في الإنتاج.
-- لا يُشغّل هذا الملف تلقائيًا؛ يُطبّق مرة واحدة بعد ترحيل الألعاب السابق.
SET NAMES utf8mb4;

ALTER TABLE teacher_school_settings
  MODIFY COLUMN game_unit_number SMALLINT UNSIGNED NULL DEFAULT NULL,
  MODIFY COLUMN game_lesson_number SMALLINT UNSIGNED NULL DEFAULT NULL,
  MODIFY COLUMN game_lesson_name VARCHAR(190) NULL DEFAULT NULL;

-- تصفير الصفوف التي ما زالت تطابق مجموعة القيم الافتراضية السابقة كاملةً.
-- تبقى أي إعدادات عدّلتها المعلمة (ومنها الوقت أو خيار الحفظ) دون تغيير.
UPDATE teacher_school_settings
SET game_unit_number=NULL,
    game_lesson_number=NULL,
    game_lesson_name=NULL
WHERE game_unit_number=3
  AND game_lesson_number=2
  AND game_lesson_name='النسبة المئوية'
  AND game_time_mode='open'
  AND game_time_seconds=30
  AND game_certificate_portfolio_enabled=1;
