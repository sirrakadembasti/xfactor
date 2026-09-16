# Quiz-Master & Multi-Stack Modern Platform Specification

## 1. Overview
Quiz-Master is a comprehensive, role-based online exam management platform tailored for schools and educational institutions. It facilitates the entire examination lifecycle—structure management, question banking with AI assistance, exam scheduling/assignment, secure timed test-taking, and instant analytics/grading.

This specification also codifies the platform's multi-stack flexibility and modern dependency standards for all current and future autonomous application generation tasks in XFactor.

---

## 2. Core Principles & Platform Rules

### 2.1 Multi-Stack & Modern Version Standards
1. **Latest Stable Versions:** All generated projects must strictly lock the latest stable versions of their respective runtime and dependencies (no legacy pinning).
2. **Multi-Stack Adaptability:** The orchestration platform (Manager, Director, Teamleader, Coder) must support any user-requested stack:
   - **Next.js Fullstack (Default / Selected for Quiz-Master):** Node.js 22 LTS, Next.js 15+ (App Router), React 19 / 18.3, TypeScript 5.5+, Prisma 6+, Tailwind CSS, Zod.
   - **Vue / Nuxt:** Nuxt 3+, Vue 3+, Pinia, Tailwind CSS.
   - **Python:** Python 3.12+, FastAPI / Django, Pydantic v2, SQLAlchemy / Tortoise ORM.
   - **.NET:** .NET 9/10, C# 13, Entity Framework Core.
3. **No In-Place Manual Patches in `projects/`:**
   - Generated code in `projects/` will be inspected for diagnostics, compilation issues, missing features, and runtime failures.
   - Issues found will **never** be patched manually inside the project directory.
   - Root causes must be resolved in platform prompts, templates, schemas, and orchestration workflows. The project must be fully created and refined through dialogue with **Manager (manager.agent)**.

---

## 3. Quiz-Master Functional Architecture

### 3.1 Role & Access Control Matrix
- **Admin (Yönetici):**
  - School hierarchy management: Classrooms/Sections (e.g., 10-A, 11-B), Subjects (e.g., Mathematics, Physics).
  - User management: Teachers, Students, enrollment into classrooms and subject assignments.
  - Institution-wide exam analytics, pass rates, and performance averages.
- **Teacher (Öğretmen):**
  - Question Bank: Categorized questions by subject, difficulty, and type (multiple choice, true/false).
  - **AI Question Generator:** Generates high-quality question drafts with options and answer keys based on topic and difficulty.
  - Exam Management: Exam creation, question selection/randomization, time limits, scheduling, and assignment to specific classrooms.
  - Gradebook & Analytics: Exam submission overview, score distribution, and question-level difficulty analytics.
- **Student (Öğrenci):**
  - Portal: Active and completed exams list.
  - Exam Taking Interface: Distraction-free exam room, countdown timer, auto-submission on timeout, question navigation.
  - Report Card: Immediate score calculation, breakdown of correct/wrong/empty answers with explanations.

### 3.2 Data Models (Prisma Schema - SQLite)
- `User`: `id`, `email`, `name`, `password`, `role` (`ADMIN`, `TEACHER`, `STUDENT`), `createdAt`
- `Classroom`: `id`, `name`, `gradeLevel`
- `ClassroomEnrollment`: `id`, `classroomId`, `studentId`
- `Subject`: `id`, `name`, `code`
- `TeacherSubject`: `id`, `teacherId`, `subjectId`
- `Question`: `id`, `subjectId`, `text`, `type`, `optionsJson`, `correctOption`, `explanation`, `aiGenerated`
- `Exam`: `id`, `title`, `subjectId`, `teacherId`, `durationMinutes`, `startsAt`, `endsAt`, `isPublished`
- `ExamAssignment`: `id`, `examId`, `classroomId`
- `ExamSubmission`: `id`, `examId`, `studentId`, `startedAt`, `submittedAt`, `score`, `answersJson`

### 3.3 Page Layout & Navigation
- `/login`: Single unified modern login screen redirecting based on user role.
- `/admin`: Overview metrics, `/admin/classrooms`, `/admin/subjects`, `/admin/users`.
- `/teacher`: Dashboard, `/teacher/questions` (with AI Generator modal), `/teacher/exams`, `/teacher/exams/[id]/results`.
- `/student`: Active/completed exams list, `/student/exams/[id]` (Exam Room), `/student/exams/[id]/result` (Result Breakdown).

### 3.4 Seed & Test Accounts
Every generation must include an executable seed script (`prisma/seed.ts` or `prisma/seed.js`) providing:
- Admin: `admin@quizmaster.local` / `admin123`
- Teacher: `teacher@quizmaster.local` / `teacher123`
- Student: `student@quizmaster.local` / `student123`
- Pre-populated classrooms, subjects, and sample questions.

---

## 4. Quality & Build Gates
1. **Compilation:** `npm run build` and `tsc --noEmit` must pass with zero errors.
2. **Database:** `npx prisma validate` and `npx prisma db push` must succeed.
3. **Self-Contained:** Includes complete README.md with clear setup and execution steps.
