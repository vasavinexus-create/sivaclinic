# -*- coding: utf-8 -*-
import codecs

path = 'lib/powersync/PowerSyncProvider.tsx'
with codecs.open(path, 'r', 'utf-8') as f:
    code = f.read()

code = code.replace("await supabase.auth.getSession()", "await supabase!.auth.getSession()")
code = code.replace("supabase.auth.onAuthStateChange", "supabase!.auth.onAuthStateChange")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(code)
print("Fixed PowerSyncProvider.tsx")
