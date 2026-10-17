"""Demo workspace so the dashboard is alive on first launch.

Builds small SMARTEL-compatible SQLite snapshots (same tables/columns the bot
uses) and registers them through the normal backup pipeline. Delete the demo bot
from the UI once your real bot is connected.
"""

from __future__ import annotations

import json
import random
import sqlite3
import tempfile
import zipfile
from datetime import timedelta
from pathlib import Path

from .. import db
from ..util import now, now_iso
from .backup import register_snapshot

_RNG = random.Random(20261017)

NAMES = [
    ("أحمد المصري", "ahmed_masry"), ("سارة عبد الله", "sara_abdullah"), ("محمد الشامي", "moh_shamy"),
    ("نورهان حسن", "nourhan_h"), ("يوسف الدمياطي", "youssef_d"), ("مريم إبراهيم", "mariam_ib"),
    ("خالد سمير", "khaled_samir"), ("هبة مصطفى", "heba_m"), ("عمر الفاروق", "omar_farouk"),
    ("دينا أشرف", "dina_ashraf"), ("طارق العزب", "tarek_azab"), ("سلمى رشاد", "salma_r"),
    ("إسلام فتحي", "islam_fathy"), ("آية محمود", "aya_mahmoud"), ("باسم علي", "basem_ali"),
    ("فرح عمرو", "farah_amr"), ("زياد ناصر", "ziad_nasser"), ("مي كمال", "mai_kamal"),
    ("حسام الدين", "hossam_din"), ("رقية سعد", "roqaya_saad"), ("أمير وجدي", "amir_wagdy"),
    ("ليلى منصور", "laila_mansour"), ("شريف عادل", "sherif_adel"), ("ندى إيهاب", "nada_ehab"),
]

EXTRA_NAMES = [
    "مصطفى عادل", "إيمان صبري", "كريم فؤاد", "أمنية رضا", "حمزة مصطفى",
    "سمر حسين", "أحمد فتحي", "نرمين سمير", "عمرو خالد", "ريهام عصام",
    "شادي مجدي", "بسمة صلاح", "تامر رمضان", "دعاء محمود", "محمود عبد العال",
    "هند شوقي", "ياسر الجوهري", "منى عاطف", "أيمن الشربيني", "سوزان فؤاد",
    "رامي عادل", "شيماء طارق", "علي زين", "فاطمة السيد", "حسن عليوة",
    "نادية سمير", "مينا رأفت", "إسراء أشرف", "خالد منصور", "ياسمين وليد",
]

CONVERSATIONS = [
    {
        "customer": "أحمد المصري",
        "messages": [
            ("in", "السلام عليكم، عندكم سفرة خشب زان مقاس 160؟"),
            ("out", "وعليكم السلام يا أستاذ أحمد 🌟\nأيوه متوفرة عندنا سفرة زان 160 سم، وبنعملها بمقاسات مختلفة برضه. تحب أعرفك على الأسعار؟"),
            ("in", "كام السعر النهاردة؟"),
            ("out", "سفرة زان 160 سم بالكراسي 8,500 جنيه، والتسليم خلال 10 أيام عمل."),
            ("in", "في تقسيط؟"),
            ("out", "بنقبل التقسيط عن طريق البنوك بس، مش بنقسط من عندنا. لو حابب أقولك على البنوك المتاحة؟"),
            ("in", "تمام، هتواصل معاك بكرة إن شاء الله"),
            ("out", "تحت أمرك يا فندم، في انتظارك 🙏"),
        ],
    },
    {
        "customer": "سارة عبد الله",
        "messages": [
            ("in", "هل يوجد توصيل لدمياط؟ وكام رسوم الشحن؟"),
            ("out", "أهلاً بيكي يا مدام سارة 🌸\nبنوصل لدمياط والمدن المجاورة. رسوم الشحن 60 جنيه، ومجاناً للطلبات فوق 3,000 جنيه."),
            ("in", "وصلت لحد فين؟ عايزة أعرف مواعيد التوصيل"),
            ("out", "التوصيل بيتم يوميًا من 10 صباحًا لـ 7 مساءً، ومعاكي مكالمة قبل الوصول بنص ساعة."),
            ("in", "تمام شكراً"),
            ("out", "العفو يا فندم، يومك سعيد 🌷"),
        ],
    },
    {
        "customer": "محمد الشامي",
        "messages": [
            ("in", "عايز أعرف الأسعار"),
            ("out", "أهلاً يا أستاذ محمد 👋\nالأسعار بتختلف حسب المقاس ونوع الخشب. قولّي المنتج اللي مهتم بيه وأنا أبعثلك السعر بالتحديد."),
            ("in", "غرفة نوم كاملة"),
            ("out", "غرف النوم عندنا بتختلف حسب المقاس والتصميم. الأسعار بتبدأ من 18,000 جنيه، ولو تحب نعمل تصميم خاص؟"),
            ("in", "بص، محتاج أعرف لو في خصم على الكاش"),
            ("out", "في خصم 5% على الدفع الكاش، بس لازم أتأكد من المتاح قبل ما أوعدك بحاجة."),
        ],
    },
    {
        "customer": "نورهان حسن",
        "messages": [
            ("in", "هل بتصنعوا أثاث حسب الطلب؟"),
            ("out", "أيوه، بنصمم ونصنع حسب الطلب 🛠️\nابعتيلي المقاسات أو صورة التصميم وأنا أرد عليك بالتكلفة والمدة."),
            ("in", "عندي صورة هبعتها"),
            ("out", "تمام، في انتظار الصورة، وبعدها هقولك كل التفاصيل."),
        ],
    },
    {
        "customer": "يوسف الدمياطي",
        "messages": [
            ("in", "السلام عليكم، الطلب رقم 1042 اتأخر عن الميعاد"),
            ("out", "وعليكم السلام يا أستاذ يوسف، أعتذر بشدة عن التأخير 🙏\nهحاول أتابع مع فريق التوريد وأرد عليك بالتفاصيل خلال ساعة."),
            ("in", "أنا محتاج أعرف السبب بصراحة"),
            ("out", "أتفهم انزعاجك تمامًا. سأراجع حالة الطلب مع المسؤول وأرجعللك بمعلومات واضحة، مش هسيبك من غير رد."),
            ("in", "طيب مستني"),
        ],
    },
    {
        "customer": "مريم إبراهيم",
        "messages": [
            ("in", "بكام المرتبة الطبية مقاس 160؟"),
            ("out", "المرتبة الطبية 160 سم بسعر 2,300 جنيه، وبضمان 5 سنوات على السوست."),
            ("in", "غالية شوية، في أرخص؟"),
            ("out", "فيه موديل اقتصادي بـ 1,750 جنيه، هبعثلك الفرق بينهم لو حابة."),
            ("in", "ابعتلي الفروق"),
            ("out", "الفرق في كثافة السوست والمتانة: الموديل الأغلى بضمان أطول وكثافة أعلى. لو الاستخدام يومي، أنصحك بالأغلى على المدى الطويل."),
        ],
    },
    {
        "customer": "خالد سمير",
        "messages": [
            ("in", "مواعيد العمل إمتى؟"),
            ("out", "بنفتح كل يوم من 10 صباحًا لـ 9 مساءً، ما عدا الجمعة من 2 العصر."),
            ("in", "فين المعرض بالظبط؟"),
            ("out", "المعرض في شارع الجيش، دمياط. لو حابب أبعتلك اللوكيشن على الخريطة؟"),
            ("in", "ابعت"),
            ("out", "تحت أمرك، هبعتهولك حالاً 📍"),
        ],
    },
    {
        "customer": "هبة مصطفى",
        "messages": [
            ("in", "في ألوان تانية غير البني؟"),
            ("out", "أيوه، عندنا بيج، رمادي، وأبيض مطفي. اللون بيأثر على السعر في بعض الموديلات."),
            ("in", "عايزة أشوف صور"),
            ("out", "هبعتلك صور للألوان المتاحة، ولو حابة تزوري المعرض تشوفي العينات على الطبيعة."),
        ],
    },
    {
        "customer": "عمر الفاروق",
        "messages": [
            ("in", "عايز أعمل مطبخ حسب الطلب، بتعملوا؟"),
            ("out", "أيوه بنعمل مطابخ ألوميتال و MDF حسب الطلب ✨\nالمقاس بيبدأ من 3 متر، والتسليم 3 أسابيع تقريبًا."),
            ("in", "ممكن أعرف متوسط التكلفة للمتر؟"),
            ("out", "متوسط المتر بيبدأ من 2,800 جنيه حسب الخامات والإكسسوارات. لو بعتلي المقاسات أقدر أديك رقم أدق."),
            ("in", "تمام هجيب المقاسات"),
        ],
    },
    {
        "customer": "دينا أشرف",
        "messages": [
            ("in", "الطلب وصل بس فيه خدش في الدولاب"),
            ("out", "أعتذر جدًا يا مدام دينا 😔\nمن فضلك ابعتيلي صورة للخدش ورقم الطلب، وهحوّله فورًا لخدمة ما بعد البيع."),
            ("in", "هبعت الصور"),
            ("out", "شكرًا ليكي، وبمجرد ما توصلني هيتحدد ميعاد الاستبدال أو الإصلاح."),
        ],
    },
    {
        "customer": "طارق العزب",
        "messages": [
            ("in", "في عروض على غرف الأطفال؟"),
            ("out", "فيه عرض الشهر ده على غرف الأطفال: خصم 10% على السرير + الدولاب مع بعض."),
            ("in", "العرض لحد امتى؟"),
            ("out", "العرض ساري لآخر الشهر أو حتى نفاد الكمية، وأنا مش بقدر أضمن توفّر الموديل لحد آخر يوم."),
        ],
    },
    {
        "customer": "سلمى رشاد",
        "messages": [
            ("in", "هل ممكن أدفع فيزا؟"),
            ("out", "أيوه، بنقبل فيزا وماستركارد والمحفظة الإلكترونية، وكمان التحويل البنكي."),
            ("in", "تمام، والفاتورة رسمية؟"),
            ("out", "أكيد، بنطلع فاتورة ضريبية رسمية مع كل طلب."),
        ],
    },
]

UNANSWERED = [
    ("هل نفس المقاس متاح باللون الرمادي؟", 0.2),
    ("هل عندكم فرع في المنصورة؟", 1),
    ("إيه موقف الضمان لو الخشب اتأثر بالرطوبة؟", 3),
    ("بتقبلوا شغل المقاولات بالجملة؟", 5),
    ("هل في إمكانية تغيير لون الأوردر بعد التأكيد؟", 8),
    ("عندكم خدمة تركيب في بورسعيد؟", 10),
    ("الخشب الزان بيتأثر بالشمس ولا لأ؟", 12),
    ("أقصى مدة تقسيط بنكي كام شهر؟", 14),
    ("هل الشحن ليبيا متاح؟", 16),
    ("في إمكانية استرجاع بعد التركيب؟", 21),
    ("هل بتوصلوا لمحافظة كفر الشيخ؟", 19),
    ("المرتبة بتيجي مقاس 180 ولا لأ؟", 18),
    ("لو الطلب اتأخر أكتر من شهر أعمل إيه؟", 17),
    ("عندكم أوض أطفال ولد وبنت؟", 15),
    ("هل الخشب بيتفك ويركب تاني؟", 13),
    ("بتعملوا صيانة بعد انتهاء الضمان؟", 11),
    ("ممكن أزور المخزن قبل الشراء؟", 9),
    ("في امكانية الدفع عند الاستلام؟", 7),
    ("بتبيعوا قطع غيار للمطابخ؟", 6),
    ("هل بتقبلوا طلبات من خارج مصر؟", 4),
    ("إيه أفضل نوع خشب للمطبخ؟", 2),
    ("عندكم كراسي مكتب؟", 1),
]

FAQ = [
    ("شحن، توصيل، رسوم، دمياط", "بنوصل دمياط والمدن المجاورة خلال 2-4 أيام عمل، والشحن 60 جنيه ومجاني فوق 3,000 جنيه.", "أسعار الشحن والتوصيل", 38),
    ("مواعيد، فتح، قافل، معرض", "المعرض مفتوح يوميًا من 10 صباحًا حتى 9 مساءً، والجمعة من 2 العصر حتى 9 مساءً.", "مواعيد العمل", 27),
    ("ضمان، صيانة، عيب", "جميع منتجاتنا بضمان سنة على التصنيع، والمراتب بضمان 5 سنوات على السوست.", "الضمان والصيانة", 21),
    ("فيزا، دفع، كاش، تقسيط", "بنقبل الكاش والفيزا والمحفظة الإلكترونية، وفيه خصم 5% للدفع الكاش.", "طرق الدفع", 18),
    ("عنوان، لوكيشن، فين", "المعرض في شارع الجيش، دمياط — بجوار مسجد البحر.", "عنوان المعرض", 14),
    ("مقاس، تفصيل، حسب الطلب", "بنصنّع حسب الطلب في خلال 10-21 يوم عمل حسب المنتج، وبعد اعتماد التصميم.", "التصنيع حسب الطلب", 11),
    ("أوردر، طلب، رقم", "للاستعلام عن طلبك ابعت رقم الطلب أو اسمك الكامل على نفس المحادثة.", "متابعة الطلبات", 9),
    ("فاتورة، ضريبة", "بنطلع فاتورة ضريبية رسمية مع كل طلب، ويمكن إرسالها PDF.", "الفواتير", 6),
]

RULES = [
    ("الأسعار", "لا تذكر أي سعر غير مذكور في قاعدة المعرفة أو قائمة الأسعار المعتمدة.", 1, "اسأل عن المقاس والمنتج قبل السعر."),
    ("الشحن", "التوصيل داخل دمياط 60 جنيه، ومجاني للطلبات فوق 3,000 جنيه.", 1, "لا تعِد بشحن مجاني خارج هذه الشروط."),
    ("الضمان", "الضمان سنة على التصنيع و5 سنوات على سوست المراتب.", 1, "لا تَعِد بضمان أطول."),
    ("الخصومات", "خصم 5% للدفع الكاش فقط، وأي خصم آخر يحتاج موافقة المالك.", 1, "لا تقدّم خصومات من عندك."),
    ("مواعيد التسليم", "10-21 يوم عمل حسب المنتج، ولا تعطي تاريخًا محددًا باليوم.", 1, "قل إنك ستؤكد الميعاد مع الفريق."),
    ("الشكاوى", "أي شكوى في تنفيذ الطلب تُحوّل للمالك فورًا مع اعتذار واضح.", 1, "لا تعتذر عن أمور مالية."),
    ("الاسترجاع", "الاسترجاع خلال 14 يوم بشرط عدم الاستخدام وسلامة التغليف.", 1, "لا توافق على استرجاع بعد التركيب."),
    ("التقسيط", "التقسيط عبر البنوك فقط، ولا يوجد تقسيط داخلي.", 1, "لا تذكر أسماء بنوك غير معتمدة."),
    ("المنصورة", "لا يوجد فرع للمعرض في المنصورة حاليًا.", 1, "لا تنفِ وجود فروع أخرى بدون تأكيد."),
    ("المطابخ", "المطابخ حسب الطلب، من 3 متر، و3 أسابيع تسليم.", 0, "اطلب المقاسات قبل السعر."),
    ("غرف الأطفال", "عرض الشهر: خصم 10% على السرير + الدولاب.", 0, "العرض محدود بالكمية."),
    ("الفاتورة", "فاتورة ضريبية رسمية مع كل طلب.", 0, "لا تطلب بيانات ضريبية من العميل."),
]

RESOURCES = [
    ("site", "الموقع الرسمي", "https://alfiqi.example.com", "أسعار المنتجات وألبومات الصور."),
    ("telegram", "قناة العروض على تليجرام", "https://t.me/alfiqi_offers", "عروض أسبوعية."),
    ("telegram", "جروب الدعم", "https://t.me/alfiqi_support", "متابعة الطلبات والشكاوى."),
    ("link", "كتالوج 2026 (PDF)", "https://alfiqi.example.com/catalog-2026.pdf", "كتالوج المنتجات الكامل."),
    ("text", "سياسة الاستبدال", "", "الاستبدال خلال 14 يومًا بشرط عدم الاستخدام."),
    ("text", "قائمة البنوك", "", "بنك مصر، CIB، الأهلي — تقسيط حتى 12 شهرًا."),
]

KB_ITEMS = [
    ("سياسة الشحن والتوصيل", "file", "shipping-policy.md", [
        "نوصل لدمياط والمدن المجاورة خلال 2-4 أيام عمل. رسوم الشحن 60 جنيهًا، ومجانًا للطلبات فوق 3,000 جنيه.",
        "يتم الاتصال بالعميل قبل التسليم بنصف ساعة. في حالة عدم التواجد، يُعاد المحاولة في اليوم التالي.",
    ]),
    ("قائمة الأسعار الأساسية", "text", None, [
        "سفرة زان 160 سم بالكراسي: 8,500 جنيه. غرف نوم تبدأ من 18,000 جنيه.",
        "مرتبة طبية 160 سم: 2,300 جنيه. موديل اقتصادي: 1,750 جنيه.",
        "مطابخ حسب الطلب تبدأ من 2,800 جنيه للمتر.",
    ]),
    ("الضمان والصيانة", "file", "warranty.pdf", [
        "ضمان سنة على التصنيع لكل المنتجات، و5 سنوات على سوست المراتب.",
        "الصيانة خلال 48 ساعة من الإبلاغ عن أي عيب في التصنيع.",
    ]),
    ("الأسئلة الشائعة — نسخة المعرض", "file", "faq-showroom.docx", [
        "المعرض في شارع الجيش، دمياط. مواعيد العمل 10 صباحًا - 9 مساءً.",
        "الدفع: كاش، فيزا، ماستركارد، محفظة إلكترونية. خصم كاش 5%.",
    ]),
    ("سياسة الاستبدال والاسترجاع", "text", None, [
        "الاسترجاع خلال 14 يومًا من الاستلام بشرط عدم الاستخدام وسلامة التغليف.",
        "لا يوجد استرجاع للمنتجات المصنوعة حسب الطلب بعد اعتماد التصميم.",
    ]),
]

CUSTOMER_LINES = [
    "السلام عليكم", "عندكم سفرة خشب زان؟", "كام السعر؟", "في توصيل لدمياط؟",
    "مواعيد العمل إمتى؟", "هل في ضمان؟", "عايز أعرف طرق الدفع", "ممكن أشوف كتالوج؟",
    "عايز أعمل طلب", "الطلب اتأخر شوية", "شكراً على الاهتمام",
]
ASSISTANT_LINES = [
    "أهلاً بيك 👋 تحت أمرك، أقدر أساعدك في إيه؟",
    "المنتج متوفر، وهبعتلك التفاصيل حالاً.",
    "تمام، هتأكد من المتاح وأرد عليك.",
    "شكراً لتواصلك، يومك سعيد 🌟",
]


def _schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
        CREATE TABLE business_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT, business_connection_id TEXT UNIQUE NOT NULL,
            business_user_id INTEGER, is_enabled INTEGER DEFAULT 1, can_reply INTEGER DEFAULT 1,
            created_at TEXT, updated_at TEXT);
        CREATE TABLE customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT, business_connection_id TEXT, customer_chat_id INTEGER,
            first_name TEXT, last_name TEXT, username TEXT, created_at TEXT, updated_at TEXT,
            UNIQUE(business_connection_id, customer_chat_id));
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, business_connection_id TEXT, customer_chat_id INTEGER,
            telegram_message_id INTEGER, direction TEXT, role TEXT, content TEXT, created_at TEXT);
        CREATE TABLE conversation_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT, business_connection_id TEXT, customer_chat_id INTEGER,
            role TEXT, content TEXT, created_at TEXT);
        CREATE TABLE paused_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT, business_connection_id TEXT, customer_chat_id INTEGER,
            reason TEXT, paused_until TEXT, created_at TEXT, UNIQUE(business_connection_id, customer_chat_id));
        CREATE TABLE pending_approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT, business_connection_id TEXT, customer_chat_id INTEGER,
            customer_message_id INTEGER, customer_message_text TEXT, ai_reply_text TEXT,
            status TEXT DEFAULT 'pending', created_at TEXT, decided_at TEXT);
        CREATE TABLE kb_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 0, title TEXT,
            source_type TEXT, filename TEXT, created_at TEXT, chunk_count INTEGER DEFAULT 0);
        CREATE TABLE kb_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, chunk_index INTEGER, content TEXT,
            embedding_json TEXT, created_at TEXT);
        CREATE TABLE faq_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 0,
            keywords TEXT NOT NULL DEFAULT '', question TEXT, answer TEXT NOT NULL DEFAULT '',
            enabled INTEGER DEFAULT 1, hits INTEGER DEFAULT 0, last_hit_at TEXT,
            created_at TEXT, updated_at TEXT);
        CREATE TABLE topic_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 0,
            topic TEXT NOT NULL DEFAULT '', rule TEXT NOT NULL DEFAULT '', priority INTEGER NOT NULL DEFAULT 100,
            enabled INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'owner',
            batch TEXT NOT NULL DEFAULT '', hits INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
        CREATE TABLE unanswered_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 0,
            business_connection_id TEXT, customer_chat_id INTEGER, question TEXT NOT NULL DEFAULT '',
            answer TEXT, status TEXT NOT NULL DEFAULT 'open', created_at TEXT, answered_at TEXT);
        CREATE TABLE resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 0,
            kind TEXT NOT NULL DEFAULT 'link', title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
            chars INTEGER NOT NULL DEFAULT 0, created_at TEXT);
        CREATE TABLE required_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 0,
            chat_ref TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', invite_link TEXT NOT NULL DEFAULT '',
            kind TEXT NOT NULL DEFAULT 'channel', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT);
        CREATE TABLE paid_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL DEFAULT 0,
            business_connection_id TEXT, customer_chat_id INTEGER NOT NULL, user_id INTEGER,
            payload TEXT NOT NULL DEFAULT '', charge_id TEXT NOT NULL DEFAULT '', stars INTEGER NOT NULL DEFAULT 0,
            message_text TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
            delivered INTEGER NOT NULL DEFAULT 0, created_at TEXT, paid_at TEXT);
        """
    )
    conn.commit()


def _ts(days_ago: float) -> str:
    moment = now() - timedelta(days=days_ago)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def _build_db(path: Path, cutoff_days: int = 0) -> None:
    rng = random.Random(20261017 + cutoff_days)
    conn = sqlite3.connect(path)
    _schema(conn)
    limit = now() - timedelta(days=cutoff_days)

    def inside(days_ago: float) -> bool:
        return (now() - timedelta(days=days_ago)) <= limit

    settings = {
        "business_name": "ألفقي ستور", "assistant_name": "مساعد ألفقي",
        "business_description": "معرض أثاث ومطابخ في دمياط — تصنيع حسب الطلب.",
        "tone": "friendly", "reply_language": "ar", "auto_reply_enabled": "true",
        "approval_mode_enabled": "false", "kb_enabled": "true", "strict_kb_mode": "false",
        "faq_enabled": "true", "rules_enabled": "true", "resources_enabled": "true",
        "unanswered_enabled": "true", "direct_reply_enabled": "true", "ai_provider": "google",
        "max_reply_chars": "900", "max_messages_per_customer_per_hour": "20",
        "custom_instructions": "رحّب بالعميل باسمه لو متاح، واسأله عن المقاس قبل السعر.",
        "signature": "", "disclose_ai": "false", "monitoring_mode": "true",
    }
    conn.executemany(
        "INSERT INTO settings(key, value, updated_at) VALUES (?,?,?)",
        [(key, value, _ts(30)) for key, value in settings.items()],
    )
    conn.execute(
        "INSERT INTO business_connections(business_connection_id, business_user_id, is_enabled, can_reply, created_at, updated_at) "
        "VALUES ('bc_demo_1', 5231453921, 1, 1, ?, ?)",
        (_ts(40), _ts(0.1)),
    )

    chat_base = 610000000
    # Conversations are spread over ~30 days, weighted towards the last two
    # weeks, so growth/trend figures look like a real business and not a spike.
    for index, conversation in enumerate(CONVERSATIONS):
        name = conversation["customer"]
        username = next((u for n, u in NAMES if n == name), "")
        chat_id = chat_base + index
        conv_days = 0.4 + index * 0.7 if index < 15 else 12 + (index - 15) * 2.0
        signup_days = conv_days + 0.5
        if cutoff_days and signup_days < cutoff_days:
            continue  # customer did not exist yet when this snapshot was taken
        conn.execute(
            "INSERT INTO customers(business_connection_id, customer_chat_id, first_name, last_name, username, created_at, updated_at) "
            "VALUES ('bc_demo_1', ?, ?, '', ?, ?, ?)",
            (chat_id, name, username, _ts(signup_days), _ts(conv_days)),
        )
        total_msgs = len(conversation["messages"])
        for msg_index, item in enumerate(conversation["messages"]):
            direction, role, text = item if len(item) == 3 else ("in", "user", item[1])
            days_ago = conv_days + (total_msgs - 1 - msg_index) * 0.16
            if cutoff_days and not inside(days_ago):
                continue
            conn.execute(
                "INSERT INTO messages(business_connection_id, customer_chat_id, telegram_message_id, direction, role, content, created_at) "
                "VALUES ('bc_demo_1', ?, ?, ?, ?, ?, ?)",
                (chat_id, 9000 + index * 20 + msg_index, direction, role, text, _ts(days_ago)),
            )

    # extra volume of short dialogs (keeps the charts alive without bloat)
    for index, name in enumerate(EXTRA_NAMES):
        chat_id = chat_base + 100 + index
        active_days = 0.3 + (index % 15) * 0.9 + (index // 15) * 3.5
        signup_days = active_days + 0.9
        if cutoff_days and signup_days < cutoff_days:
            continue
        conn.execute(
            "INSERT INTO customers(business_connection_id, customer_chat_id, first_name, last_name, username, created_at, updated_at) "
            "VALUES ('bc_demo_1', ?, ?, '', ?, ?, ?)",
            (chat_id, name, f"user{chat_id}", _ts(signup_days), _ts(active_days)),
        )
        count = 2 + index % 4
        for msg_index in range(count):
            direction = "in" if msg_index % 2 == 0 else "out"
            role = "user" if direction == "in" else "assistant"
            pool = CUSTOMER_LINES if direction == "in" else ASSISTANT_LINES
            text = pool[(index + msg_index) % len(pool)]
            days_ago = active_days + (count - 1 - msg_index) * 0.2
            if cutoff_days and not inside(days_ago):
                continue
            conn.execute(
                "INSERT INTO messages(business_connection_id, customer_chat_id, telegram_message_id, direction, role, content, created_at) "
                "VALUES ('bc_demo_1', ?, ?, ?, ?, ?, ?)",
                (chat_id, 9500 + index * 10 + msg_index, direction, role, text, _ts(days_ago)),
            )

    for index, (keywords, answer, question, hits) in enumerate(FAQ):
        conn.execute(
            "INSERT INTO faq_entries(tenant_id, keywords, question, answer, enabled, hits, last_hit_at, created_at, updated_at) "
            "VALUES (0,?,?,?,1,?,?,?,?)",
            (keywords, question, answer, hits if not cutoff_days else int(hits * 0.6),
             _ts(1 + index % 5), _ts(30), _ts(2)),
        )

    for index, (topic, rule, enabled, note) in enumerate(RULES):
        conn.execute(
            "INSERT INTO topic_rules(tenant_id, topic, rule, priority, enabled, source, batch, hits, created_at, updated_at) "
            "VALUES (0,?,?,?,?, 'owner', ?, ?, ?, ?)",
            (topic, rule + " " + note, 100 + index, enabled, f"batch-{index // 4}", rng.randint(0, 18),
             _ts(25), _ts(3)),
        )

    for index, (title, source_type, filename, chunks) in enumerate(KB_ITEMS):
        cursor = conn.execute(
            "INSERT INTO kb_items(tenant_id, title, source_type, filename, created_at, chunk_count) VALUES (0,?,?,?,?,?)",
            (title, source_type, filename, _ts(20 - index), len(chunks)),
        )
        item_id = cursor.lastrowid
        for chunk_index, text in enumerate(chunks):
            conn.execute(
                "INSERT INTO kb_chunks(item_id, chunk_index, content, embedding_json, created_at) VALUES (?,?,?,NULL,?)",
                (item_id, chunk_index, text, _ts(20 - index)),
            )

    for index, (kind, title, url, notes) in enumerate(RESOURCES):
        conn.execute(
            "INSERT INTO resources(tenant_id, kind, title, url, notes, enabled, chars, created_at) "
            "VALUES (0,?,?,?,?,1,?,?)",
            (kind, title, url, notes, rng.randint(300, 4000), _ts(18 - index)),
        )

    for index, (question, days_ago) in enumerate(UNANSWERED):
        if cutoff_days and not inside(days_ago):
            continue
        conn.execute(
            "INSERT INTO unanswered_questions(tenant_id, business_connection_id, customer_chat_id, question, answer, status, created_at) "
            "VALUES (0, 'bc_demo_1', ?, ?, NULL, 'open', ?)",
            (chat_base + index % 10, question, _ts(days_ago)),
        )
    for index, (question, _days) in enumerate(UNANSWERED[:4]):
        conn.execute(
            "INSERT INTO unanswered_questions(tenant_id, business_connection_id, customer_chat_id, question, answer, status, created_at, answered_at) "
            "VALUES (0, 'bc_demo_1', ?, ?, ?, 'answered', ?, ?)",
            (chat_base + index, question, "تم الرد من المالك وتخزين الإجابة كسؤال شائع.", _ts(9 + index), _ts(8 + index)),
        )

    approvals = [
        ("محتاج ألغي الطلب وأسترد المبلغ", "أعتذر عن الإزعاج، سأراجع حالة الطلب مع فريق خدمة العملاء وأرد عليك."),
        ("المنتج وصل مكسور، عايز تعويض", "أنا آسف جدًا للي حصل. هحوّل الموضوع فورًا للمسؤول."),
        ("ممكن خصم إضافي؟", "عندنا خصم 5% للدفع الكاش، وأي خصم إضافي يحتاج موافقة الإدارة."),
        ("هل ممكن تغيير العنوان بعد الشحن؟", "هتأكد من حالة الشحنة وأرد عليك بإمكانية التعديل."),
    ]
    for index, (customer_text, ai_text) in enumerate(approvals):
        conn.execute(
            "INSERT INTO pending_approvals(business_connection_id, customer_chat_id, customer_message_id, customer_message_text, ai_reply_text, status, created_at) "
            "VALUES ('bc_demo_1', ?, ?, ?, ?, 'pending', ?)",
            (chat_base + index, 7000 + index, customer_text, ai_text, _ts(0.2 + index * 0.1)),
        )

    conn.execute(
        "INSERT INTO paused_chats(business_connection_id, customer_chat_id, reason, paused_until, created_at) "
        "VALUES ('bc_demo_1', ?, 'owner_takeover', ?, ?)",
        (chat_base + 4, _ts(-0.2), _ts(0.1)),
    )
    for index in range(3):
        conn.execute(
            "INSERT INTO paid_messages(tenant_id, business_connection_id, customer_chat_id, user_id, payload, charge_id, stars, message_text, status, delivered, created_at, paid_at) "
            "VALUES (0,'bc_demo_1',?,?,?,?,?,'استفسار مدفوع','paid',1,?,?)",
            (chat_base + index, 5231453921, f"pay_{index}", f"charge_{index}", 50, _ts(3 + index), _ts(3 + index)),
        )
    conn.commit()
    conn.close()


def _make_zip(db_path: Path, target: Path, cutoff_days: int) -> None:
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(db_path, "smartel.db")
        archive.writestr(
            "uploads/README.txt",
            "Demo upload placeholder. Real knowledge-base files are included in your own snapshots.\n",
        )
        archive.writestr("vector_store/.keep", "")
        archive.writestr(
            "manifest.json",
            json.dumps(
                {
                    "app": "SMARTEL",
                    "version": "2.0.0",
                    "created_at": now_iso(),
                    "snapshot_days_ago": cutoff_days,
                    "source": "demo-seed",
                },
                ensure_ascii=False,
                indent=2,
            ),
        )


def seed_demo() -> bool:
    if not db.scalar("SELECT COUNT(*) FROM bots", default=0):
        bot_id = db.insert(
            "INSERT INTO bots(name, telegram_username, notes, status, api_key_hash, api_key_prefix, "
            "key_created_at, created_at, updated_at, backup_interval_hours, credits_total, source_mode) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                "Alfiqi AI", "@alfiqi_ai_bot",
                "مساحة تجريبية جاهزة — اربط بوتك الحقيقي من الإعدادات ثم احذف هذه المساحة.",
                "active", "", "demo", now_iso(), now_iso(), now_iso(),
                6, 500, "demo",
            ),
        )
        bot = db.row("SELECT * FROM bots WHERE id=?", (bot_id,))
        assert bot is not None
        with tempfile.TemporaryDirectory(prefix="demo-") as temp:
            temp_dir = Path(temp)
            for cutoff in (6, 3, 0):
                db_path = temp_dir / f"smartel-{cutoff}.db"
                _build_db(db_path, cutoff_days=cutoff)
                archive = temp_dir / f"demo-{cutoff}.zip"
                _make_zip(db_path, archive, cutoff)
                upload = temp_dir / f"upload-{cutoff}.zip"
                archive.replace(upload)
                snapshot = register_snapshot(
                    bot, upload, source="demo", original_name="demo.zip",
                )
                if cutoff:
                    older = now() - timedelta(days=cutoff + 0.6)
                    stamp = older.strftime("%Y-%m-%dT%H:%M:%SZ")
                    db.execute(
                        "UPDATE snapshots SET created_at=? WHERE id=?",
                        (stamp, snapshot["id"]),
                    )
            db.execute(
                "UPDATE bots SET last_backup_at=? WHERE id=?",
                (now_iso(), bot_id),
            )
        db.add_event("system", "Demo workspace created — connect your real bot to replace it", bot_id)
        return True
    return False
