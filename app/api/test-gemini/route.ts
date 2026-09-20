import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "";

  if (!key) {
    return NextResponse.json({ error: "No key provided. Add ?key=YOUR_API_KEY to the URL" }, { status: 400 });
  }

  const trimmedKey = key.trim();
  const looksLikeGeminiKey = trimmedKey.startsWith("AIzaSy");
  const looksLikeOAuthToken = trimmedKey.startsWith("AQ.");

  // Test: List models (lightweight, no token cost)
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmedKey)}&pageSize=3`;
  let listStatus = 0;
  let listBody = "";
  try {
    const res = await fetch(listUrl);
    listStatus = res.status;
    listBody = await res.text();
  } catch (e: any) {
    listBody = `Fetch error: ${e.message}`;
  }

  let parsedError: any = null;
  try { parsedError = JSON.parse(listBody); } catch {}

  return NextResponse.json({
    key_prefix: trimmedKey.slice(0, 10) + "...",
    key_length: trimmedKey.length,
    looks_like_gemini_rest_key: looksLikeGeminiKey,
    looks_like_oauth_token: looksLikeOAuthToken,
    format_warning: looksLikeOAuthToken
      ? "This key starts with AQ. - this is a Google OAuth credential token, NOT a Gemini REST API key. Gemini REST API keys always start with AIzaSy. Go to https://aistudio.google.com/app/apikey, click the COPY icon next to an API Key row, and paste that value."
      : looksLikeGeminiKey
      ? "Key format looks correct (starts with AIzaSy)"
      : "Unrecognized key format - expected to start with AIzaSy",
    google_api_response_status: listStatus,
    google_api_error: parsedError?.error || null,
    google_api_raw_body: listBody.slice(0, 1000)
  });
}
