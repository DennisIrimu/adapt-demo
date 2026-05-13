import React, { useState } from 'react';
import { useNode } from '../context/NodeContext';

const ALPHA_GROUPS = [
  {
    label: 'Original Personas',
    creds: [
      { role: 'Exporter · Morocco',          username: 'nortex',       label: 'Nortex Minerals S.A.' },
      { role: 'Customs Authority · Morocco', username: 'macustoms',    label: 'Morocco Customs' },
      { role: 'Customs Authority · Nigeria', username: 'ngcustoms',    label: 'Nigeria Customs' },
      { role: 'Customs Authority · Kenya',   username: 'kra',          label: 'Kenya Revenue Authority' },
      { role: 'Financier',                   username: 'financier1',   label: 'Financier 1' },
      { role: 'Financier',                   username: 'financier2',   label: 'Financier 2' },
    ],
  },
  {
    label: 'Journey 1 — Exporters',
    creds: [
      { role: 'Exporter · Nigeria',   username: 'vestline',    label: 'Vestline Apparel Ltd',         journey: '1A — Urban MSME Exporter' },
      { role: 'Exporter · Tanzania',  username: 'highland',    label: 'Highland Growers Cooperative', journey: '1B — Smallholder Agri Exporter' },
      { role: 'Trader · West Africa', username: 'borderlink',  label: 'BorderLink Traders',           journey: '1C — Informal Cross-Border Trader' },
    ],
  },
  {
    label: 'Journey 2–3 — Finance & Logistics',
    creds: [
      { role: 'Financier · Nigeria', username: 'meridian',   label: 'Meridian Bank Trade Finance', journey: '2 — Trade Finance Bank' },
      { role: 'Logistics Operator',  username: 'transroute', label: 'TransRoute Logistics Ltd',    journey: '3 — Logistics Operator' },
    ],
  },
  {
    label: 'Journey 4 — Customs',
    creds: [
      { role: 'Customs Authority · Egypt', username: 'egcustoms', label: 'Egypt Customs Authority', journey: '4 — Destination Customs Officer' },
    ],
  },
  {
    label: 'Journey 6 — Financial Regulator',
    creds: [
      { role: 'Financial Regulator · Nigeria', username: 'cfregulator', label: 'Central Finance Regulator', journey: '6 — Central Bank Regulator' },
    ],
  },
];

const BETA_GROUPS = [
  {
    label: 'Original Personas',
    creds: [
      { role: 'Importer · Nigeria', username: 'agrinput',     label: 'AgriInput Supplies Ltd' },
      { role: 'Importer · Nigeria', username: 'horizontrade', label: 'HorizonTrade International' },
    ],
  },
  {
    label: 'Journey 5 — FMCG Importer',
    creds: [
      { role: 'Importer · Kenya', username: 'metropcg', label: 'Metro Consumer Goods Ltd', journey: '5 — FMCG Importer' },
    ],
  },
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

  const groups = isBeta ? BETA_GROUPS : ALPHA_GROUPS;

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
          {groups.map((group, gi) => (
            <div key={group.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0 4px', borderTop: gi > 0 ? '1px solid var(--card-border)' : 'none', marginTop: gi > 0 ? 6 : 0 }}>
                {group.label}
              </div>
              {group.creds.map(c => (
                <div key={c.username} className="cred-row" style={{ cursor: 'pointer', padding: '5px 0' }} onClick={() => handleQuick(c.username)}>
                  <span className="role">{c.role}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 11.5 }}>{c.label}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 10.5 }}>{c.username} / demo</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
