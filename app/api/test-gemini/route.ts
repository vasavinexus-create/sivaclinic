import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") || "";

  if (!key) {
    return NextResponse.json({ error: "No key provided. Add ?key=YOUR_API_KEY to the URL" }, { status: 400 });
  }

  const trimmedKey = key.trim();

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
    format_note: "No local prefix check is applied. The Google API response below is the source of truth for whether the key is valid.",
    google_api_response_status: listStatus,
    google_api_error: parsedError?.error || null,
    google_api_raw_body: listBody.slice(0, 1000)
  });
}
