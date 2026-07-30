<?php
declare(strict_types=1);

final class AiQuestionGenerator
{
    public static function configured(): bool
    {
        return (bool) env_value('AI_API_URL') && (bool) env_value('AI_API_KEY') && (bool) env_value('AI_MODEL');
    }

    public static function generate(array $spec): array
    {
        if (!self::configured()) {
            Http::json([
                'error' => 'توليد الأسئلة بالذكاء الاصطناعي غير مفعّل. أضيفي AI_API_URL وAI_API_KEY وAI_MODEL في إعدادات الخادم، أو أنشئي الأسئلة يدويًا.',
                'code' => 'AI_NOT_CONFIGURED',
            ], 503);
        }

        $count = min(20, max(1, (int) ($spec['count'] ?? 5)));
        $allowedTypes = array_values(array_intersect($spec['types'] ?? ['mcq'], ['mcq', 'true_false', 'short_answer']));
        if (!$allowedTypes) {
            $allowedTypes = ['mcq'];
        }

        $prompt = 'أنت خبيرة مناهج رياضيات سعودية. أنشئي أسئلة عربية دقيقة وفق المواصفات التالية: ' .
            json_encode([
                'المرحلة' => $spec['stage'] ?? '',
                'الصف' => $spec['gradeLabel'] ?? '',
                'الفصل' => $spec['classLabel'] ?? 'كل الفصول',
                'الترم' => $spec['termLabel'] ?? '',
                'نمط التصميم' => $spec['designMode'] ?? 'ai',
                'الموضوع' => $spec['topic'] ?? '',
                'المهارة' => $spec['skillName'] ?? '',
                'الصعوبة' => $spec['difficulty'] ?? 'medium',
                'العدد' => $count,
                'الأنواع المسموحة' => $allowedTypes,
            ], JSON_UNESCAPED_UNICODE) .
            '. أعيدي JSON فقط بالشكل {"questions":[{"type":"mcq","questionText":"...","options":["..."],"correctAnswer":"...","explanation":"...","points":1}]}. ' .
            'في الاختيار المتعدد اجعلي 4 خيارات وإجابة واحدة مطابقة حرفيًا لأحد الخيارات. وفي الصح والخطأ استخدمي الإجابة "صح" أو "خطأ".';

        $payload = [
            'model' => env_value('AI_MODEL'),
            'messages' => [
                ['role' => 'system', 'content' => 'أنت مولّد بنك أسئلة رياضيات موثوق. لا تكتب أي نص خارج JSON.'],
                ['role' => 'user', 'content' => $prompt],
            ],
            'temperature' => 0.25,
            'response_format' => ['type' => 'json_object'],
        ];

        $ch = curl_init((string) env_value('AI_API_URL'));
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . env_value('AI_API_KEY'),
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status < 200 || $status >= 300) {
            error_log("AI generation failed: HTTP {$status} {$error}");
            Http::json(['error' => 'تعذّر توليد الأسئلة الآن. حاولي لاحقًا أو استخدمي الإنشاء اليدوي.'], 502);
        }

        $outer = json_decode((string) $response, true);
        $content = $outer['choices'][0]['message']['content'] ?? $outer['output_text'] ?? null;
        $decoded = is_string($content) ? json_decode($content, true) : $outer;
        $questions = $decoded['questions'] ?? [];
        if (!is_array($questions)) {
            Http::json(['error' => 'أعاد مزود الذكاء الاصطناعي بيانات غير صالحة. لم يتم حفظ أي سؤال.'], 502);
        }

        $clean = [];
        foreach (array_slice($questions, 0, $count) as $question) {
            $type = $question['type'] ?? 'mcq';
            $text = trim((string) ($question['questionText'] ?? ''));
            $answer = trim((string) ($question['correctAnswer'] ?? ''));
            if (!in_array($type, $allowedTypes, true) || $text === '' || $answer === '') {
                continue;
            }
            $options = is_array($question['options'] ?? null) ? array_values(array_map('strval', $question['options'])) : null;
            if ($type === 'mcq' && (count($options ?? []) < 2 || !in_array($answer, $options, true))) {
                continue;
            }
            $clean[] = [
                'type' => $type,
                'questionText' => $text,
                'options' => $options,
                'correctAnswer' => $answer,
                'explanation' => trim((string) ($question['explanation'] ?? '')),
                'points' => max(0.5, min(20, (float) ($question['points'] ?? 1))),
            ];
        }
        if (!$clean) {
            Http::json(['error' => 'لم يجتز أي سؤال فحص الجودة. لم يتم حفظ شيء.'], 502);
        }
        return $clean;
    }
}

