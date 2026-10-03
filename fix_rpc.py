# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/V2App.tsx', 'r', 'utf-8') as f:
    code = f.read()

old_rpc = """const { data, error: rpcErr } = await supabase!.rpc("get_email_for_username", { uname: loginEmail });"""
new_rpc = """const { data, error: rpcErr } = await supabase!.rpc("login_email_for_username", { p_username: loginEmail });"""

code = code.replace(old_rpc, new_rpc)

with codecs.open('app/v2/V2App.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Fixed RPC call")
