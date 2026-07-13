import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { studentId } = await params;
  const body = await req.json();
  try {
    const student = await api.updateStudent(token, studentId, body);
    return Response.json(student);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not update student.";
    return Response.json({ error: message }, { status });
  }
}
