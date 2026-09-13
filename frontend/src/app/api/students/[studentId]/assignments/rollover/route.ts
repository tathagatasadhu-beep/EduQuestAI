import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { studentId } = await params;
  const body = await req.json();
  try {
    const assignments = await api.rolloverAssignments(token, studentId, body);
    return Response.json(assignments);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not roll over assignments.";
    return Response.json({ error: message }, { status });
  }
}
