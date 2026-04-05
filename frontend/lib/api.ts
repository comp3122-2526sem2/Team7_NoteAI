import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) => {
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    return api.post<{ access_token: string; token_type: string }>(
      "/auth/login",
      form
    );
  },
  register: (data: {
    username: string;
    password: string;
    nickname: string;
    role: "student" | "teacher";
    student_id?: string;
    teacher_id?: string;
  }) => api.post<User>("/auth/register", data),
  me: () => api.get<User>("/auth/me"),
};

// ── Courses ───────────────────────────────────────────────────────────────────
export const coursesApi = {
  list: () => api.get<Course[]>("/courses"),
  get: (id: string) => api.get<Course>(`/courses/${id}`),
  create: (data: { name: string; description?: string; syllabus?: string }) =>
    api.post<Course>("/courses", data),
  update: (
    id: string,
    data: { name?: string; description?: string; syllabus?: string }
  ) => api.put<Course>(`/courses/${id}`, data),
  delete: (id: string) => api.delete(`/courses/${id}`),
  listStudents: (courseId: string) =>
    api.get<User[]>(`/courses/${courseId}/students`),
  enrollStudent: (courseId: string, studentId: string) =>
    api.post(`/courses/${courseId}/students`, { student_id: studentId }),
  unenrollStudent: (courseId: string, studentId: string) =>
    api.delete(`/courses/${courseId}/students/${studentId}`),
  listTeachers: (courseId: string) =>
    api.get<User[]>(`/courses/${courseId}/teachers`),
  uploadSyllabus: (courseId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<SyllabusUploadOut>(`/courses/${courseId}/syllabus/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ── Assignments ───────────────────────────────────────────────────────────────
export const assignmentsApi = {
  list: (courseId: string) =>
    api.get<Assignment[]>(`/courses/${courseId}/assignments`),
  get: (courseId: string, assignmentId: string) =>
    api.get<Assignment>(`/courses/${courseId}/assignments/${assignmentId}`),
  create: (courseId: string, data: AssignmentCreateData) =>
    api.post<Assignment>(`/courses/${courseId}/assignments`, data),
  update: (courseId: string, assignmentId: string, data: Partial<AssignmentCreateData>) =>
    api.put<Assignment>(
      `/courses/${courseId}/assignments/${assignmentId}`,
      data
    ),
  delete: (courseId: string, assignmentId: string) =>
    api.delete(`/courses/${courseId}/assignments/${assignmentId}`),
  listSubmissions: (courseId: string, assignmentId: string) =>
    api.get<Submission[]>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions`
    ),
  getSubmission: (courseId: string, assignmentId: string, submissionId: string) =>
    api.get<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}`
    ),
  submit: (
    courseId: string,
    assignmentId: string,
    payload: { student_feedback?: string; answers?: Record<string, string> }
  ) =>
    api.post<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submit`,
      payload
    ),
  grade: (
    courseId: string,
    assignmentId: string,
    submissionId: string,
    data: { score?: number; teacher_feedback?: string }
  ) =>
    api.put<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/grade`,
      data
    ),
  generateAiFeedback: (
    courseId: string,
    assignmentId: string,
    submissionId: string
  ) =>
    api.post<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/ai-feedback`
    ),
};

// ── Chapters ──────────────────────────────────────────────────────────────────
export const chaptersApi = {
  list: (courseId: string) =>
    api.get<Chapter[]>(`/courses/${courseId}/chapters`),
  get: (courseId: string, chapterId: string) =>
    api.get<Chapter>(`/courses/${courseId}/chapters/${chapterId}`),
  create: (courseId: string, data: ChapterCreateData) =>
    api.post<Chapter>(`/courses/${courseId}/chapters`, data),
  update: (courseId: string, chapterId: string, data: Partial<ChapterCreateData>) =>
    api.put<Chapter>(`/courses/${courseId}/chapters/${chapterId}`, data),
  delete: (courseId: string, chapterId: string) =>
    api.delete(`/courses/${courseId}/chapters/${chapterId}`),
  getAIComment: (courseId: string, chapterId: string) =>
    api.get<ChapterAIComment | null>(`/courses/${courseId}/chapters/${chapterId}/ai-comment`),
  generateAIComment: (courseId: string, chapterId: string) =>
    api.post<ChapterAIComment>(`/courses/${courseId}/chapters/${chapterId}/ai-comment/generate`),
  generateAICommentForStudent: (courseId: string, chapterId: string, studentId: string) =>
    api.post<ChapterAIComment>(`/courses/${courseId}/chapters/${chapterId}/students/${studentId}/ai-comment/generate`),
  aiCommentStreamUrl: (courseId: string, chapterId: string) =>
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/courses/${courseId}/chapters/${chapterId}/ai-comment/stream`,
  listDocuments: (courseId: string, chapterId: string) =>
    api.get<Document[]>(`/courses/${courseId}/chapters/${chapterId}/documents`),
  uploadDocument: (courseId: string, chapterId: string, formData: FormData) =>
    api.post<Document>(
      `/courses/${courseId}/chapters/${chapterId}/documents/upload`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    ),
  deleteDocument: (courseId: string, chapterId: string, docId: string) =>
    api.delete(`/courses/${courseId}/chapters/${chapterId}/documents/${docId}`),
  getDocumentKeywords: (courseId: string, chapterId: string, docId: string) =>
    api.get<DocumentKeywordsOut>(
      `/courses/${courseId}/chapters/${chapterId}/documents/${docId}/keywords`
    ),
  refreshDocumentKeywords: (courseId: string, chapterId: string, docId: string) =>
    api.post<DocumentKeywordsOut>(
      `/courses/${courseId}/chapters/${chapterId}/documents/${docId}/keywords/refresh`
    ),
  getChapterPerformance: (courseId: string, chapterId: string) =>
    api.get<ChapterStudentPerformance[]>(`/courses/${courseId}/chapters/${chapterId}/performance`),
  getStudentChapterPerformance: (courseId: string, studentId: string) =>
    api.get<StudentChapterPerformance[]>(`/courses/${courseId}/chapters/students/${studentId}/performance`),
  listThreads: (courseId: string, chapterId: string) =>
    api.get<ChapterThread[]>(`/courses/${courseId}/chapters/${chapterId}/threads`),
  createThread: (courseId: string, chapterId: string, name: string) =>
    api.post<ChapterThread>(`/courses/${courseId}/chapters/${chapterId}/threads`, { name }),
  deleteThread: (courseId: string, chapterId: string, threadId: string) =>
    api.delete(`/courses/${courseId}/chapters/${chapterId}/threads/${threadId}`),
  getThreadHistory: (courseId: string, chapterId: string, threadId: string) =>
    api.get<{ history: ChatMessage[] }>(`/courses/${courseId}/chapters/${chapterId}/threads/${threadId}/history`),
  threadStreamUrl: (courseId: string, chapterId: string, threadId: string) =>
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/courses/${courseId}/chapters/${chapterId}/threads/${threadId}/stream`,
};

// ── Lesson Plans ──────────────────────────────────────────────────────────────
export const lessonPlansApi = {
  get: (courseId: string, chapterId: string) =>
    api.get<LessonPlan>(`/courses/${courseId}/chapters/${chapterId}/lesson-plan`),
  create: (
    courseId: string,
    chapterId: string,
    payload: { title: string; config?: LessonPlanConfig; template_id?: string }
  ) =>
    api.post<LessonPlan>(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan`,
      payload
    ),
  update: (
    courseId: string,
    chapterId: string,
    payload: {
      title?: string;
      content?: string;
      config?: LessonPlanConfig;
      css_style?: string;
      status?: LessonPlanStatus;
      /** When true, server persists without appending a version snapshot (debounced settings sync). */
      skip_version?: boolean;
    }
  ) =>
    api.put<LessonPlan>(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan`,
      payload
    ),
  delete: (courseId: string, chapterId: string) =>
    api.delete(`/courses/${courseId}/chapters/${chapterId}/lesson-plan`),
  aiGenerate: (
    courseId: string,
    chapterId: string,
    payload?: {
      instruction?: string;
      output_language?: LessonPlanOutputLanguage;
      style_preset?: LessonPlanStylePreset;
      document_ids?: string[];
      focus_keywords?: string[];
    }
  ) =>
    api.post<LessonPlan>(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan/ai-generate`,
      payload ?? {}
    ),
  aiRegenerateSection: (
    courseId: string,
    chapterId: string,
    payload: {
      original_section: string;
      instruction: string;
      context_config?: LessonPlanConfig;
      output_language?: LessonPlanOutputLanguage;
      style_preset?: LessonPlanStylePreset;
    }
  ) =>
    api.post<{ content: string }>(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan/ai-regenerate-section`,
      payload
    ),
  listVersions: (courseId: string, chapterId: string) =>
    api.get<LessonPlanVersion[]>(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan/versions`
    ),
  getVersion: (courseId: string, chapterId: string, versionId: string) =>
    api.get<LessonPlanVersionDetail>(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan/versions/${versionId}`
    ),
  restoreVersion: (courseId: string, chapterId: string, versionId: string) =>
    api.post<LessonPlan>(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan/versions/${versionId}/restore`
    ),
  deleteVersion: (courseId: string, chapterId: string, versionId: string) =>
    api.delete(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan/versions/${versionId}`
    ),
  exportPdf: (courseId: string, chapterId: string) =>
    api.get<Blob>(
      `/courses/${courseId}/chapters/${chapterId}/lesson-plan/export-pdf`,
      { responseType: "blob" }
    ),
};

// ── Lesson Plan Templates ─────────────────────────────────────────────────────
export const lessonPlanTemplatesApi = {
  list: () => api.get<LessonPlanTemplate[]>("/lesson-plan-templates"),
  get: (templateId: string) =>
    api.get<LessonPlanTemplate>(`/lesson-plan-templates/${templateId}`),
  create: (payload: {
    name: string;
    description?: string;
    content: string;
    default_config?: LessonPlanConfig;
    template_type?: LessonPlanTemplateType;
    school_id?: string;
  }) => api.post<LessonPlanTemplate>("/lesson-plan-templates", payload),
  update: (
    templateId: string,
    payload: {
      name?: string;
      description?: string;
      content?: string;
      default_config?: LessonPlanConfig;
      template_type?: LessonPlanTemplateType;
      school_id?: string;
      is_active?: boolean;
    }
  ) => api.put<LessonPlanTemplate>(`/lesson-plan-templates/${templateId}`, payload),
  delete: (templateId: string) => api.delete(`/lesson-plan-templates/${templateId}`),
};

// ── Documents ─────────────────────────────────────────────────────────────────
export const documentsApi = {
  list: () => api.get<Document[]>("/documents"),
  get: (id: string) => api.get<Document>(`/documents/${id}`),
  upload: (formData: FormData) =>
    api.post<Document>("/documents/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  runAiCheck: (id: string) => api.post<Document>(`/documents/${id}/ai-check`),
  delete: (id: string) => api.delete(`/documents/${id}`),
};

// ── Progress ──────────────────────────────────────────────────────────────────
export const progressApi = {
  listCourseProgress: (courseId: string) =>
    api.get<StudentProgress[]>(`/courses/${courseId}/progress`),
  getStudentProgress: (courseId: string, studentId: string) =>
    api.get<StudentProgress[]>(
      `/courses/${courseId}/progress/students/${studentId}`
    ),
  updateMastery: (
    courseId: string,
    studentId: string,
    progressId: string,
    masteryLevel: string
  ) =>
    api.put(`/courses/${courseId}/progress/students/${studentId}/${progressId}`, {
      mastery_level: masteryLevel,
    }),
  getRecommendations: (courseId: string, studentId: string) =>
    api.get<Recommendation[]>(
      `/courses/${courseId}/progress/students/${studentId}/recommendations`
    ),
  generateRecommendation: (courseId: string, studentId: string) =>
    api.post<Recommendation>(
      `/courses/${courseId}/progress/students/${studentId}/recommendations/generate`
    ),
  myProgress: () => api.get<StudentProgress[]>("/progress"),
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  nickname: string;
  username: string;
  role: "student" | "teacher" | "admin";
  is_active: boolean;
  created_at: string;
  last_login_at?: string;
}

export interface Course {
  id: string;
  name: string;
  description?: string;
  syllabus?: string;
  created_at: string;
  updated_at: string;
}

export interface SyllabusUploadOut {
  course_id: string;
  document_id: string;
  /** Always "pending" — generation runs in the background. */
  status: "pending";
}

export interface Chapter {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ChapterCreateData {
  title: string;
  description?: string;
}

export interface ChapterAIComment {
  id: string;
  chapter_id: string;
  student_id: string;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface ChapterSubmissionSummary {
  assignment_id: string;
  assignment_name: string;
  status: "pending" | "submitted" | "graded";
  score?: number;
  max_score?: number;
}

export interface ChapterStudentPerformance {
  student_id: string;
  student_name: string;
  has_ai_comment: boolean;
  ai_comment?: string;
  ai_comment_updated_at?: string;
  submissions: ChapterSubmissionSummary[];
}

export interface StudentChapterPerformance {
  chapter_id: string;
  chapter_title: string;
  has_ai_comment: boolean;
  ai_comment?: string;
  ai_comment_updated_at?: string;
  submissions: ChapterSubmissionSummary[];
}

// ── Assignment content (question types) ──────────────────────────────────────

export interface MCQuestion {
  type: "mc";
  question: string;
  /** Ordered list of option texts; labels A, B, C… derived from position */
  options: string[];
  correct_answer?: string; // "A", "B", "C", …
}

export interface LongQuestion {
  type: "long";
  question: string;
  suggested_answer?: string; // shown to teachers only
}

export interface PassageSection {
  type: "passage";
  passage: string;
  questions: Array<MCQuestion | LongQuestion>;
}

export type AssignmentSection = MCQuestion | LongQuestion | PassageSection;

export interface AssignmentContent {
  sections: AssignmentSection[];
}

export interface Assignment {
  id: string;
  course_id: string;
  chapter_id?: string;
  name: string;
  description?: string;
  assignment_type: "quiz" | "homework" | "project" | "exam";
  topic?: string;
  due_date?: string;
  max_score?: number;
  content?: AssignmentContent;
  created_at: string;
  updated_at: string;
}

export interface AssignmentCreateData {
  name: string;
  description?: string;
  assignment_type: "quiz" | "homework" | "project" | "exam";
  topic?: string;
  due_date: string;
  max_score?: number;
  chapter_id?: string;
  content?: AssignmentContent;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name?: string;
  student_username?: string;
  submission_date?: string;
  submission_status: "pending" | "submitted" | "graded";
  ai_feedback?: string;
  student_feedback?: string;
  teacher_feedback?: string;
  answers?: Record<string, string>;
  score?: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentKeywordsOut {
  items: string[];
  cached: boolean;
  content_sha256: string;
}

export interface Document {
  id: string;
  uploaded_by: string;
  course_id?: string;
  chapter_id?: string;
  document_type: "notice" | "exam" | "worksheet" | "other";
  original_filename: string;
  original_file_type: string;
  converted_markdown?: string;
  css_style?: string;
  ai_format_feedback?: string;
  conversion_status: "pending" | "completed" | "failed";
  created_at: string;
  updated_at: string;
}

export interface StudentProgress {
  id: string;
  student_id: string;
  course_id: string;
  topic: string;
  mastery_level: "weak" | "developing" | "proficient";
  last_assessed_at?: string;
  updated_at: string;
}

export interface ChapterThread {
  id: string;
  chapter_id: string;
  user_id: string;
  thread_slug: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type LessonPlanStatus = "draft" | "published" | "archived";
export type LessonPlanOutputLanguage = "zh" | "en";
export type LessonPlanStylePreset =
  | "balanced"
  | "activity_heavy"
  | "lecture_focus"
  | "exam_prep"
  | "public_lesson";
export type LessonPlanTemplateType = "system" | "school" | "teacher";
export type LessonPlanConfig = Record<string, unknown>;

export interface LessonPlan {
  id: string;
  chapter_id: string;
  course_id: string;
  title: string;
  content: string;
  config?: LessonPlanConfig;
  css_style?: string;
  status: LessonPlanStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface LessonPlanVersion {
  id: string;
  lesson_plan_id: string;
  version_number: number;
  saved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface LessonPlanVersionDetail extends LessonPlanVersion {
  snapshot_content: string;
  snapshot_config?: LessonPlanConfig;
}

export interface LessonPlanTemplate {
  id: string;
  name: string;
  description?: string;
  content: string;
  default_config?: LessonPlanConfig;
  template_type: LessonPlanTemplateType;
  school_id?: string;
  created_by?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sentAt?: number;
}

export interface Recommendation {
  id: string;
  student_id: string;
  course_id: string;
  based_on_assignment_id?: string;
  recommendation: string;
  created_at: string;
}
