import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// Hardcoded allowlist of tables that can be modified via generic CRUD
const ALLOWED_TABLES = [
  "patients",
  "doctors",
  "suppliers",
  "products",
  "expenses",
  "expense_categories",
  "ledgers",
  "stock_adjustments",
  "consultation_templates",
  "payment_modes",
  // Note: users/profiles/settings should NOT be in this list for security
];

const CrudSchema = z.object({
  table: z.string().refine(val => ALLOWED_TABLES.includes(val), {
    message: "Table not allowed for generic CRUD operations",
  }),
  id: z.string().uuid().optional(),
  payload: z.record(z.string(), z.any()),
});

async function handleCrud(request: NextRequest, method: "POST" | "PUT") {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY configuration." }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Support both cookies (SSR) and Authorization header (localStorage client)
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    
    let userId: string | undefined;

    if (token) {
      const { data: { user }, error } = await adminClient.auth.getUser(token);
      if (error || !user) return NextResponse.json({ error: "Unauthorized token" }, { status: 401 });
      userId = user.id;
    } else {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      });
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      userId = session.user.id;
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, organization_id, role, active")
      .eq("id", userId)
      .single();

    if (!profile?.active) return NextResponse.json({ error: "Account is inactive" }, { status: 403 });

    const body = await request.json();
    const parsed = CrudSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 422 });
    }

    const { table, id, payload } = parsed.data;
    
    // Inject secure organizational scope
    const safePayload: Record<string, any> = {
      ...payload,
      organization_id: profile.organization_id,
    };
    
    // Removed created_by injection since not all tables have it

    let result;

    if (method === "PUT") {
      if (!id) return NextResponse.json({ error: "Missing ID for update" }, { status: 400 });
      result = await adminClient
        .from(table)
        .update(safePayload)
        .eq("id", id)
        .eq("organization_id", profile.organization_id) // Hard boundary check
        .select("id")
        .single();
    } else {
      result = await adminClient
        .from(table)
        .insert(safePayload)
        .select("id")
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({ data: result.data });
  } catch (error: any) {
    console.error("Generic CRUD API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleCrud(request, "POST");
}

export async function PUT(request: NextRequest) {
  return handleCrud(request, "PUT");
}
