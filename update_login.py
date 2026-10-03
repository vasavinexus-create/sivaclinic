# -*- coding: utf-8 -*-
import codecs

with codecs.open('app/v2/V2App.tsx', 'r', 'utf-8') as f:
    code = f.read()

old_func = """  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (email === 'demoadmin@sivacare.com' && password === 'admin') {
      const { error } = await supabase!.auth.signInWithPassword({ email: 'sivaclinic@gmail.com', password: 'password123' });
      if (error) { setError(error.message); setLoading(false); }
      return;
    }
    
    const { error: err } = await supabase!.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  };"""

new_func = """  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (email === 'demoadmin@sivacare.com' && password === 'admin') {
      const { error } = await supabase!.auth.signInWithPassword({ email: 'sivaclinic@gmail.com', password: 'password123' });
      if (error) { setError(error.message); setLoading(false); }
      return;
    }
    
    let loginEmail = email.trim();
    if (!loginEmail.includes("@")) {
      const { data, error: rpcErr } = await supabase!.rpc("get_email_for_username", { uname: loginEmail });
      if (rpcErr || !data) {
        setError("Invalid username");
        setLoading(false);
        return;
      }
      loginEmail = String(data);
    }
    
    const { error: err } = await supabase!.auth.signInWithPassword({ email: loginEmail, password });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  };"""

code = code.replace(old_func, new_func)

# Also rename the labels
code = code.replace("Email Address</label>", "Username or Email</label>")
code = code.replace("placeholder=\"Enter email\"", "placeholder=\"Enter username or email\"")
code = code.replace("type=\"email\"", "type=\"text\"")

with codecs.open('app/v2/V2App.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Updated login to support username")
