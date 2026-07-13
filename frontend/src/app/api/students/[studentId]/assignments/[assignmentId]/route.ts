import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ studentId: string; assignmentId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { studentId, assignmentId } = await params;
  try {
    await api.deleteAssignment(token, studentId, assignmentId);
    return new Response(null, { status: 204 });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not delete assignment.";
    return Response.json({ error: message }, { status });
  }
}
