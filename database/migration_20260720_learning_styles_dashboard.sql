-- لوحة أنماط التعلم المتكاملة في منصة مدار
CREATE TABLE IF NOT EXISTS learning_style_campaigns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(30) NOT NULL DEFAULT '',
  publish_date DATE NOT NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_learning_campaign_teacher_class_year (teacher_id,class_id,academic_year),
  INDEX idx_learning_campaign_status_date (status,publish_date),
  INDEX idx_learning_campaign_year (academic_year),
  CONSTRAINT fk_learning_campaign_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_campaign_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- الترقية الفعلية تتم تلقائيًا وبصورة قابلة لإعادة التشغيل عند فتح الصفحة
-- من خلال ensure_learning_style_schema() في api/learning_styles.php.
-- هذا يمنع فشل التثبيت إذا كان العمود أو الفهرس موجودًا مسبقًا.
