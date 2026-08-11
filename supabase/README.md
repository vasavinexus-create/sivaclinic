# SivaCare Supabase setup

1. Create a Supabase project and run the migration in `migrations/` with the Supabase CLI or SQL editor.
2. Copy `.env.example` to `.env.local` and add the project URL and anon key. Never place the service-role key in frontend variables.
3. Create the first organization, then invite a user through Supabase Authentication and add their `profiles` row with the same auth user UUID.

The migration creates tenant-aware clinic, consultation, prescription, pharmacy, inventory, purchase, supplier, cash and audit structures. RLS isolates every record by the signed-in user's organization. The private `prescriptions` bucket accepts JPG, PNG, WEBP and PDF files up to 10 MB.
