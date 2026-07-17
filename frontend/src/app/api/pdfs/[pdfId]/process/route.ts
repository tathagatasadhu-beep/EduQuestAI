import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ pdfId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { pdfId } = await params;
  try {
    const result = await api.startPdfProcessing(token, pdfId);
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not start processing.";
    return Response.json({ error: message }, { status });
  }
}
