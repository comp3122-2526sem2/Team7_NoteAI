Frontend:

## Stack
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query (server state)
- Zustand (client state)
- CodeMirror 6 (markdown live editor)
- react-pdf / jsPDF (PDF export preview)

## Setup
- [ ] Init Next.js project (`npx create-next-app@latest frontend --typescript --tailwind --app`)
- [ ] Install shadcn/ui (`npx shadcn@latest init`)
- [ ] Install dependencies: `@tanstack/react-query`, `zustand`, `@codemirror/view`, `@codemirror/lang-markdown`, `axios`
- [ ] Create `frontend/lib/api.ts` — typed axios client with JWT interceptor (reads token from localStorage)
- [ ] Create `frontend/lib/queryClient.ts` — TanStack Query client setup
- [ ] Set up `.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Auth
- [ ] `/login` page — username + password form → `POST /auth/login` → store JWT
- [ ] `/register` page — register form with role selector (student / teacher)
- [ ] Auth guard middleware (`middleware.ts`) — redirect unauthenticated users to `/login`
- [ ] `useAuth` hook — current user, role, logout

## Layout & Navigation
- [ ] Root layout with sidebar navigation
- [ ] Sidebar: links vary by role (teacher sees lesson plans, doc checker, progress; student sees courses, assignments)
- [ ] Top bar: current user nickname + logout button
- [ ] Role-aware route protection (teacher-only pages redirect students)

## Courses
- [ ] `/courses` — list enrolled/assigned courses (cards)
- [ ] `/courses/new` [teacher] — create course form
- [ ] `/courses/[id]` — course overview (syllabus, assignments, lesson plans tabs)
- [ ] `/courses/[id]/settings` [teacher] — enroll students, assign teachers

## Assignments
- [ ] `/courses/[id]/assignments` — list assignments with due dates and status badges
- [ ] `/courses/[id]/assignments/new` [teacher] — create assignment form (type, topic, due date, max score)
- [ ] `/courses/[id]/assignments/[aid]` — assignment detail
  - [ ] Teacher view: list of submissions with scores, grade panel, AI feedback button
  - [ ] Student view: submit form + view own submission + AI feedback display
- [ ] AI feedback panel — calls `POST .../ai-feedback`, renders markdown response

## Lesson Plan Editor (Req 1)
- [ ] `/courses/[id]/lesson-plans` — list lesson plans (draft / published / archived badges)
- [ ] `/courses/[id]/lesson-plans/new` [teacher] — create lesson plan
- [ ] `/courses/[id]/lesson-plans/[pid]` — split-pane editor
  - [ ] Left pane: rendered markdown preview (the saved `content`)
  - [ ] Right pane: live CodeMirror 6 markdown editor
  - [ ] Topic selector panel (add/edit/delete `lesson_plan_topic` rows)
  - [ ] Toolbar: Save (PUT), AI Generate (POST `/ai-generate`), AI Stream (POST `/ai-stream` SSE), Export PDF
  - [ ] AI stream — connect to SSE endpoint, stream tokens into the editor in real time
  - [ ] Version history drawer — list versions, diff viewer, restore button
  - [ ] PDF export — convert `content` markdown → HTML → apply `css_style` → print/download

## Document Format Checker (Req 2)
- [ ] `/documents` [teacher] — list uploaded documents with conversion status badges
- [ ] Upload area — drag-and-drop or file picker (PDF / DOCX), calls `POST /documents/upload`
- [ ] Document detail page
  - [ ] Conversion status indicator (pending / completed / failed)
  - [ ] Rendered markdown preview with AI-generated CSS applied
  - [ ] AI format feedback panel (markdown rendered)
  - [ ] "Run AI Check" button → `POST /documents/[id]/ai-check`

## Student Progress (Req 3)
- [ ] `/courses/[id]/progress` [teacher] — class overview table
  - [ ] Rows: students, columns: topics, cells: mastery badge (weak / developing / proficient)
  - [ ] Click cell → inline edit mastery level
- [ ] `/courses/[id]/progress/students/[sid]` [teacher] — individual student detail
  - [ ] Topic mastery chart (bar or radar)
  - [ ] Assignment submission history with scores
  - [ ] AI recommendations list
  - [ ] "Generate Recommendation" button → `POST .../recommendations/generate`
- [ ] Student self-view `/progress` — read-only view of own topic mastery per course

## Shared Components
- [ ] `<MarkdownRenderer>` — renders markdown with syntax highlighting (use `react-markdown` + `rehype-highlight`)
- [ ] `<MasteryBadge>` — weak (red) / developing (yellow) / proficient (green)
- [ ] `<StatusBadge>` — generic status pill (draft, pending, submitted, etc.)
- [ ] `<ConfirmDialog>` — reusable delete/action confirmation modal
- [ ] `<LoadingSpinner>` / `<ErrorBoundary>`
- [ ] `<FileUpload>` — drag-and-drop upload component with progress bar

---

Backend:
- [ ] Create a new database for noteai

```
user:
id
nickname
username
password
role                        # student | teacher | admin
created_at
updated_at
last_login_at
is_active
--------------------------------
student_user:
id foreign key to user.id
student_id
--------------------------------
teacher_user:
id foreign key to user.id
teacher_id
--------------------------------
course:
id
name
description
syllabus                    # in markdown format
created_at
updated_at
--------------------------------
course_student:
id
student_id foreign key to student_user.id
course_id foreign key to course.id
created_at
updated_at
--------------------------------
course_teacher:
id
teacher_id foreign key to teacher_user.id
course_id foreign key to course.id
created_at
updated_at
--------------------------------
course_assignment:
id
course_id foreign key to course.id
assignment_id foreign key to assignment.id
created_at
updated_at
--------------------------------
assignment:
id
course_id foreign key to course.id
name
description
assignment_type             # quiz | homework | project | exam
topic                       # maps to lesson_plan_topic for progress cross-reference
due_date
max_score
created_at
updated_at
--------------------------------
assignment_submission:
id
assignment_id foreign key to assignment.id
student_id foreign key to student_user.id
submission_date
submission_status           # pending | submitted | graded
ai_feedback                 # in markdown format
student_feedback            # in markdown format
teacher_feedback            # in markdown format
score
created_at
updated_at
--------------------------------

# Requirement 1 — 教案製作 (Lesson Plan Editor)
lesson_plan:
id
course_id foreign key to course.id
title
content                     # markdown — the single saved lesson plan (left pane)
css_style                   # CSS applied when converting markdown → HTML → PDF
pdf_export_path             # storage path of the last exported PDF
status                      # draft | published | archived
created_by foreign key to teacher_user.id
created_at
updated_at
--------------------------------
lesson_plan_topic:
id
lesson_plan_id foreign key to lesson_plan.id
topic                       # e.g. "Fractions", "Reading Comprehension"
teaching_method             # e.g. "Group Discussion", "Demonstration"
teaching_content            # specific resource or note (right-pane selections)
--------------------------------
lesson_plan_version:
id
lesson_plan_id foreign key to lesson_plan.id
snapshot_content            # markdown snapshot of content at save time
saved_by foreign key to teacher_user.id
created_at
--------------------------------

# Requirement 2 — 文件格式檢查 (Document Format Checker)
document:
id
uploaded_by foreign key to teacher_user.id
course_id foreign key to course.id  # nullable
document_type               # notice | exam | worksheet | other
original_filename
original_file_type          # pdf | docx | etc.
original_file_path          # storage path
converted_markdown          # converted file content in markdown
css_style                   # AI-generated CSS for display styling
ai_format_feedback          # markdown — AI comments on format issues
conversion_status           # pending | completed | failed
created_at
updated_at
--------------------------------

# Requirement 3 — 學生進度追蹤 (Student Progress Tracking)
student_topic_progress:
id
student_id foreign key to student_user.id
course_id foreign key to course.id
topic                       # maps to lesson_plan_topic.topic
mastery_level               # weak | developing | proficient
last_assessed_at
updated_at
--------------------------------
student_ai_recommendation:
id
student_id foreign key to student_user.id
course_id foreign key to course.id
based_on_assignment_id foreign key to assignment.id  # nullable
recommendation              # markdown — AI-generated tailored advice for teacher
created_at
--------------------------------
```