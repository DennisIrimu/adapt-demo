import React, { useState, useEffect } from 'react';
import { useNode } from '../context/NodeContext';
import { api } from '../utils/api';
import { CheckCircle, XCircle, Loader, Shield, Copy, ExternalLink, AlertTriangle, Search, Globe } from 'lucide-react';
import InfoTip from './InfoTip';

export default function Identity() {
  const { user, peerOrgs, peerConnected, refresh, refreshKey } = useNode();
  const [orgs, setOrgs] = useState([]);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmStage, setConfirmStage] = useState('idle'); // 'idle' | 'running' | 'done' | 'error'
  const [confirmSteps, setConfirmSteps] = useState([]);
  const [confirmResult, setConfirmResult] = useState(null);
  const [registerTarget, setRegisterTarget] = useState(null);
  const [regNum, setRegNum] = useState('');
  const [regStage, setRegStage] = useState('input');
  const [regSteps, setRegSteps] = useState([]);
  const [regFailMsg, setRegFailMsg] = useState('');
  const [regAttestedBy, setRegAttestedBy] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [credentialOrg, setCredentialOrg] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.getOrgs().then(setOrgs).catch(() => {}); }, [refreshKey]);

  const myOrg = orgs.find(o => o.id === user.id) || { id: user.id, name: user.name, role: user.role };
  const allOrgs = [...orgs, ...peerOrgs.filter(po => !orgs.some(o => o.id === po.id))];
  const filteredAll = allOrgs.filter(o =>
    !searchQ ||
    o.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    (o.role || '').toLowerCase().includes(searchQ.toLowerCase())
  );

  // ── Registry confirmation flow ──
  const CONFIRM_STEPS = (org) => [
    `Connecting to ${org.attestedBy || 'national registry'}...`,
    'Querying registration database...',
    'Cross-referencing identity records...',
  ];

  const runConfirmation = async (org) => {
    setConfirmTarget(org);
    setConfirmStage('running');
    setConfirmResult(null);
    const steps = CONFIRM_STEPS(org).map((t, i) => ({ text: t, status: i === 0 ? 'checking' : 'pending' }));
    setConfirmSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 700));
      setConfirmSteps(prev => prev.map((s, j) => {
        if (j === i) return { ...s, status: 'passed' };
        if (j === i + 1) return { ...s, status: 'checking' };
        return s;
      }));
    }

    try {
      const data = await api.confirmVerification(org.id);
      setConfirmResult(data);
      setConfirmStage('done');
    } catch {
      setConfirmStage('error');
    }
  };

  // ── DID Registration flow (for unverified orgs) ──
  const REG_STEPS = [
    'Checking registration number format',
    'Querying national business registry',
    'Verifying licence status with issuing authority',
    'Generating Decentralised Identifier (DID)',
    'Issuing Verifiable Credential — anchoring on ledger',
  ];

  const runRegistration = async () => {
    if (regNum.length < 4) return;
    setRegStage('running');
    setRegFailMsg('');
    setRegAttestedBy('');
    setRegSteps(REG_STEPS.map((t, i) => ({ text: t, status: i === 0 ? 'checking' : 'pending', flash: '' })));

    let validation;
    try { validation = await api.validateCredential(regNum, registerTarget.id); } catch { validation = { valid: false, reason: 'Server error', failStep: 0 }; }

    const failAt = validation.valid ? -1 : (validation.failStep ?? 0);
    const authority = validation.attestedBy || '';

    for (let i = 0; i < REG_STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 700));
      if (i === failAt) {
        setRegSteps(prev => prev.map((s, j) => j === i ? { ...s, status: 'failed' } : s));
        setRegFailMsg(validation.reason);
        setRegStage('failed');
        return;
      }
      setRegSteps(prev => prev.map((s, j) => {
        if (j === i) {
          const flash = (j === 2 && authority) ? `Confirmed by ${authority} ✓` : '';
          return { ...s, status: 'passed', flash };
        }
        if (j === i + 1) return { ...s, status: 'checking' };
        return s;
      }));
      if (i === 2 && authority) setRegAttestedBy(authority);
    }

    try {
      await api.registerOrg(registerTarget.id, regNum);
      setRegStage('passed');
      refresh();
    } catch (err) {
      setRegFailMsg(err.message);
      setRegStage('failed');
    }
  };

  const copyDid = (did) => {
    navigator.clipboard.writeText(did).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Digital Identity</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>W3C DIDs anchored on the ADAPT ledger — verifiable by any party without contacting the issuing authority</div>
      </div>

      {/* ── YOUR IDENTITY ── */}
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
          Your Identity
        </div>

        {myOrg.verified ? (
          <div className="card" style={{ borderLeft: '4px solid #16a34a', background: 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <CheckCircle style={{ width: 18, height: 18, color: '#16a34a', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>Identity Verified</span>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>{myOrg.name}</h3>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>{myOrg.role}</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80, flexShrink: 0, marginTop: 1 }}>DID</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--text-primary)', flex: 1, wordBreak: 'break-all', lineHeight: 1.5 }}>{myOrg.did}</span>
                    <InfoTip title="Copy DID to clipboard" description="Copy this organisation's Decentralised Identifier to your clipboard" position="left">
                      <button onClick={() => copyDid(myOrg.did)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}>
                        <Copy style={{ width: 13, height: 13 }} />
                      </button>
                    </InfoTip>
                    {copied && <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>Copied!</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80, flexShrink: 0 }}>Reg. No.</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{myOrg.regNumber}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 80, flexShrink: 0, marginTop: 3 }}>Attested by</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 20, padding: '3px 10px' }}>
                      <CheckCircle style={{ width: 11, height: 11, color: '#16a34a', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>{myOrg.attestedBy}</span>
                    </div>
                  </div>
                </div>

                <InfoTip title="Confirm with National Registry" description={`Simulate a live API call to ${myOrg.attestedBy} to confirm this organisation's registration details`} position="right">
                  <button className="btn btn-p btn-sm" onClick={() => runConfirmation(myOrg)}>
                    <Globe style={{ width: 12, height: 12 }} /> Confirm with National Registry
                  </button>
                </InfoTip>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ borderLeft: '4px solid #ef4444', background: 'linear-gradient(135deg, #fef2f2 0%, #fff 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <XCircle style={{ width: 18, height: 18, color: '#ef4444' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>Identity Not Verified</span>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>{myOrg.name}</h3>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>{myOrg.role}</div>
            <div style={{ fontSize: 12.5, color: '#7f1d1d', marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
              This organisation has not registered a digital identity. No DID or attestation on record.
            </div>
            <InfoTip title="Register a Decentralised Identifier" description="Anchor a W3C DID on the ADAPT ledger to verify this organisation's identity" position="right">
              <button className="btn btn-p btn-sm" onClick={() => { setRegisterTarget(myOrg); setRegNum(''); setRegStage('input'); setRegSteps([]); setRegFailMsg(''); setRegAttestedBy(''); }}>
                <Shield style={{ width: 12, height: 12 }} /> Register Organisation
              </button>
            </InfoTip>
          </div>
        )}
      </div>

      {/* ── NETWORK PARTICIPANTS ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Network Participants</h3>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>All organisations on the ADAPT network — hover any row to confirm their identity</div>
          </div>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 9, top: 8, width: 13, height: 13, color: 'var(--text-muted)' }} />
            <input placeholder="Search..." value={searchQ} onChange={e => setSearchQ(e.target.value)} style={{ paddingLeft: 28, fontSize: 12, width: 180 }} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Organisation</th>
                <th>Role</th>
                <th>Reg. Number</th>
                <th>Status</th>
                <th style={{ maxWidth: 220 }}>Attested by</th>
                <th style={{ textAlign: 'center', width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredAll.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>No organisations found.</td></tr>
              )}
              {filteredAll.map(o => (
                <tr key={o.id} style={{ background: o.id === user.id ? 'rgba(255,114,0,0.04)' : undefined }}>
                  <td style={{ textAlign: 'center', paddingLeft: 12 }}>
                    {o.verified
                      ? <CheckCircle style={{ width: 14, height: 14, color: '#16a34a' }} />
                      : <XCircle style={{ width: 14, height: 14, color: '#ef4444' }} />}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
                    {o.id === user.id && <div style={{ fontSize: 10, color: '#289145', fontWeight: 700 }}>You</div>}
                    {o.nodeName && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{o.nodeName}</div>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.role}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{o.regNumber || '—'}</td>
                  <td>
                    {o.verified
                      ? <span className="pill pill-g pill-dot">Verified</span>
                      : <span className="pill pill-gr">Unverified</span>}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 220 }}>{o.attestedBy || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {o.verified ? (
                      <InfoTip title="Confirm with National Registry" description={`Simulate a live registry lookup to confirm ${o.name}'s registration details`} position="left">
                        <button className="btn btn-s btn-sm" style={{ fontSize: 10.5, padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => runConfirmation(o)}>
                          <ExternalLink style={{ width: 11, height: 11 }} /> Confirm
                        </button>
                      </InfoTip>
                    ) : o.id === user.id ? (
                      <InfoTip title="Register this organisation's DID" description="Start the DID registration process for this unverified organisation" position="left">
                        <button className="btn btn-p btn-sm" style={{ fontSize: 10.5, padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={() => { setRegisterTarget(o); setRegNum(''); setRegStage('input'); setRegSteps([]); setRegFailMsg(''); setRegAttestedBy(''); }}>
                          <Shield style={{ width: 11, height: 11 }} /> Register
                        </button>
                      </InfoTip>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Registry Confirmation Modal ── */}
      {confirmTarget && (
        <div className="modal-bg" onClick={() => { if (confirmStage !== 'running') { setConfirmTarget(null); setConfirmStage('idle'); setConfirmResult(null); } }}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h3>National Registry Lookup</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>
              Confirming identity for <strong>{confirmTarget.name}</strong> via {confirmTarget.attestedBy || 'national registry'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '10px 0' }}>
              {confirmSteps.map((s, i) => (
                <div key={i} className={`vs ${s.status}`}>
                  {s.status === 'checking' && <Loader style={{ width: 14, height: 14, animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                  {s.status === 'passed'   && <CheckCircle style={{ width: 14, height: 14, flexShrink: 0, color: '#16a34a' }} />}
                  {s.status === 'pending'  && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--card-border)', flexShrink: 0 }} />}
                  <span>{s.text}</span>
                </div>
              ))}
            </div>

            {confirmStage === 'done' && confirmResult && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                  <CheckCircle style={{ width: 16, height: 16, color: '#16a34a', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Identity Confirmed</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--card-border)' }}>
                  {[
                    ['Organisation', confirmResult.orgName],
                    ['Reg. Number',  confirmResult.regNumber],
                    ['Status',       confirmResult.status],
                    ['Registered',   confirmResult.registeredDate],
                    ['Address',      confirmResult.address],
                    ['Industry',     confirmResult.industry],
                    ['Directors',    (confirmResult.directors || []).join(', ')],
                    ['Attested by',  confirmResult.registry],
                    ['Confirmed at', new Date(confirmResult.confirmedAt).toLocaleString()],
                  ].map(([label, value], idx) => (
                    <div key={label} style={{ display: 'flex', padding: '9px 14px', background: idx % 2 === 0 ? 'var(--bg-page)' : 'var(--bg-card)', borderBottom: idx < 8 ? '1px solid var(--card-border)' : 'none' }}>
                      <span style={{ width: 105, fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: 11.5, wordBreak: 'break-word', flex: 1 }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {confirmStage === 'error' && (
              <div style={{ padding: 12, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', fontSize: 12.5, color: '#991b1b', marginTop: 12 }}>
                Registry lookup failed. No record found for this organisation.
              </div>
            )}

            <div className="modal-act" style={{ marginTop: 16 }}>
              <InfoTip title="Close" description="Close this registry confirmation dialog" position="top">
                <button className="btn btn-p" onClick={() => { setConfirmTarget(null); setConfirmStage('idle'); setConfirmResult(null); }} disabled={confirmStage === 'running'}>Close</button>
              </InfoTip>
            </div>
          </div>
        </div>
      )}

      {/* ── Register DID Modal (for unverified orgs) ── */}
      {registerTarget && (
        <div className="modal-bg" onClick={() => setRegisterTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Register {registerTarget.name}</h3>
            {regStage === 'input' && (
              <>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Enter a business registration number to anchor a DID on the ADAPT ledger.
                  Use <strong>BRN-123456</strong> to pass, or <strong>BRN-000000</strong> to see a denial.
                </p>
                <div className="fg">
                  <label>Registration Number</label>
                  <input value={regNum} onChange={e => setRegNum(e.target.value)} placeholder="e.g. BRN-123456" autoFocus />
                </div>
                <div className="modal-act">
                  <InfoTip title="Cancel registration" description="Abort without saving" position="top">
                    <button className="btn btn-s" onClick={() => setRegisterTarget(null)}>Cancel</button>
                  </InfoTip>
                  <InfoTip title="Verify & register DID" description="Check the company registration and anchor a DID on the ADAPT ledger" position="top">
                    <button className="btn btn-p" onClick={runRegistration} disabled={regNum.length < 4}>Verify & Register</button>
                  </InfoTip>
                </div>
              </>
            )}
            {(regStage === 'running' || regStage === 'passed' || regStage === 'failed') && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '10px 0' }}>
                  {regSteps.map((s, i) => (
                    <div key={i}>
                      <div className={`vs ${s.status}`} style={s.status === 'failed' ? { background: '#fef2f2', color: '#991b1b' } : {}}>
                        {s.status === 'checking' && <Loader style={{ width: 14, height: 14, animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                        {s.status === 'passed'   && <CheckCircle style={{ width: 14, height: 14, flexShrink: 0, color: '#16a34a' }} />}
                        {s.status === 'failed'   && <XCircle style={{ width: 14, height: 14, flexShrink: 0, color: '#ef4444' }} />}
                        {s.status === 'pending'  && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--card-border)', flexShrink: 0 }} />}
                        <span>{s.text}</span>
                      </div>
                      {s.status === 'passed' && s.flash && (
                        <div style={{ marginLeft: 28, marginTop: 2, fontSize: 11, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle style={{ width: 11, height: 11 }} /> {s.flash}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {regStage === 'passed' && (
                  <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', fontSize: 12.5, color: '#166634', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <div>
                      <div>Identity verified. DID issued and anchored on ledger.</div>
                      {regAttestedBy && <div style={{ marginTop: 3, fontWeight: 700 }}>Attested by {regAttestedBy}</div>}
                    </div>
                  </div>
                )}
                {regStage === 'failed' && (
                  <div style={{ padding: 12, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', fontSize: 12.5, color: '#991b1b', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
                    <div><div style={{ fontWeight: 700, marginBottom: 2 }}>Verification Failed</div>{regFailMsg}</div>
                  </div>
                )}
                <div className="modal-act">
                  {regStage === 'failed' && (
                    <InfoTip title="Try again" description="Go back and enter a different registration number" position="top">
                      <button className="btn btn-s" onClick={() => { setRegStage('input'); setRegSteps([]); setRegFailMsg(''); setRegAttestedBy(''); }}>Try Again</button>
                    </InfoTip>
                  )}
                  <InfoTip title={regStage === 'passed' ? 'Done' : 'Close'} description={regStage === 'passed' ? 'Return to the identity list' : 'Close without completing registration'} position="top">
                    <button className="btn btn-p" onClick={() => setRegisterTarget(null)}>{regStage === 'passed' ? 'Done' : 'Close'}</button>
                  </InfoTip>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Credential view modal (peer orgs) */}
      {credentialOrg && (
        <div className="modal-bg" onClick={() => setCredentialOrg(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Shield style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 15 }}>Verifiable Credential</h3>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Issued and anchored on the distributed ledger</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--card-border)' }}>
              {[
                ['Organisation', credentialOrg.name],
                ['DID', credentialOrg.did],
                ['Issued by', credentialOrg.attestedBy || 'ADAPT participant'],
                ['Reg. number', credentialOrg.regNumber || '—'],
                ['Node', credentialOrg.nodeName],
                ['Ledger hash', credentialOrg.did ? '0x' + credentialOrg.did.split(':').pop()?.slice(0, 16) + '...' : '—'],
              ].map(([label, value], idx) => (
                <div key={label} style={{ display: 'flex', padding: '10px 14px', background: idx % 2 === 0 ? 'var(--bg-page)' : 'var(--bg-card)', borderBottom: idx < 5 ? '1px solid var(--card-border)' : 'none' }}>
                  <span style={{ width: 110, fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 11.5, fontFamily: label === 'DID' || label === 'Ledger hash' ? 'var(--mono)' : 'inherit', wordBreak: 'break-all' }}>{value}</span>
                </div>
              ))}
            </div>
            <div className="modal-act" style={{ marginTop: 16 }}>
              <InfoTip title="Close credential view" description="Close the verifiable credential inspector" position="top">
                <button className="btn btn-p" onClick={() => setCredentialOrg(null)}>Close</button>
              </InfoTip>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
