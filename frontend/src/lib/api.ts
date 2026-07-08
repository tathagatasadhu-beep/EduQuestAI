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

export type MasteryStat = {
  topic_id: string;
  topic_name: string;
  accuracy_rate: number;
  total_first_attempts: number;
};

export type Subject = { id: string; name: string; description: string | null };
export type Topic = { id: string; subject_id: string; name: string };

export type QuestionOption = { option_label: string | null; option_text: string };
export type QuestionOut = {
  id: string;
  topic_id: string;
  prompt_text: string;
  prompt_latex: string | null;
  image_path: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  question_type: "multiple_choice" | "free_response";
  options: QuestionOption[];
};

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
  getMastery: (token: string, studentId: string) =>
    request<MasteryStat[]>(`/api/students/${studentId}/mastery`, { token }),

  // --- students (self-scoped) ---
  getMyProfile: (token: string) => request<Student>("/api/students/me", { token }),
  getMyMastery: (token: string) => request<MasteryStat[]>("/api/students/me/mastery", { token }),

  // --- subjects/topics (public library) ---
  listSubjects: () => request<Subject[]>("/api/subjects"),
  createSubject: (token: string, data: { name: string; description?: string }) =>
    request<Subject>("/api/subjects", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  listTopics: (subjectId: string) => request<Topic[]>(`/api/subjects/${subjectId}/topics`),

  // --- quiz ---
  nextQuestion: (token: string, topicId: string) =>
    request<QuestionOut>(`/api/quiz/next-question?topic_id=${encodeURIComponent(topicId)}`, { token }),
  submitAnswer: (
    token: string,
    data: { student_id: string; question_id: string; submitted_answer: string }
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
};
