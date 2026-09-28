import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// Validation schema for a consultation
const ConsultationSchema = z.object({
  patient_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  symptoms: z.string().nullable().optional(),
  diagnosis: z.string().nullable().optional(),
  clinical_notes: z.string().nullable().optional(),
  prescription_notes: z.string().nullable().optional(),
  follow_up_date: z.string().nullable().optional(),
  doctor_fee: z.number().min(0),
});

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY configuration." }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    });

    const { data: { session } } = await supabase.auth.getSession();
    
    let user = session?.user;
    let failReason = "No session in cookies";
    if (!user) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        const { data: authData, error: authError } = await adminClient.auth.getUser(token);
        user = authData?.user || undefined;
        if (authError) failReason = `Token error: ${authError.message}`;
      } else {
        failReason = "No session in cookies and no Bearer token";
      }
    }

    if (!user) {
      console.log("[Auth Failed in Consultations API]", failReason);
      return NextResponse.json({ error: "Unauthorized", detail: failReason }, { status: 401 });
    }

    // Verify profile & role
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, organization_id, role, active")
      .eq("id", user.id)
      .single();

    if (!profile?.active) return NextResponse.json({ error: "Account is inactive" }, { status: 403 });

    // Parse payload
    const body = await request.json();
    const parsed = ConsultationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 422 });
    }

    // Execute with Service Role (Bypasses client-side RLS, securely inserts)
    
    const payload = {
      ...parsed.data,
      organization_id: profile.organization_id,
      created_by: profile.id,
      doctor_fee_collected: false,
    };

    // Transactional operations:
    // 1. Insert Consultation
    const { data: consultation, error: consultationError } = await adminClient
      .from("consultations")
      .insert(payload)
      .select("id")
      .single();

    if (consultationError) throw consultationError;

    // 2. Update Patient last_visit_at
    await adminClient
      .from("patients")
      .update({ last_visit_at: new Date().toISOString() })
      .eq("id", payload.patient_id)
      .eq("organization_id", profile.organization_id);

    return NextResponse.json({ data: consultation }, { status: 201 });
  } catch (error: any) {
    console.error("Consultations API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
