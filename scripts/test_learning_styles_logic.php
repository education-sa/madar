<?php
declare(strict_types=1);
require_once __DIR__ . '/../api/learning_styles.php';

$questions = learning_style_questions();
if (count($questions) !== 10) {
    fwrite(STDERR, "فشل: عدد الأسئلة ليس 10.\n");
    exit(1);
}
$styles = ['visual','auditory','reading_writing','kinesthetic'];
foreach ($questions as $question) {
    if (count($question['options'] ?? []) !== 4) {
        fwrite(STDERR, "فشل: كل سؤال يجب أن يحتوي أربعة خيارات.\n");
        exit(1);
    }
    $optionStyles = array_column($question['options'], 'style');
    sort($optionStyles);
    $expected = $styles;
    sort($expected);
    if ($optionStyles !== $expected) {
        fwrite(STDERR, "فشل: كل سؤال يجب أن يمثل الأنماط الأربعة مرة واحدة.\n");
        exit(1);
    }
}
if (learning_style_dominant_result(['visual'=>5,'auditory'=>2,'reading_writing'=>2,'kinesthetic'=>1]) !== 'visual') {
    fwrite(STDERR, "فشل: حساب النمط البصري.\n");
    exit(1);
}
if (learning_style_dominant_result(['visual'=>3,'auditory'=>3,'reading_writing'=>2,'kinesthetic'=>2]) !== 'mixed') {
    fwrite(STDERR, "فشل: احتساب النمط المختلط عند التعادل.\n");
    exit(1);
}
echo "نجح اختبار استبانة أنماط التعلم: 10 أسئلة، 4 خيارات، وحساب النتيجة سليم.\n";
