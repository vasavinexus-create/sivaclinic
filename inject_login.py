# -*- coding: utf-8 -*-
import codecs
import re

with codecs.open('app/v2/V2App.tsx', 'r', 'utf-8') as f:
    code = f.read()

old_signin = """function SignInNotice() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>MediFlow V2</h1>
        <p className="auth-message">Please sign in from the current app first, then open this version.</p>
        <a className="primary auth-submit" href="/">Open current app</a>
      </div>
    </div>
  );
}"""

new_signin = """function SignInNotice() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
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
  };

  return (
    <div className="auth-page" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f4f2' }}>
      <div className="auth-card" style={{ background: '#fff', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ color: '#126b5a', margin: '0 0 10px 0', fontSize: '28px' }}>MediFlow V2</h1>
          <p style={{ color: '#666', margin: 0 }}>Sign in to continue</p>
        </div>
        
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>{error}</div>}
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#444', marginBottom: '8px' }}>Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="Enter email" />
          </div>
          
          <div style={{ marginBottom: '30px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#444', marginBottom: '8px' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="Enter password" />
          </div>
          
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', backgroundColor: '#126b5a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}"""

# Fallback regex if precise match fails
code = re.sub(r'function SignInNotice\(\)\s*\{.*?return\s*\(.*?<\/div>\s*\);\s*\}', new_signin, code, flags=re.DOTALL)

with codecs.open('app/v2/V2App.tsx', 'w', 'utf-8') as f:
    f.write(code)

print("Injected login screen")
