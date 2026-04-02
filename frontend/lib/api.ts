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
  submit: (courseId: string, assignmentId: string, studentFeedback: string) =>
    api.post<Submission>(
      `/courses/${courseId}/assignments/${assignmentId}/submit`,
      { student_feedback: studentFeedback }
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

// ── Lesson Plans ──────────────────────────────────────────────────────────────
export const lessonPlansApi = {
  list: (courseId: string) =>
    api.get<LessonPlan[]>(`/courses/${courseId}/lesson-plans`),
  get: (courseId: string, planId: string) =>
    api.get<LessonPlan>(`/courses/${courseId}/lesson-plans/${planId}`),
  create: (courseId: string, data: LessonPlanCreateData) =>
    api.post<LessonPlan>(`/courses/${courseId}/lesson-plans`, data),
  update: (courseId: string, planId: string, data: Partial<LessonPlanCreateData>) =>
    api.put<LessonPlan>(`/courses/${courseId}/lesson-plans/${planId}`, data),
  delete: (courseId: string, planId: string) =>
    api.delete(`/courses/${courseId}/lesson-plans/${planId}`),
  listTopics: (courseId: string, planId: string) =>
    api.get<Topic[]>(`/courses/${courseId}/lesson-plans/${planId}/topics`),
  addTopic: (courseId: string, planId: string, data: TopicCreateData) =>
    api.post<Topic>(`/courses/${courseId}/lesson-plans/${planId}/topics`, data),
  updateTopic: (
    courseId: string,
    planId: string,
    topicId: string,
    data: Partial<TopicCreateData>
  ) =>
    api.put<Topic>(
      `/courses/${courseId}/lesson-plans/${planId}/topics/${topicId}`,
      data
    ),
  deleteTopic: (courseId: string, planId: string, topicId: string) =>
    api.delete(
      `/courses/${courseId}/lesson-plans/${planId}/topics/${topicId}`
    ),
  listVersions: (courseId: string, planId: string) =>
    api.get<LessonPlanVersion[]>(
      `/courses/${courseId}/lesson-plans/${planId}/versions`
    ),
  restoreVersion: (courseId: string, planId: string, versionId: string) =>
    api.post<LessonPlan>(
      `/courses/${courseId}/lesson-plans/${planId}/versions/${versionId}/restore`
    ),
  aiGenerate: (
    courseId: string,
    planId: string,
    data: { prompt: string; mode?: string; session_id?: string }
  ) =>
    api.post<LessonPlan>(
      `/courses/${courseId}/lesson-plans/${planId}/ai-generate`,
      data
    ),
  aiStreamUrl: (courseId: string, planId: string) =>
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/courses/${courseId}/lesson-plans/${planId}/ai-stream`,
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

export interface Assignment {
  id: string;
  course_id: string;
  name: string;
  description?: string;
  assignment_type: "quiz" | "homework" | "project" | "exam";
  topic?: string;
  due_date?: string;
  max_score?: number;
  created_at: string;
  updated_at: string;
}

export interface AssignmentCreateData {
  name: string;
  description?: string;
  assignment_type: "quiz" | "homework" | "project" | "exam";
  topic?: string;
  due_date?: string;
  max_score?: number;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  submission_date?: string;
  submission_status: "pending" | "submitted" | "graded";
  ai_feedback?: string;
  student_feedback?: string;
  teacher_feedback?: string;
  score?: number;
  created_at: string;
  updated_at: string;
}

export interface LessonPlan {
  id: string;
  course_id: string;
  title: string;
  content?: string;
  css_style?: string;
  pdf_export_path?: string;
  status: "draft" | "published" | "archived";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LessonPlanCreateData {
  title: string;
  content?: string;
  css_style?: string;
  status?: "draft" | "published" | "archived";
}

export interface Topic {
  id: string;
  lesson_plan_id: string;
  topic: string;
  teaching_method?: string;
  teaching_content?: string;
}

export interface TopicCreateData {
  topic: string;
  teaching_method?: string;
  teaching_content?: string;
}

export interface LessonPlanVersion {
  id: string;
  lesson_plan_id: string;
  snapshot_content: string;
  saved_by: string;
  created_at: string;
}

export interface Document {
  id: string;
  uploaded_by: string;
  course_id?: string;
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

export interface Recommendation {
  id: string;
  student_id: string;
  course_id: string;
  based_on_assignment_id?: string;
  recommendation: string;
  created_at: string;
}
