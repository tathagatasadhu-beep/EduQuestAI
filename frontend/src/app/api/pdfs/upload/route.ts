import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";

// Give this route more room than Vercel's default function timeout — the
// backend (Render free tier) can take 30-60s+ to wake up from a cold start
// on top of the actual upload.
export const maxDuration = 60;

export async function POST(req: Request) {
  const token = await getParentToken();
  if (!token) return Response.json({ error: "Not authenticated." }, { status: 401 });

  const form = await req.formData();
  try {
    const pdf = await api.uploadPdf(token, form);
    return Response.json(pdf);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message = err instanceof ApiError ? err.message : "Upload failed.";
    return Response.json({ error: message }, { status });
  }
}
