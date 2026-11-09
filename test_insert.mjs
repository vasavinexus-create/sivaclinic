
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orgs, error: orgError } = await supabase.from("organizations").select("*").ilike("clinic_name", "%SIVA CLINIC%");
  console.log("Orgs Error:", orgError);
  console.log("Orgs:", orgs);
  
  const { data: profiles, error: pError } = await supabase.from("profiles").select("*");
  console.log("Profiles Error:", pError);
  console.log("Profiles Count:", profiles?.length);
  
  if (profiles) {
    const siva = profiles.find(p => String(p.username).toLowerCase().includes("sivasankar") || String(p.full_name).toLowerCase().includes("sivasankar"));
    console.log("Profile:", siva);
  }
}
run();
