# -*- coding: utf-8 -*-
import codecs

path = 'app/api/v2/consultations/route.ts'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

# Make it print the reason it failed to the console and return it
new_block = """
    let user = session?.user;
    let failReason = "No session in cookies";
    if (!user) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        const { data: authData, error: authError } = await adminClient.auth.getUser(token);
        user = authData?.user;
        if (authError) failReason = `Token error: ${authError.message}`;
      } else {
        failReason = "No session in cookies and no Bearer token";
      }
    }

    if (!user) {
      console.log("[Auth Failed in Consultations API]", failReason);
      return NextResponse.json({ error: "Unauthorized", detail: failReason }, { status: 401 });
    }
"""

old_block = """
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
    }
"""
code = code.replace(old_block.strip(), new_block.strip())

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Updated route with debug")
