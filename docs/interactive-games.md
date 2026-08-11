# نظام الألعاب التفاعلية في مدار

يدعم النظام طريقتين لإضافة الألعاب من حساب المعلمة:

1. إنشاء لعبة من قالب: اختيار من متعدد، صح أو خطأ، مطابقة، أو ترتيب.
2. فحص واستيراد لعبة مبرمجة على هيئة ZIP.

تبقى الشهادة والنقاط والنتائج والنشر والمشغّل مشتركة بين جميع الألعاب. كل حفظ جديد للعبة ينشئ إصدارًا مستقلًا، وتبقى المحاولات القديمة مرتبطة بالإصدار الذي شُغلت عليه.

## تهيئة قاعدة البيانات

ملف الترحيل المطلوب هو:

`database/migration_20260810_interactive_game_builder.sql`

لم يُشغّل الملف تلقائيًا. بعد أخذ نسخة احتياطية ومراجعته، يمكن تشغيله مرة واحدة من MAMP:

```bash
/Applications/MAMP/Library/bin/mysql80/bin/mysql -u root -p -h 127.0.0.1 -P 8889 madar < database/migration_20260810_interactive_game_builder.sql
```

استبدلي `madar` باسم قاعدة البيانات الفعلي، وأدخلي كلمة مرور MySQL عند طلبها.

## بنية حزمة ZIP

يجب أن يكون `game.json` في المستوى الرئيسي للحزمة، وأن تكون جميع الملفات محلية داخل ZIP بمسارات نسبية.

```text
game.json
index.html
game.css
game.js
images/
  cover.png
```

مثال `game.json`:

```json
{
  "schemaVersion": 1,
  "key": "unique-game-key",
  "name": "اسم اللعبة",
  "entry": "index.html",
  "runtime": "madar-game-bridge-v1"
}
```

- `key`: معرّف فريد بحروف إنجليزية صغيرة وأرقام وشرطة.
- `entry`: ملف HTML موجود داخل الحزمة.
- `runtime`: يجب أن يكون `madar-game-bridge-v1`.

## واجهة الربط

تتصل اللعبة بالمشغّل الخارجي من خلال `MadarGameBridge` فقط:

```js
const config = await MadarGameBridge.ready();
const run = await MadarGameBridge.startRound("easy", 10);

await MadarGameBridge.submitAnswer({
  questionKey: "q1",
  answer: "إجابة الطالبة",
  correct: true,
  points: 10,
  durationMs: 4200
});

const result = await MadarGameBridge.finishRound({
  score: 80,
  maxScore: 100,
  correctCount: 8,
  questionCount: 10,
  bestStreak: 4,
  durationSeconds: 95
});

if (result.certificate) {
  await MadarGameBridge.requestCertificate();
}
```

لا تصل اللعبة المستوردة إلى جلسة المستخدم أو Cookies أو CSRF، ولا تستدعي API مدار مباشرة. تُعرض داخل `iframe` معزول، ويتولى المشغّل العام فقط بدء الجولة وتسجيل الإجابات والنتيجة وإظهار الشهادة.

نتائج القوالب يتحقق منها الخادم من الإجابة الصحيحة المحفوظة. نتائج ZIP تُوسم بوضوح بأنها `package_reported` لأنها واردة من منطق الحزمة، ولا تختلط مع `server_verified` في التحليل.

## قواعد الفحص الأمني

- الحد الأقصى لحجم ZIP: 20 ميجابايت.
- الحد الأقصى: 200 ملف و50 ميجابايت بعد فك الضغط.
- تُرفض PHP والملفات التنفيذية والامتدادات المزدوجة والروابط الرمزية والمسارات المخفية أو الخارجة من الحزمة.
- تُرفض الروابط الخارجية وCDN واتصالات الشبكة والتخزين المحلي والتنقّل المباشر من الحزمة.
- الأنواع المسموحة: HTML وCSS وJavaScript وJSON والصور والأصوات والخطوط المحددة في الفاحص.
- لا يمكن نشر الحزمة حتى تكون حالتها `ready` وتستخدم واجهة الربط المعتمدة.

## نموذج جاهز

النموذج القابل للفحص والاستيراد موجود في:

`examples/interactive-games/fractions-challenge.zip`

مجلد المصدر الخاص به:

`games/fractions/`

بيانات الوحدة والدرس والمرحلة والصف والترم لا توضع داخل الحزمة كقيم وهمية؛ تدخلها المعلمة عند الاستيراد وتُحفظ مع اللعبة وإصدارها ونشرها.
