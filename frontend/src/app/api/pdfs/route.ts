import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function GET() {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const pdfs = await api.listPdfs(token);
    return Response.json(pdfs);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not fetch PDFs.";
    return Response.json({ error: message }, { status });
  }
}
