import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

async function getAuthenticatedUser(request: NextRequest, adminClient: any) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: authData, error: authError } = await adminClient.auth.getUser(token);
    if (!authError && authData?.user) {
      return { user: authData.user, token };
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const ssrClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  });
  const { data: { session } } = await ssrClient.auth.getSession();
  return session?.user ? { user: session.user, token: session.access_token || null } : null;
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Missing Supabase configuration." }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const authResult = await getAuthenticatedUser(request, adminClient);
    if (!authResult?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = authResult.user;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, organization_id, role, active")
      .eq("id", user.id)
      .single();

    if (!profile?.active) {
      return NextResponse.json({ error: "Account inactive" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("id");
    const query = searchParams.get("search");

    // Search autocomplete mode
    if (!patientId && query !== null) {
      const trimmed = (query || "").trim();
      let dbQuery = adminClient
        .from("patients")
        .select("id, patient_id, name, mobile, age, gender, created_at")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(25);

      if (trimmed) {
        dbQuery = dbQuery.or(`name.ilike.%${trimmed}%,patient_id.ilike.%${trimmed}%,mobile.ilike.%${trimmed}%`);
      }

      const { data: patients, error: searchErr } = await dbQuery;
      if (searchErr) throw searchErr;
      return NextResponse.json({ patients: patients || [] });
    }

    if (!patientId) {
      return NextResponse.json({ error: "Missing patient ID" }, { status: 400 });
    }

    // Single patient detail & dependency preview
    const { data: patient, error: pErr } = await adminClient
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .eq("organization_id", profile.organization_id)
      .single();

    if (pErr || !patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Fetch consultations (clinical data)
    const { data: consultations } = await adminClient
      .from("consultations")
      .select("id, visited_at, symptoms, diagnosis, doctor_fee, doctor_fee_collected")
      .eq("patient_id", patientId)
      .eq("organization_id", profile.organization_id)
      .order("visited_at", { ascending: false });

    const consultationList = consultations || [];
    const consultationIds = consultationList.map((c: any) => c.id);

    // Fetch prescription attachments (clinical data)
    let attachmentsQuery = adminClient
      .from("prescription_attachments")
      .select("id, file_name, storage_path, content_type, created_at")
      .eq("organization_id", profile.organization_id);

    if (consultationIds.length > 0) {
      attachmentsQuery = attachmentsQuery.or(`patient_id.eq.${patientId},consultation_id.in.(${consultationIds.join(",")})`);
    } else {
      attachmentsQuery = attachmentsQuery.eq("patient_id", patientId);
    }
    const { data: attachments } = await attachmentsQuery;
    const attachmentList = attachments || [];

    // Fetch sales / bills (safely preserved records)
    let salesQuery = adminClient
      .from("sales")
      .select("id, invoice_no, sold_at, grand_total, status, doctor_fee, pharmacy_revenue, payment_mode, sale_type")
      .eq("organization_id", profile.organization_id)
      .order("sold_at", { ascending: false });

    if (consultationIds.length > 0) {
      salesQuery = salesQuery.or(`patient_id.eq.${patientId},consultation_id.in.(${consultationIds.join(",")})`);
    } else {
      salesQuery = salesQuery.eq("patient_id", patientId);
    }
    const { data: sales } = await salesQuery;
    const salesList = sales || [];
    const salesTotal = salesList.reduce((sum: number, s: any) => sum + Number(s.grand_total || 0), 0);

    // Fetch payments (safely preserved records)
    const { data: payments } = await adminClient
      .from("payments")
      .select("id, paid_at, amount, mode, reference_number")
      .eq("patient_id", patientId)
      .eq("organization_id", profile.organization_id)
      .order("paid_at", { ascending: false });

    const paymentList = payments || [];
    const paymentsTotal = paymentList.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

    // Fetch patient ledger (clinical patient credit/debit account)
    const { data: ledgerEntries } = await adminClient
      .from("patient_ledger")
      .select("id, occurred_on, particulars, debit, credit, reference_number")
      .eq("patient_id", patientId)
      .eq("organization_id", profile.organization_id)
      .order("occurred_on", { ascending: false });

    const ledgerList = ledgerEntries || [];
    const totalDebit = ledgerList.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
    const totalCredit = ledgerList.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
    const ledgerBalance = totalDebit - totalCredit;

    return NextResponse.json({
      patient,
      stats: {
        consultationsCount: consultationList.length,
        consultations: consultationList.slice(0, 10),
        prescriptionsCount: attachmentList.length,
        prescriptionFiles: attachmentList.map((a: any) => a.file_name),
        ledgerCount: ledgerList.length,
        ledgerBalance,
        // Informative stats for preserved financial & billing records
        salesCount: salesList.length,
        salesTotal,
        sales: salesList.slice(0, 10),
        paymentsCount: paymentList.length,
        paymentsTotal,
      },
    });
  } catch (error: any) {
    console.error("GET /api/v2/patients error:", error);
    return NextResponse.json({ error: error.message || "Failed to load patient preview" }, { status: 500 });
  }
}

async function executeCascadePatientDelete(
  patientId: string,
  profile: any,
  user: any,
  adminClient: any,
  userClient: any
) {
  // 1. Fetch patient record
  const { data: patient, error: pErr } = await adminClient
    .from("patients")
    .select("id, patient_id, name, organization_id")
    .eq("id", patientId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (pErr || !patient) {
    return { error: "Patient not found or already deleted", status: 404 };
  }

  // 2. Fetch all consultations for this patient
  const { data: consultations } = await adminClient
    .from("consultations")
    .select("id")
    .eq("patient_id", patientId)
    .eq("organization_id", profile.organization_id);
  const consultationIds = (consultations || []).map((c: any) => c.id);

  // 3. Break circular foreign key: consultation -> doctor_fee_collected_bill_id
  await adminClient
    .from("consultations")
    .update({ doctor_fee_collected_bill_id: null })
    .eq("patient_id", patientId)
    .eq("organization_id", profile.organization_id);

  // 4. Detach sales: DO NOT DELETE SALES, SALE ITEMS, STOCK, OR CASH
  // Detach patient_id and consultation_id so sales records remain 100% intact
  const clientForSales = userClient || adminClient;
  let salesDetachQuery = clientForSales
    .from("sales")
    .update({ patient_id: null, consultation_id: null })
    .eq("organization_id", profile.organization_id);

  if (consultationIds.length > 0) {
    salesDetachQuery = salesDetachQuery.or(
      `patient_id.eq.${patientId},consultation_id.in.(${consultationIds.join(",")})`
    );
  } else {
    salesDetachQuery = salesDetachQuery.eq("patient_id", patientId);
  }
  const { data: detachedSales, error: detachSalesErr } = await salesDetachQuery.select("id, invoice_no");
  if (detachSalesErr) {
    console.warn("UserClient sales detach warning, trying admin client:", detachSalesErr.message);
    await adminClient
      .from("sales")
      .update({ patient_id: null, consultation_id: null })
      .eq("organization_id", profile.organization_id)
      .eq("patient_id", patientId);
  }
  const detachedSalesCount = detachedSales?.length || 0;

  // 5. Detach payments: DO NOT DELETE PAYMENTS OR CASH LEDGER
  const { data: detachedPayments } = await adminClient
    .from("payments")
    .update({ patient_id: null })
    .eq("patient_id", patientId)
    .eq("organization_id", profile.organization_id)
    .select("id");
  const detachedPaymentsCount = detachedPayments?.length || 0;

  // 6. Delete patient personal ledger account
  await adminClient
    .from("patient_ledger")
    .delete()
    .eq("patient_id", patientId)
    .eq("organization_id", profile.organization_id);

  // 7. Delete prescription files from storage & table (clinical data)
  let attachQuery = adminClient
    .from("prescription_attachments")
    .select("id, storage_path")
    .eq("organization_id", profile.organization_id);

  if (consultationIds.length > 0) {
    attachQuery = attachQuery.or(
      `patient_id.eq.${patientId},consultation_id.in.(${consultationIds.join(",")})`
    );
  } else {
    attachQuery = attachQuery.eq("patient_id", patientId);
  }

  const { data: attachRows } = await attachQuery;
  const filePaths = (attachRows || []).map((a: any) => a.storage_path).filter(Boolean);
  if (filePaths.length > 0) {
    try {
      await adminClient.storage.from("prescriptions").remove(filePaths);
    } catch (storageErr) {
      console.warn("Storage file removal warning:", storageErr);
    }
  }

  if (attachRows && attachRows.length > 0) {
    const attachIds = attachRows.map((a: any) => a.id);
    await adminClient
      .from("prescription_attachments")
      .delete()
      .in("id", attachIds)
      .eq("organization_id", profile.organization_id);
  }

  // 8. Delete consultations (clinical data: visits, symptoms, diagnosis, vitals, prescriptions)
  await adminClient
    .from("consultations")
    .delete()
    .eq("patient_id", patientId)
    .eq("organization_id", profile.organization_id);

  // 9. Delete the patient master record
  const { error: finalErr } = await adminClient
    .from("patients")
    .delete()
    .eq("id", patientId)
    .eq("organization_id", profile.organization_id);

  if (finalErr) {
    throw finalErr;
  }

  // 10. Write audit log
  await adminClient.from("audit_logs").insert({
    organization_id: profile.organization_id,
    user_id: user.id,
    action: "delete_patient_clinical_only",
    module: "patients",
    record_id: patientId,
    new_value: {
      patient_id: patient.patient_id,
      patient_name: patient.name,
      deleted_consultations: consultationIds.length,
      deleted_attachments: filePaths.length,
      detached_sales: detachedSalesCount,
      detached_payments: detachedPaymentsCount,
      sales_preserved: true,
      cash_ledger_preserved: true,
      stock_preserved: true,
      journals_preserved: true,
      deleted_by_name: profile.full_name || profile.id,
      deleted_at: new Date().toISOString(),
    },
  });

  return {
    success: true,
    message: `Patient ${patient.name} (${patient.patient_id}) and clinical records were deleted. Sales bills, cash receipts, stock inventory, and accounting records remain completely preserved.`,
    details: {
      patient_id: patient.patient_id,
      patient_name: patient.name,
      consultationsCount: consultationIds.length,
      attachmentsCount: filePaths.length,
      detachedSalesCount,
      detachedPaymentsCount,
      salesPreserved: true,
      cashPreserved: true,
      stockPreserved: true,
    },
  };
}

export async function DELETE(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Missing Supabase configuration." }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const authResult = await getAuthenticatedUser(request, adminClient);
    if (!authResult?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, token } = authResult;

    const userClient = token && supabaseAnonKey
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        })
      : adminClient;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, organization_id, role, active, full_name")
      .eq("id", user.id)
      .single();

    if (!profile?.active) {
      return NextResponse.json({ error: "Account inactive" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    let patientId = searchParams.get("id");

    if (!patientId) {
      try {
        const body = await request.json();
        patientId = body?.id || body?.patient_id;
      } catch {}
    }

    if (!patientId) {
      return NextResponse.json({ error: "Missing patient ID to delete" }, { status: 400 });
    }

    const result = await executeCascadePatientDelete(patientId, profile, user, adminClient, userClient);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("DELETE /api/v2/patients error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete patient and records" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.action === "delete") {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: "Missing Supabase configuration." }, { status: 500 });
      }

      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const authResult = await getAuthenticatedUser(request, adminClient);
      if (!authResult?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const { user, token } = authResult;

      const userClient = token && supabaseAnonKey
        ? createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
          })
        : adminClient;

      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, organization_id, role, active, full_name")
        .eq("id", user.id)
        .single();

      if (!profile?.active) {
        return NextResponse.json({ error: "Account inactive" }, { status: 403 });
      }

      const patientId = body.id || body.patient_id;

      if (!patientId) {
        return NextResponse.json({ error: "Missing patient ID to delete" }, { status: 400 });
      }

      const result = await executeCascadePatientDelete(patientId, profile, user, adminClient, userClient);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status || 400 });
      }

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/v2/patients error:", error);
    return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 });
  }
}
