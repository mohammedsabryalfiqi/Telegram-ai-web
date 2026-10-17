# Alfiqi Control — لوحة متابعة ونسخ احتياطي لبوت تليجرام

لوحة تحكم كاملة (تشبه ChatPlace) لبوت **SmarTel / Tg-bot-ai** تعمل **بشكل مستقل تمامًا** عن خدمة البوت،
فتظل بياناتك ونسخك الاحتياطية في مكانٍ ثانٍ آمن حتى لو ضاع Volume سيرفر Railway أو تعطّلت الخدمة.

> **الفكرة باختصار:** البوت يعمل على Railway بمساحة تخزين `storage/smartel.db`.
> هذه اللوحة تعيش في مشروع/سيرفر آخر، تستقبل نسخة موثوقة (ZIP) من قاعدة البيانات والملفات كل ٦ ساعات،
> تحفظها محليًا **و** على تخزين S3 مستقل (Cloudflare R2 / Backblaze B2 / AWS)،
> وتجهّز لك حزمة استعادة جاهزة بضغطة واحدة.

---

## المحتويات

- [المزايا](#المزايا)
- [لقطة سريعة على الواجهة](#لقطة-سريعة-على-الواجهة)
- [التشغيل السريع](#التشغيل-السريع)
- [النشر على Railway](#النشر-على-railway)
- [ربط البوت باللوحة (الوكيل)](#ربط-البوت-باللوحة-الوكيل)
- [النسخ الاحتياطي والاستعادة](#النسخ-الاحتياطي-والاستعادة)
- [التخزين السحابي S3](#التخزين-السحابي-s3)
- [بنية المشروع](#بنية-المشروع)
- [واجهة الـ API](#واجهة-الـ-api)
- [الأمان](#الأمان)
- [أسئلة شائعة](#أسئلة-شائعة)

---

## المزايا

**لوحة متابعة شبيهة بـ ChatPlace**
- شريط جانبي بمجموعات: *الأسئلة / الإدارة / إضافة معلومات*، مع شارة عدد الأسئلة غير المجابة.
- تبديل بين مساحات العمل (بوتات متعددة)، دون الادعاء أن الموقع يوقف بوت Telegram أو يشغّله.
- عدد ردود المساعد المسجّلة هذا الشهر في آخر نسخة، وليس رصيدًا لدى مزوّد الذكاء الاصطناعي.
- بطاقات KPI: المحادثات، المستخدمون، الأسئلة غير المجابة، ردود الذكاء الاصطناعي، مع نسب التغيّر الأسبوعية.
- رسم حركة الرسائل (واردة/صادرة) آخر ٣٠ يومًا، أكثر الأسئلة تكرارًا، وأحدث المحادثات.

**تحليلات من آخر نسخة لقاعدة البوت**
- عدد المحادثات، المستخدمين، الرسائل، الردود، الأسئلة المعلّقة، الموافقات، الملفات، القواعد، الموارد…
- تقارير ٧ / ١٤ / ٣٠ / ٩٠ يومًا مع مقارنة بالفترة السابقة.

**تحرير المحتوى الذي يتعلم منه البوت**
- **التدريب:** اسم المساعد، وصف دوره، النبرة، لغة الرد، تعليمات مخصصة، مفاتيح التشغيل (رد تلقائي، موافقة، قاعدة معرفة صارمة…)، وأسئلة شائعة سريعة.
- **قاعدة المعرفة:** إضافة نص أو رفع PDF/DOCX/TXT/MD، وحذف العناصر.
- **قواعد الموضوعات:** إضافة/تعديل/تعطيل قواعد ردودك.
- **المصادر:** روابط، قنوات تليجرام، أو نصوص جاهزة.
- **الأسئلة غير المجابة:** الرد على السؤال (يتحوّل إلى FAQ في البوت) أو تجاهله.
- تعديلات اللوحة تُحفظ في **طابور تغييرات** يطبّقها الوكيل على قاعدة البوت (بدون لمس يدوي).

**الاختبار**
- محادثة تجريبية (Playground) مع البوت، **بمحاكاة محلية** من FAQ/القواعد عندما لا يوجد مفتاح AI، أو عبر مزوّد AI حقيقي عند إضافته.
- إرسال رسالة وتخزين سجل الاختبارات.

**النسخ الاحتياطي والاستعادة (قلب المشروع)**
- استقبال نسخ ZIP من الوكيل بمفتاح `bk_…` (يُخزَّن مُهشّرًا فقط).
- نسخ محلية + **S3/R2** اختياري، مع سياسة احتفاظ (عدد النسخ/الأيام).
- التحقق التلقائي من سلامة الأرشيف و`PRAGMA integrity_check`.
- حزمة استعادة = الأرشيف + دليل عربي خطوة بخطوة.
- سجل استعادة، وتنزيل أي نسخة، وحذف، وتدوير المفتاح.
- الوكيل يستطيع أيضًا **إرجاع تغييرات اللوحة** إلى قاعدة البوت (`--pull-changes`).

**تشغيل وإدارة**
- تثبيت لأول مرة (Owner account)، دخول بالبريد وكلمة المرور، جلسات JWT في كوكي HttpOnly.
- إعدادات النظام والتخزين واختبار اتصال S3، وسجل أحداث.
- واجهة عربية RTL افتراضيًا مع تبديل كامل للإنجليزية.

---

## لقطة سريعة على الواجهة

شريط جانبي + حالة البوت + بطاقات + شريط AI limit، بنفس ترتيب أقسام ChatPlace:

```
الأسئلة        Training · Analytics · Testing · Knowledge Base · Topic Rules · Unanswered
الإدارة        Backups · Resources · Actions · Commands · Settings
إضافة معلومات  Files · Text
```

---

## التشغيل السريع

### محليًا (Python 3.11+ و Node 20+)

```bash
git clone <this-repo> alfiqi-control && cd alfiqi-control

python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

cd frontend && npm ci && npm run build && cd ..

cd backend
DATA_DIR=../data ADMIN_EMAIL=admin@alfiqi.com ADMIN_PASSWORD='ChangeMe!2026' python run.py
# → http://localhost:8000
```

> بدون `ADMIN_EMAIL/ADMIN_PASSWORD` ستفتح اللوحة شاشة **الإعداد الأول** لإنشاء حساب المالك.

للتطوير مع Hot Reload:

```bash
# طرفية 1
cd backend && DATA_DIR=../data ../.venv/bin/python run.py
# طرفية 2
cd frontend && npm run dev     # http://localhost:5173 ويوجّه /api إلى :8000
```

### Docker

```bash
cp .env.example .env        # عدّل ADMIN_EMAIL / ADMIN_PASSWORD
docker compose up -d --build
# اللوحة على http://localhost:8000
```

لتجربة S3 محليًا (MinIO):

```bash
docker compose --profile s3 up -d      # API :9000 — Console :9001
```

ثم من **Settings → Storage**: Endpoint `http://minio:9000`، Bucket `alfiqi-backups`،
Access/Secret من `MINIO_ROOT_USER/PASSWORD`.

---

## النشر على Railway

1. ارفع هذا المستودع إلى GitHub.
2. Railway → **New Project → Deploy from GitHub repo** → اختر المستودع (Dockerfile يُكتشف تلقائيًا).
3. أضف **Volume** واربطه بالمسار `/app/data` (فيه قاعدة اللوحة + النسخ المحلية).
4. أضف المتغيرات:

   | المتغير | القيمة |
   |---|---|
   | `ADMIN_EMAIL` | بريدك |
   | `ADMIN_PASSWORD` | كلمة مرور قوية |
   | `ADMIN_NAME` | اسمك |
   | `APP_URL` | رابط الخدمة بعد توليده (مثال `https://alfiqi-control.up.railway.app`) |
   | `COOKIE_SECURE` | `1` |
   | `DEMO_SEED` | `0` (افتراضي؛ لا تنشئ بيانات تجريبية) |

5. من **Settings → Networking** اعمل **Generate Domain**.
6. افتح الرابط وسجّل الدخول، ثم **Backups → ربط الوكيل** لنسخ أمر التشغيل.

> ⚠️ مهم: ضع اللوحة في **مشروع Railway منفصل** عن البوت (أو على أي VPS).
> السبب: لو Volume البوت ضاع أو SERVICE اتحذف، اللوحة تفضل شغالة ونسخك سليمة.
> ولنفس السبب يُنصح بتفعيل **S3/R2** — نسخة ثالثة خارج Railway بالكامل.

الدليل التفصيلي خطوة بخطوة: **[DEPLOY.md](DEPLOY.md)**. ولربط البوت الموجود بالفعل، اتبع **[BOT_INTEGRATION.md](BOT_INTEGRATION.md)**.

---

## ربط البوت باللوحة (الوكيل)

الوكيل ملف واحد بلا أي اعتماديات (`agent/backup_agent.py`) يعمل بجانب البوت:

```bash
# تشغيل دائم (يفحص كل 6 ساعات ويسحب تغييرات اللوحة كل دقيقة)
python agent/backup_agent.py \
  --site https://alfiqi-control.up.railway.app \
  --key bk_1_xxxxxxxx \
  --storage /app/storage \
  --interval 21600 --pull-changes 60

# أو نسخة واحدة (Cron / GitHub Action / Railway Cron على نفس الـ Volume)
python agent/backup_agent.py --site ... --key ... --storage /app/storage --once
```

- ينسخ كل ملفات SQLite عبر **Online Backup API** (آمن أثناء عمل البوت) + مجلدات `uploads` و`vector_store`.
- يحسب SHA-256، ويرفع عبر HTTPS، ويعيد المحاولة ٣ مرات، ويكتب `manifest.json` داخل الأرشيف.
- `--pull-changes 60` يطبّق تعديلات اللوحة (FAQ/إعدادات/قواعد) على قاعدة البوت تلقائيًا.
- `--no-apply` إن أردت النسخ فقط دون مزامنة.

أمر التشغيل الجاهز يظهر داخل اللوحة (Backups / Actions) ومعه المفتاح.

---

## النسخ الاحتياطي والاستعادة

| المصدر | ماذا يحمي منه |
|---|---|
| نسخة محلية داخل `data/backups` | حذف/تلف قاعدة البوت، أخطاء التحديث |
| S3 / R2 خارج Railway | فقدان Volume أو حذف المشروع بالكامل |
| حزمة الاستعادة + التوجيه | استعادة واضحة لأي شخص دون خبرة |

**استعادة سريعة:**

```bash
# 1) نزّل حزمة الاستعادة من اللوحة (تحتوي ZIP + RESTORE.md)
# 2) أوقف البوت مؤقتًا على Railway
python agent/backup_agent.py --restore restore-bundle.zip --storage /app/storage
# 3) شغّل البوت، ثم تحقق:
sqlite3 /app/storage/smartel.db "PRAGMA integrity_check;"
```

**تحقق دوري (Restore Drill):** اضغط *تحقق* بجانب أي نسخة؛ اللوحة تفحص CRC
و`integrity_check` وتحدّث عدد الجداول. الأفضل تجربة الاستعادة على بيئة تجريبية مرة شهريًا.

**سياسة الاحتفاظ:** من Settings → عام (آخر 40 نسخة افتراضيًا + 30 يومًا). النسخ المرفوعة إلى S3
لا تتأثر بالحذف المحلي، وتظل متاحة للاستعادة.

---

## التخزين السحابي S3

يدعم أي خدمة متوافقة مع S3:

```
Cloudflare R2   endpoint: https://<account-id>.r2.cloudflarestorage.com   region: auto
Backblaze B2    endpoint: https://s3.<region>.backblazeb2.com             region: <region>
AWS S3          endpoint: (اتركه فارغًا)                                  region: eu-central-1
MinIO (محلي)    endpoint: http://minio:9000                               region: us-east-1
```

أدخل البيانات من **Settings → التخزين → اختبار الاتصال** (يفحص الكتابة والقراءة والحذف).

---

## بنية المشروع

```
backend/
  app/
    main.py          FastAPI + خدمة واجهة React المبنية
    routers/         auth · bots · ingest · snapshots · dashboard · ai · admin
    services/        storage(S3) · backup · analytics · scheduler · changes · ai_client · demo
    security.py      JWT + PBKDF2 + تشفير أسرار S3/AI
  requirements.txt   run.py
frontend/
  src/pages/         Overview · Analytics · Training · Testing · Knowledge · Rules
                     Unanswered · Backups · Resources · Actions · Commands · Settings
  src/layout/        AppShell (شريط جانبي/حالة/AI limit)
agent/backup_agent.py  وكيل النسخ والمزامنة (stdlib فقط)
Dockerfile · docker-compose.yml · railway.json
```

بيانات اللوحة كلها تحت `DATA_DIR`:

```
data/
  control.db           المستخدمون، البوتات، النسخ، الإعدادات، الأحداث
  secret.key           مفتاح تشفير الأسرار (أو APP_SECRET)
  backups/<id>/*.zip   النسخ
  workspaces/bot-N/    قاعدة البوت الحالية المستخرجة للتحليل
```

---

## واجهة الـ API

جميع المسارات تحت `/api` وتتطلب جلسة، ما عدا المُعلَّم.

| الطريقة | المسار | الوظيفة |
|---|---|---|
| POST | `/setup` | إنشاء المالك (أول مرة) |
| POST | `/login` · `/logout` | الدخول والخروج |
| GET | `/bootstrap` · `/status` | المستخدم الحالي وحالة التثبيت |
| GET/POST | `/bots` | قائمة/إنشاء مساحة عمل (يعيد مفتاح الوكيل مرة واحدة) |
| PATCH/DELETE | `/bots/{id}` | حالة البوت (نشط/متوقف)، حذف |
| POST | `/bots/{id}/key` | تدوير مفتاح الوكيل |
| GET | `/bots/{id}/overview` | كل مؤشرات الصفحة الرئيسية |
| GET | `/bots/{id}/analytics?days=30` | تحليلات فترة |
| GET/PATCH | `/bots/{id}/settings` | إعدادات التدريب |
| GET/POST/DELETE | `/bots/{id}/faq` | الأسئلة الشائعة |
| GET/POST/DELETE | `/bots/{id}/kb…` | قاعدة المعرفة (نص/ملف) |
| GET/POST/PATCH/DELETE | `/bots/{id}/rules` | قواعد الموضوعات |
| GET/POST | `/bots/{id}/unanswered…` | الأسئلة غير المجابة والرد عليها |
| GET/POST/PATCH/DELETE | `/bots/{id}/resources` | المصادر |
| GET | `/bots/{id}/snapshots` | سجل النسخ |
| POST | `/bots/{id}/snapshots/upload` | رفع ZIP يدويًا |
| POST | `/snapshots/{id}/verify` | فحص السلامة |
| POST | `/snapshots/{id}/restore` | تجهيز استعادة + دليل |
| GET | `/snapshots/{id}/download` · `/restore-package` | تنزيل النسخة/الحزمة |
| **POST** | **`/ingest`** | **استقبال نسخة من الوكيل (X-Backup-Key)** |
| GET/POST | `/agent/changes` · `/agent/changes/ack` | طابور تغييرات البوت |
| GET | `/agent/hello` · POST `/agent/heartbeat` | حضور الوكيل |
| GET/PUT | `/ai/config` | إعدادات مزوّد الذكاء الاصطناعي |
| POST | `/ai/simulate` · `/ai/chat` | تجربة محلية أو حقيقية |
| GET/PUT | `/settings…` · POST `/settings/storage/test` | إعدادات النظام وS3 |
| GET | `/system` · `/events` | صحة النظام وسجل الأحداث |

---

## الأمان

- كلمات المرور: PBKDF2-HMAC-SHA256 (260k) مع Salt عشوائي لكل مستخدم.
- الجلسات: JWT موقّع HS256 داخل كوكي `HttpOnly` + `SameSite=Lax`، ومدة 14 يومًا.
- مفاتيح الوكيل تُخزَّن **مُهشّرة** (SHA-256) وتُعرض مرة واحدة فقط عند الإنشاء.
- أسرار S3 ومفاتيح AI مشفّرة بـ Fernet بمفتاح مشتق من `secret.key` / `APP_SECRET`.
- حماية من Zip Slip، حد أقصى للرفع، فحص `integrity_check` قبل أي استعادة، وحد لمحاولات الدخول.
- في الإنتاج: `COOKIE_SECURE=1`، واستخدم HTTPS، وغيّر كلمة المرور الافتراضية.

---

## أسئلة شائعة

**هل أحتاج لتعديل كود البوت؟**
لا. الوكيل ملف مستقل يعمل بجانب البوت ويقرأ مجلد `storage`. تعديلات اللوحة تُطبَّق على قاعدة
البوت من خلال نفس الوكيل (اختياري).

**أين تُحفظ النسخ إذا كان Volume البوت قد ضاع؟**
داخل مشروع اللوحة (`/app/data`) **و** في S3/R2 إن فعّلته. اللوحة لا تعتمد على Volume البوت إطلاقًا.

**هل يعمل مع بوتات أخرى غير SmarTel؟**
التحليلات مبنية على مخطط SMARTEL (customers/messages/faq_entries/kb_items…). يمكن تعديل
`backend/app/services/analytics.py` لمخطط مختلف، بينما النسخ والاستعادة تعمل مع أي SQLite + ملفات.

**النسخ لا تصل — ماذا أفحص؟**
1) `--key` صحيح وغير مُدوَّر. 2) `/api/ingest` متاح من حاوية البوت (جرّب `curl`). 3) حجم الملف
أقل من `MAX_UPLOAD_MB`. 4) راجع Actions → حالة النظام وسجل الأحداث.

---

صُنع لـ **SmarTel / Alfiqi AI** — يعمل بالعربية والإنجليزية.
