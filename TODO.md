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