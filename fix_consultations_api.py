# -*- coding: utf-8 -*-
import codecs

path = 'app/api/v2/consultations/route.ts'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

old_auth = """    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Support Bearer token from V2 client (which uses localStorage)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }"""

new_auth = """    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    });

    const { data: { session } } = await supabase.auth.getSession();
    
    // Fallback to Bearer token if no cookie session
    let user = session?.user;
    if (!user) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        const { data: authData } = await adminClient.auth.getUser(token);
        user = authData?.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }"""

code = code.replace(old_auth, new_auth)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Fixed consultations API auth")
