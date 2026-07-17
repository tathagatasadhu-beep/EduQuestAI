// Thin fetch wrapper around the FastAPI routes in backend/app/routers/.
// Server-only: reads BACKEND_URL (no NEXT_PUBLIC_ prefix) because every call
// here happens on the Next.js server — Server Components and Route Handlers —
// never directly from the browser. Route Handlers act as a thin
// backend-for-frontend so client components can call same-origin routes
// without ever seeing the underlying bearer tokens (see lib/session.ts).

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...rest,
    headers: {
      ...(headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.detail || message;
    } catch {
      // non-JSON error body — fall back to statusText
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type ParentProfile = { id: string; email: string; full_name: string };
export type AuthToken = { access_token: string; token_type: string; user: ParentProfile };

export type Student = {
  id: string;
  display_name: string;
  grade_level: string | null;
  xp_total: number;
  streak_days: number;
};
export type StudentCreateOut = Student & { login_code: string };
export type StudentAuthToken = { access_token: string; token_type: string; student: Student };
export type LoginCodeOut = { login_code: string };

export type Assignment = {
  id: string;
  subject_id: string;
  subject_name: string;
  topic_id: string | null;
  topic_name: string | null;
  created_at: string;
};

export type AssignedTopic = { id: string; name: string; sort_order: number };
export type AssignedSubject = { id: string; name: string; grade_level: string | null; topics: AssignedTopic[] };
export type Badge = { id: string; name: string; description: string; earned: boolean };
export type TutorChatMessage = { role: "user" | "assistant"; content: string };

export type MasteryStat = {
  topic_id: string;
  topic_name: string;
  accuracy_rate: number;
  total_first_attempts: number;
};

export type Subject = { id: string; name: string; description: string | null; grade_level: string | null; sort_order: number };
export type Topic = { id: string; subject_id: string; name: string; sort_order: number };
export type ReorderItem = { id: string; sort_order: number };

export type QuestionOption = { option_label: string | null; option_text: string };
export type QuestionOut = {
  id: string;
  topic_id: string;
  subject_id: string;
  subject_name: string;
  prompt_text: string;
  prompt_latex: string | null;
  image_path: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  question_type: "multiple_choice" | "free_response";
  options: QuestionOption[];
  requires_self_assessment: boolean;
};

export type QuestionFilter = "all" | "missed_1st" | "missed_2nd";

export type AttemptResult = {
  is_correct: boolean;
  correct_answer: string;
  explanation: string | null;
  added_to_review_queue: boolean;
  xp_awarded: number;
  xp_total: number;
  streak_days: number;
};

export type PdfUploadOut = {
  id: string;
  status: "pending" | "processing" | "extracted" | "failed";
  original_name: string;
  content_type: "theory" | "practice";
  error_message: string | null;
};

export type PdfTopic = { id: string; name: string };
export type TheoryPdf = { id: string; original_name: string; uploaded_at: string; url: string };

export type PdfOut = {
  id: string;
  original_name: string;
  status: "pending" | "processing" | "extracted" | "failed";
  error_message: string | null;
  content_type: "theory" | "practice";
  subject_id: string | null;
  subject_name: string | null;
  question_count: number;
  uploaded_at: string;
  topics: PdfTopic[];
};

export const api = {
  // --- auth ---
  parentSignup: (data: { email: string; full_name: string; password: string }) =>
    request<AuthToken>("/api/auth/parent/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  parentLogin: (data: { email: string; password: string }) =>
    request<AuthToken>("/api/auth/parent/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  studentLogin: (code: string) =>
    request<StudentAuthToken>("/api/auth/student/login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),

  // --- students (parent-scoped) ---
  listStudents: (token: string) => request<Student[]>("/api/students", { token }),
  createStudent: (token: string, data: { display_name: string; grade_level?: string }) =>
    request<StudentCreateOut>("/api/students", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateStudent: (token: string, studentId: string, data: { display_name?: string; grade_level?: string }) =>
    request<Student>(`/api/students/${studentId}`, {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  regenerateLoginCode: (token: string, studentId: string) =>
    request<LoginCodeOut>(`/api/students/${studentId}/login-code/regenerate`, { method: "POST", token }),
  getMastery: (token: string, studentId: string) =>
    request<MasteryStat[]>(`/api/students/${studentId}/mastery`, { token }),
  listAssignments: (token: string, studentId: string) =>
    request<Assignment[]>(`/api/students/${studentId}/assignments`, { token }),
  createAssignment: (token: string, studentId: string, data: { subject_id: string; topic_id?: string | null }) =>
    request<Assignment>(`/api/students/${studentId}/assignments`, {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteAssignment: (token: string, studentId: string, assignmentId: string) =>
    request<void>(`/api/students/${studentId}/assignments/${assignmentId}`, { method: "DELETE", token }),

  // --- students (self-scoped) ---
  getMyProfile: (token: string) => request<Student>("/api/students/me", { token }),
  getMyMastery: (token: string) => request<MasteryStat[]>("/api/students/me/mastery", { token }),
  getMyAssignedSubjects: (token: string) =>
    request<AssignedSubject[]>("/api/students/me/assigned-subjects", { token }),
  getMyBadges: (token: string) => request<Badge[]>("/api/students/me/badges", { token }),

  // --- subjects/topics (public library) ---
  listSubjects: () => request<Subject[]>("/api/subjects"),
  createSubject: (token: string, data: { name: string; description?: string; grade_level?: string }) =>
    request<Subject>("/api/subjects", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateSubject: (token: string, subjectId: string, data: { name?: string; description?: string; grade_level?: string }) =>
    request<Subject>(`/api/subjects/${subjectId}`, {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteSubject: (token: string, subjectId: string) =>
    request<void>(`/api/subjects/${subjectId}`, { method: "DELETE", token }),
  reorderSubjects: (token: string, items: ReorderItem[]) =>
    request<Subject[]>("/api/subjects/reorder", {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    }),
  listTopics: (subjectId: string) => request<Topic[]>(`/api/subjects/${subjectId}/topics`),
  createTopic: (token: string, subjectId: string, data: { name: string }) =>
    request<Topic>(`/api/subjects/${subjectId}/topics`, {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateTopic: (token: string, topicId: string, data: { name: string }) =>
    request<Topic>(`/api/subjects/topics/${topicId}`, {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteTopic: (token: string, topicId: string) =>
    request<void>(`/api/subjects/topics/${topicId}`, { method: "DELETE", token }),
  reorderTopics: (token: string, subjectId: string, items: ReorderItem[]) =>
    request<Topic[]>(`/api/subjects/${subjectId}/topics/reorder`, {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    }),

  // --- quiz ---
  nextQuestion: (token: string, topicId: string) =>
    request<QuestionOut>(`/api/quiz/next-question?topic_id=${encodeURIComponent(topicId)}`, { token }),
  listQuestions: (token: string, topicId: string, filter: QuestionFilter) =>
    request<QuestionOut[]>(
      `/api/quiz/questions?topic_id=${encodeURIComponent(topicId)}&filter=${filter}`,
      { token }
    ),
  revealAnswer: (token: string, questionId: string) =>
    request<{ correct_answer: string }>(`/api/quiz/reveal?question_id=${encodeURIComponent(questionId)}`, { token }),
  submitAnswer: (
    token: string,
    data: {
      student_id: string;
      question_id: string;
      submitted_answer: string;
      self_reported_correct?: boolean;
    }
  ) =>
    request<AttemptResult>("/api/quiz/submit", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  // --- pdfs ---
  uploadPdf: async (token: string, form: FormData): Promise<PdfUploadOut> => {
    const res = await fetch(`${BACKEND_URL}/api/pdfs/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.detail || res.statusText);
    }
    return res.json();
  },
  pdfStatus: (token: string, pdfId: string) =>
    request<PdfUploadOut>(`/api/pdfs/${pdfId}/status`, { token }),
  listPdfs: (token: string) => request<PdfOut[]>("/api/pdfs", { token }),
  updatePdf: (token: string, pdfId: string, data: { content_type: "theory" | "practice"; topic_id?: string }) =>
    request<PdfOut>(`/api/pdfs/${pdfId}`, {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deletePdf: (token: string, pdfId: string) => request<void>(`/api/pdfs/${pdfId}`, { method: "DELETE", token }),
  getTheoryPdfs: (token: string, scope: { subjectId: string } | { topicId: string }) =>
    request<TheoryPdf[]>(
      "subjectId" in scope
        ? `/api/pdfs/theory?subject_id=${encodeURIComponent(scope.subjectId)}`
        : `/api/pdfs/theory?topic_id=${encodeURIComponent(scope.topicId)}`,
      { token }
    ),

  // --- tutor chat ---
  tutorChat: (token: string, data: { subject_id: string; message: string; history: TutorChatMessage[] }) =>
    request<{ reply: string }>("/api/tutor/chat", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  // --- auth: password reset ---
  forgotPassword: (email: string) =>
    request<{ detail: string }>("/api/auth/parent/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),
};
