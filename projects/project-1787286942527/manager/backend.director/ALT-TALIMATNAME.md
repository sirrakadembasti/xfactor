# Backend Domain Şartnamesi: Sanal Okul Quiz & Sınav Yönetimi

## 1. Mimari Standartlar ve Teknoloji Yığını
- **Çatı:** Next.js 14+ Route Handlers (`app/api/...`)
- **ORM & DB:** Prisma ORM, SQLite (`prisma/schema.prisma`, `DATABASE_URL="file:./dev.db"`)
- **Doğrulama & Şemalar:** Zod (`lib/validations/...`)
- **Singleton DB İstemcisi:** `lib/prisma.ts` ve `lib/db.ts`
- **Tipler:** `types/index.ts` veya `types/quiz.ts`

---

## 2. Veri Modelleri (Prisma Schema)
1. **User:** `id`, `name`, `email`, `role` (`ADMIN`, `TEACHER`, `STUDENT`), `classroomId?`, `createdAt`
2. **Classroom:** `id`, `name` (örn. 10-A, 11-B), `grade` (10, 11), `students`, `quizzes`
3. **Subject:** `id`, `name` (Matematik, Fizik vb.), `code`, `questions`, `quizzes`
4. **Question:** `id`, `subjectId`, `teacherId`, `title`, `options` (JSON string veya array), `correctAnswer`, `explanation`, `difficulty` (`EASY`, `MEDIUM`, `HARD`), `points`
5. **Quiz:** `id`, `title`, `description`, `subjectId`, `teacherId`, `classroomId?`, `durationMinutes`, `passScore`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `questions` (QuizQuestion[]), `attempts`
6. **QuizQuestion:** `id`, `quizId`, `questionId`, `order`
7. **QuizAttempt:** `id`, `quizId`, `studentId`, `startedAt`, `completedAt`, `score`, `totalScore`, `status` (`IN_PROGRESS`, `SUBMITTED`, `TIMED_OUT`), `answers` (UserAnswer[])
8. **UserAnswer:** `id`, `attemptId`, `questionId`, `selectedOption`, `isCorrect`, `pointsEarned`

---

## 3. REST API Rota Sözleşmeleri
- `GET /api/users` & `GET /api/users/current` (Mock profil/rol desteği için)
- `GET/POST /api/classes`
- `GET/POST /api/subjects`
- `GET/POST /api/questions` (Filtreler: ders, zorluk, arama)
- `GET/POST /api/quizzes` (Sınıf, ders ve durum filtreli listeleme + detay)
- `POST /api/quizzes/[id]/start` (Öğrenci için QuizAttempt başlatır)
- `POST /api/quizzes/[id]/submit` (Öğrencinin cevaplarını alıp otomatik puanlar ve karne üretir)
- `GET /api/attempts/[id]` (Detaylı karne ve analiz sonucu)
- `GET /api/analytics/dashboard` (Admin ve Öğretmen için okul/sınıf ortalamaları ve başarı oranları)

---

## 4. Mock & Seed Veri Gereksinimleri
- En az 1 Admin, 3 Öğretmen, 10 Öğrenci (farklı sınıflarda)
- 3 Şube (9-A, 10-A, 11-B)
- 4 Ders (Matematik, Fizik, Biyoloji, Tarih)
- Her dersten en az 6 zengin soru (toplam 25+ soru)
- Hazır yayınlanmış 3 aktif Quiz ve geçmiş tamamlanmış örnek denemeler (`QuizAttempt`).