import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function POST(req: Request) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json();
  try {
    const result = await api.createPdfUploadUrl(token, body);
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not start the upload.";
    return Response.json({ error: message }, { status });
  }
}
