import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const SettingsSchema = z.object({
  sales_gst_mode: z.string().optional(),
  sales_discount_percent: z.number().min(0).max(100).optional(),
  gemini_api_key: z.string().optional(),
  groq_api_key: z.string().optional(),
  gemini_model: z.string().optional(),
  clinic_name: z.string().optional(),
  pharmacy_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  gst_number: z.string().optional(),
  drug_license_number: z.string().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY configuration." }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role, active")
      .eq("id", session.user.id)
      .single();

    if (!profile?.active) return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
    if (profile.role !== "admin" && profile.role !== "software_owner") {
      return NextResponse.json({ error: "Only admins can update settings" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = SettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 422 });
    }

    // Perform write with Service Role Key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await adminClient
      .from("organizations")
      .update(parsed.data)
      .eq("id", profile.organization_id)
      .select("id,clinic_name,pharmacy_name,sales_gst_mode,sales_discount_percent")
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    console.error("Settings API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
