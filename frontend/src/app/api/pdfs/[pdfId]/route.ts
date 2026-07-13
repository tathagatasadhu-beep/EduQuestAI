import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ pdfId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { pdfId } = await params;
  const body = await req.json();
  try {
    const pdf = await api.updatePdf(token, pdfId, body);
    return Response.json(pdf);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not update PDF.";
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ pdfId: string }> }
) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const { pdfId } = await params;
  try {
    await api.deletePdf(token, pdfId);
    return new Response(null, { status: 204 });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Could not delete PDF.";
    return Response.json({ error: message }, { status });
  }
}
