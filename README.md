# لعبتنا 💜 — v2.0

موقع ألعاب للزوجين — مشروع كامل احترافي

## الميزات الكاملة

### 🔐 نظام الحسابات
- تسجيل حساب جديد بالاسم + أفاتار
- تسجيل دخول بـ JWT
- ملف شخصي كامل

### 🏆 نقاط ومستويات
- XP تكتسبها مع كل لعبة
- مستويات تتطور كلما جمعت XP
- إحصائيات: انتصارات، جولات، نقاط كاملة

### 🏅 شارات
- 8 شارات مختلفة
- تُكسب تلقائياً بأحداث معينة

### 🎮 الألعاب (5 ألعاب)
- 🧠 **اختبار ثقافي** — 3 مستويات صعوبة، تنافسي
- 💰 **من سيربح المليون** — 11 سؤال، 3 أوراق مساعدة
- 🃏 **UNO** — لعبة الورق الكاملة
- 🎨 **رسم وخمّن** — canvas حقيقي
- 🔥 **حقيقة أو جرأة** — أسئلة رومانسية وجرائد ممتعة

### 💬 شات
- شات مباشر بين اللاعبين

---

## الرفع على Railway

### 1. أنشئ GitHub Repo
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/USERNAME/lovegame.git
git push -u origin main
```

### 2. Railway
1. اذهب لـ [railway.app](https://railway.app)
2. New Project → Deploy from GitHub Repo
3. اختر الـ repo
4. أضف متغير بيئة:
   - `JWT_SECRET` = أي نص سري طويل مثل `mysecret123abc456`
5. Settings → Domains → Generate Domain

### التشغيل محلياً
```bash
npm install
npm start
```

ثم `http://localhost:3000`

---

## هيكل المشروع
```
lovegame/
├── server.js          — السيرفر الرئيسي
├── src/
│   ├── database.js    — SQLite + مستخدمون + شارات
│   └── gameData.js    — أسئلة + UNO + بيانات الألعاب
├── public/
│   ├── index.html     — الواجهة الكاملة
│   ├── css/style.css  — تصميم داكن احترافي
│   └── js/app.js      — منطق الألعاب
└── package.json
```
