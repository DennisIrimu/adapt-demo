import React, { useState } from 'react';
import { useNode } from '../context/NodeContext';

const ALPHA_CREDS = [
  { role: 'Exporter · Morocco',          username: 'atlas',      label: 'AtlasPhosphate S.A.' },
  { role: 'Customs Authority · Morocco', username: 'macustoms',  label: 'Morocco Customs' },
  { role: 'Customs Authority · Nigeria', username: 'ngcustoms',  label: 'Nigeria Customs' },
  { role: 'Customs Authority · Kenya',   username: 'kra',        label: 'Kenya Revenue Authority' },
  { role: 'Financier',                   username: 'financier1', label: 'Financier 1' },
  { role: 'Financier',                   username: 'financier2', label: 'Financier 2' },
];

const BETA_CREDS = [
  { role: 'Importer · Nigeria',       username: 'primefert',  label: 'PrimeFert Nigeria Ltd' },
  { role: 'Importer · Nigeria',       username: 'tradelink',  label: 'TradeLink International Ltd' },
];

export default function Login() {
  const { login } = useNode();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Detect node via port (direct) or ?node= param / cookie (via proxy)
  const port = window.location.port;
  const nodeParam = new URLSearchParams(window.location.search).get('node');
  const cookieNode = document.cookie.match(/adapt-node=(\w+)/)?.[1];
  const isBeta = port === '4001' || nodeParam === 'beta' || (nodeParam !== 'alpha' && cookieNode === 'beta');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    }
    setLoading(false);
  };

  const handleQuick = (u) => {
    setUsername(u);
    setPassword('demo');
  };

  const creds = isBeta ? BETA_CREDS : ALPHA_CREDS;

  return (
    <div className="login-pg">
      <div className="login-box">
        <div className="login-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
          <img src="/adapt-logo.png" alt="ADAPT" className="login-logo-img" style={{ height: 36, width: 36, objectFit: 'contain' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>ADAPT</span>
            
          </div>
        </div>
        <p className="sub" style={{ marginTop: 10 }}>Trade & Logistics Platform — Sign in to your organisation</p>

        <div className="node-badge">
          Node: <strong>{isBeta ? 'Beta — Importers / Nigeria' : 'Alpha — Exporters & Customs'}</strong>
        </div>

        {error && <div className="err">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter username" autoFocus />
          </div>
          <div className="fg">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" />
          </div>
          <button type="submit" className="btn btn-p" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="demo-creds">
          <div className="dc-title">Quick Sign-In</div>
          {creds.map(c => (
            <div key={c.username} className="cred-row" style={{ cursor: 'pointer', padding: '5px 0' }} onClick={() => handleQuick(c.username)}>
              <span className="role">{c.role}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 11.5 }}>{c.label}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 10.5 }}>{c.username} / demo</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
