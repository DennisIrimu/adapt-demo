import React, { useState, useEffect } from 'react';
import { useNode } from '../context/NodeContext';
import { api } from '../utils/api';
import { Crown, Shield } from 'lucide-react';
import InfoTip from './InfoTip';

export default function Permissions() {
  const { user, peerOrgs, refresh, refreshKey } = useNode();
  const [consignments, setConsignments] = useState([]);
  const [allOrgs, setAllOrgs] = useState([]);
  const [permsMap, setPermsMap] = useState({});

  useEffect(() => {
    api.getConsignments(user.id).then(async (cs) => {
      setConsignments(cs);
      const pm = {};
      for (const c of cs) { pm[c.id] = await api.getPermissions(c.id).catch(() => ({})); }
      setPermsMap(pm);
    }).catch(() => {});
    api.getAllOrgs().then(orgs => {
      const combined = [...orgs];
      peerOrgs.forEach(po => { if (!combined.some(o => o.id === po.id)) combined.push(po); });
      setAllOrgs(combined);
    }).catch(() => {});
  }, [user.id, refreshKey, peerOrgs]);

  const toggle = async (consignmentId, orgId, orgName, currentPerm, creatorId) => {
    if (orgId === creatorId) return;
    if (currentPerm) {
      await api.revokeAccess({ consignmentId, recipientOrgId: orgId, recipientOrgName: orgName, revokerOrgName: user.name });
    } else {
      await api.shareConsignment({ consignmentId, recipientOrgId: orgId, recipientOrgName: orgName, sharerOrgName: user.name });
    }
    refresh();
  };

  return (
    <div className="stack">
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Access Control</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Manage which organisations can view each consignment and its documents</div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield style={{ width: 16, height: 16, color: 'var(--amber)' }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Access Matrix</h3>
          </div>
          <span className="pill pill-b">{consignments.length} consignments</span>
        </div>
        <div style={{ padding: '10px 20px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
          Click cells to grant or revoke access. <Crown style={{ width: 12, height: 12, color: '#f59e0b', display: 'inline', verticalAlign: 'middle' }} /> = owner. All changes are anchored on ledger.
        </div>
        {consignments.length === 0 ? <div className="empty">No consignments to show permissions for.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <InfoTip title="Consignment UCR" description="Unique Consignment Reference — click a row to expand full details." position="right">
                    <th style={{ minWidth: 200 }}>Consignment</th>
                  </InfoTip>
                  {allOrgs.map(o => (
                    <InfoTip key={o.id} title={o.name} description={`Toggle access level for ${o.name}. Owner = full access; Viewer = read-only; ✗ = no access.`} position="top">
                      <th style={{ textAlign: 'center', minWidth: 110, fontSize: 9.5 }}>{o.name}</th>
                    </InfoTip>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consignments.map(c => {
                  const p = permsMap[c.id] || {};
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 12, fontFamily: 'var(--mono)' }}>{c.ucr}</div>
                        {c.product && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>{c.product.slice(0, 30)}</div>}
                      </td>
                      {allOrgs.map(o => {
                        const isOwner = p[o.id] === 'owner';
                        const hasAccess = isOwner || p[o.id] === 'viewer';
                        return (
                          <InfoTip key={o.id} title={isOwner ? 'Owner' : hasAccess ? 'Viewer — click to revoke' : 'No access — click to grant'} description={isOwner ? `${o.name} created this consignment and has full owner access.` : hasAccess ? `${o.name} has read-only access. Click to revoke.` : `${o.name} has no access. Click to grant viewer access.`} position="top">
                            <td className="perm-cell" onClick={() => toggle(c.id, o.id, o.name, p[o.id], c.creatorOrgId)} style={{ cursor: isOwner ? 'default' : 'pointer' }}>
                              {isOwner
                                ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                    <Crown style={{ width: 12, height: 12, color: '#f59e0b' }} />
                                    <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
                                  </span>
                                : hasAccess
                                  ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
                                  : <span style={{ color: '#d1d5db' }}>✗</span>}
                            </td>
                          </InfoTip>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="g3">
        {[
          { n: '1', title: 'Owner controls', desc: 'The consignment creator decides who can view their data. No central authority can override.' },
          { n: '2', title: 'Encrypted sharing', desc: 'Data is encrypted in transit. Only permitted parties receive decryption keys via TLIP.' },
          { n: '3', title: 'Auditable', desc: 'Every grant and revocation is recorded on ledger with timestamp and cryptographic hash.' },
        ].map(r => (
          <div key={r.n} style={{ padding: 16, background: '#f0fdf4', borderRadius: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginBottom: 4 }}>{r.n}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 4 }}>{r.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
