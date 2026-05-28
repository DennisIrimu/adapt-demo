import React, { useState, useEffect } from 'react';
import { useNode } from '../context/NodeContext';
import { api } from '../utils/api';
import XmlViewer from './XmlViewer';
import {
  FileStack, TrendingUp, Activity, Wifi, WifiOff, Radio, Link2, Unlink, Server,
  AlertTriangle, FileText, Download, Eye, Code2, X, ChevronLeft, Globe, ArrowRight
} from 'lucide-react';
import InfoTip from './InfoTip';

function fmtValue(val, currency = 'USD') {
  if (!val || isNaN(Number(val))) return '—';
  const n = Number(val);
  if (currency === 'KES') {
    if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000)     return `KES ${(n / 1_000).toFixed(1)}K`;
    return `KES ${n.toLocaleString()}`;
  }
  const sym = currency === 'EUR' ? '€' : '$';
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${sym}${(n / 1_000).toFixed(0)}K`;
  return `${sym}${n.toLocaleString()}`;
}

function StatusPill({ status }) {
  const map = {
    'In Transit': 'pill pill-dot pill-active',
    'Customs':    'pill pill-dot pill-active',
    'Submitted':  'pill pill-dot pill-active',
    'Released':   'pill pill-dot pill-active',
    'Delivered':  'pill pill-dot pill-delivered',
    'Draft':      'pill pill-dot pill-draft',
    'Under Review': 'pill pill-dot pill-review',
  };
  return <span className={map[status] || 'pill pill-dot pill-draft'}>{status || 'Draft'}</span>;
}

function DocsPill({ count, total }) {
  const cls = count === total ? 'docs-pill docs-complete' : count < total / 2 ? 'docs-pill docs-low' : 'docs-pill docs-partial';
  return <span className={cls}>{count}/{total}</span>;
}

const DOC_COLORS = {
  'Bill of Lading':          { bg: '#fef9ec', color: '#F3A31E' },
  'Insurance Certificate':   { bg: '#fef9ec', color: '#F3A31E' },
  'Certificate of Origin':   { bg: '#f0fdf4', color: '#16a34a' },
  'Commercial Invoice':      { bg: '#e8f5ed', color: '#289145' },
  'Packing List':            { bg: '#e8f5ed', color: '#289145' },
  'Export Declaration':      { bg: '#e8f5ed', color: '#289145' },
};

function DocTypeIcon({ docType }) {
  const c = DOC_COLORS[docType] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <div style={{ width: 30, height: 30, borderRadius: 7, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <FileText style={{ width: 14, height: 14, color: c.color }} />
    </div>
  );
}

export default function Dashboard({ searchQ = '', onViewDocs, onNavigate }) {
  const { nodeInfo, peerConnected, peerOrgs, tangleLog, user, refreshKey, refresh } = useNode();
  const [orgs, setOrgs] = useState([]);
  const [consignments, setConsignments] = useState([]);
  const [discoverable, setDiscoverable] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [selectedC, setSelectedC] = useState(null);
  const [docs, setDocs] = useState([]);
  const [viewingXml, setViewingXml] = useState(null);

  useEffect(() => {
    api.getOrgs().then(setOrgs).catch(() => {});
    api.getConsignments(user.id).then(setConsignments).catch(() => {});
    api.discoverNodes().then(setDiscoverable).catch(() => {});
  }, [user.id, refreshKey, peerConnected]);

  useEffect(() => {
    if (selectedC) api.getDocuments(user.id, selectedC.id).then(setDocs).catch(() => {});
    else setDocs([]);
  }, [selectedC, user.id, refreshKey]);

  const handleConnect = async () => {
    setConnecting(true);
    try { await api.connectNode(); refresh(); } catch {}
    setConnecting(false);
    setShowDiscover(false);
  };

  const handleDisconnect = async () => {
    await api.disconnectNode();
    refresh();
  };

  const verified = orgs.filter(o => o.verified).length;
  const totalValue = consignments.reduce((s, c) => s + (c.totalValue || 0), 0);
  const errorCount = consignments.filter(c => c.errorType).length;
  // Only count ledger events that belong to consignments visible to this org
  const myUcrs = new Set(consignments.map(c => c.ucr).filter(Boolean));
  const visibleEvents = tangleLog.filter(e => e.details && [...myUcrs].some(ucr => e.details.includes(ucr)));
  const hasData = consignments.length > 0;

  const filtered = searchQ
    ? consignments.filter(c =>
        c.ucr?.toLowerCase().includes(searchQ.toLowerCase()) ||
        c.product?.toLowerCase().includes(searchQ.toLowerCase()) ||
        c.exporter?.toLowerCase().includes(searchQ.toLowerCase()) ||
        c.importer?.toLowerCase().includes(searchQ.toLowerCase())
      )
    : consignments;

  const recent = filtered.slice(0, 8);

  if (viewingXml) {
    return (
      <div className="stack">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-s btn-sm" onClick={() => setViewingXml(null)}>
            <ChevronLeft style={{ width: 13, height: 13 }} /> Back to Dashboard
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{viewingXml.title} · {selectedC?.ucr}</span>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Code2 style={{ width: 16, height: 16, color: 'var(--accent)' }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{viewingXml.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{viewingXml.format} · Ref: {viewingXml.reference}</div>
              </div>
            </div>
            <a href={api.downloadUrl(viewingXml.id)} className="btn btn-s btn-sm">
              <Download style={{ width: 12, height: 12 }} /> Download
            </a>
          </div>
          <div style={{ padding: 16 }}>
            <XmlViewer docId={viewingXml.id} docType={viewingXml.docType} errorType={selectedC?.errorType} errorDescription={selectedC?.errorDescription} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Stats */}
      <div className="g4">
        <div className="stat-card">
          <div className="stat-icon orange"><FileStack /></div>
          <div className="stat-label">Active Consignments</div>
          <div className="stat-value">{hasData ? consignments.length : '—'}</div>
          <div className="stat-sub">{hasData ? `${verified} orgs verified` : 'No shared consignments'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><TrendingUp /></div>
          <div className="stat-label">Trade Volume</div>
          <div className="stat-value">{hasData ? fmtValue(totalValue) : '—'}</div>
          <div className="stat-sub">{hasData ? `across ${consignments.length} shipments` : 'Updates on access'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon navy"><Activity /></div>
          <div className="stat-label">ledger Events</div>
          <div className="stat-value">{hasData ? visibleEvents.length : '—'}</div>
          <div className="stat-sub">{hasData ? 'immutable records' : 'Updates on access'}</div>
        </div>
        <div className="stat-card dark">
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#64748b', marginBottom: 8 }}>Entity Trust Score</div>
          <div className="trust-score-wrap">
            <span className="trust-num">{verified > 0 ? 87 : '—'}</span>
            {verified > 0 && <span className="trust-grade">A</span>}
          </div>
          <div className="trust-bar-track"><div className="trust-bar-fill" style={{ width: verified > 0 ? '87%' : '0%' }} /></div>
          <div className="trust-sub">{verified > 0 ? 'Top 5% of AfCFTA Exporters' : 'Register a DID to get a score'}</div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, alignItems: 'start' }}>

        {/* Recent Consignments table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Consignments</h3>
              <span className="live-badge"><span className="live-dot" />LIVE</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Click a row to view documents</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty">No consignments visible. Create one or connect to a peer node.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Route & Product</th>
                  <th>Docs</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedC(selectedC?.id === c.id ? null : c)}
                    style={{ background: selectedC?.id === c.id ? 'var(--accent-light)' : undefined, cursor: 'pointer' }}
                  >
                    <td>
                      <button className="ucr-link" onClick={e => { e.stopPropagation(); onViewDocs?.(c); }}>{c.ucr}</button>
                      <div className="ucr-date">{c.shipDate || new Date(c.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td>
                      {c.fromCountry && c.toCountry ? (
                        <div className="route-display">
                          <span>{c.fromCountry}</span>
                          <span className="route-arrow">→</span>
                          <span>{c.toCountry}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>{c.creatorOrgName}</div>
                      )}
                      <div className="route-product">{(c.product || c.description || '—').slice(0, 38)}</div>
                    </td>
                    <td><DocsPill count={c.documentCount || 0} total={6} /></td>
                    <td>
                      <StatusPill status={c.status} />
                      {c.errorType && <span title={c.errorDescription} style={{ marginLeft: 5 }}><AlertTriangle style={{ width: 12, height: 12, color: '#b91c1c', verticalAlign: 'middle' }} /></span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="value-cell">{fmtValue(c.totalValue, c.currency)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Node status (compact) */}
          <div className="card node-status">
            <div className="node-status-row">
              <div className="node-status-title">
                <Wifi style={{ width: 14, height: 14, color: peerConnected ? '#16a34a' : '#94a3b8' }} />
                <span>Node Status</span>
              </div>
              <span className={`tn-status ${peerConnected ? 'tn-status-on' : 'tn-status-off'}`}>
                {peerConnected ? 'Connected' : 'Local only'}
              </span>
            </div>
            <div className="node-status-meta">
              <div><span className="ns-k">This node</span><span className="ns-v">{nodeInfo?.nodeName || '—'}</span></div>
              <div><span className="ns-k">Local orgs</span><span className="ns-v">{orgs.length}</span></div>
              <div><span className="ns-k">Peer orgs</span><span className="ns-v">{peerConnected ? peerOrgs.length : '—'}</span></div>
              <div><span className="ns-k">Ledger records</span><span className="ns-v">{tangleLog.length}</span></div>
            </div>
            <div className="node-status-actions">
              {peerConnected
                ? <InfoTip title="Disconnect peer node" description="Stop syncing with the peer node. Your local data stays intact." position="right">
                    <button className="btn btn-sm btn-d" onClick={handleDisconnect}><Unlink style={{ width: 11, height: 11 }} /> Disconnect</button>
                  </InfoTip>
                : <InfoTip title="Connect to peer node" description="Discover and connect to the peer ADAPT node to share org directories and consignment data across the network." position="right">
                    <button className="btn btn-sm btn-p" onClick={() => setShowDiscover(true)}><Radio style={{ width: 11, height: 11 }} /> Connect</button>
                  </InfoTip>}
              <InfoTip title="View Trade Network" description="See a live geographic map of all organisations, trade routes, and peer node connections." position="right">
                <button className="btn btn-sm btn-s" onClick={() => onNavigate?.('network')}>
                  <Globe style={{ width: 11, height: 11 }} /> View Network <ArrowRight style={{ width: 11, height: 11 }} />
                </button>
              </InfoTip>
            </div>
            {errorCount > 0 && (
              <div className="node-status-alert">
                <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0 }} />
                <span><strong>{errorCount} consignment{errorCount > 1 ? 's' : ''}</strong> flagged for reconciliation</span>
              </div>
            )}
          </div>

          {/* Recent Tangle Activity */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity style={{ width: 15, height: 15, color: 'var(--accent)' }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Activity</h3>
            </div>
            <div style={{ padding: '10px 14px', maxHeight: 300, overflowY: 'auto' }}>
              {tangleLog.length === 0 ? (
                <div className="empty" style={{ padding: 20 }}>No activity yet.</div>
              ) : (
                tangleLog.slice(0, 6).map(e => (
                  <div key={e.id} className={`te ${e.type === 'permission' ? 'perm' : e.type === 'identity' ? 'id' : e.type === 'network' ? 'net' : ''}`} style={{ animation: 'fadeIn .2s forwards' }}>
                    <div style={{ minWidth: 52 }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: '#94a3b8' }}>{new Date(e.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px', color: '#94a3b8', marginBottom: 1 }}>{e.type} — {e.action}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{e.details}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: '#16a34a', marginTop: 2 }}>{e.hash?.slice(0, 14)}...</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selected consignment — documents panel */}
      {selectedC && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="csg-detail-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span className="ucr-ref" style={{ fontSize: 15 }}>{selectedC.ucr}</span>
                <StatusPill status={selectedC.status} />
                {selectedC.errorType && <span className="pill pill-review pill-dot">{selectedC.errorType?.replace(/_/g, ' ')}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {selectedC.exporter && <><strong>Exporter:</strong> {selectedC.exporter}</>}
                {selectedC.importer && <> &nbsp;·&nbsp; <strong>Importer:</strong> {selectedC.importer}</>}
                {selectedC.vessel && <> &nbsp;·&nbsp; {selectedC.vessel}</>}
              </div>
            </div>
            <button className="btn btn-s btn-sm" onClick={() => setSelectedC(null)}><X style={{ width: 12, height: 12 }} /> Close</button>
          </div>

          {selectedC.errorDescription && (
            <div style={{ padding: '10px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
              <AlertTriangle style={{ width: 15, height: 15, color: '#b91c1c', flexShrink: 0, marginTop: 1 }} />
              <div><strong style={{ color: '#b91c1c' }}>Reconciliation Alert:</strong> <span style={{ color: '#b91c1c' }}>{selectedC.errorDescription}</span></div>
            </div>
          )}

          <div style={{ padding: '14px 20px 6px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              Trade Documents ({docs.length})
            </div>
          </div>

          {docs.length === 0 ? (
            <div className="empty" style={{ paddingTop: 16 }}>Loading documents…</div>
          ) : (
            <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(d => {
                const isXml = d.filename?.endsWith('.xml');
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid var(--card-border)' }}>
                    <DocTypeIcon docType={d.docType} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {d.issuer && <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Issued by {d.issuer}</span>}
                        {d.reference && <span style={{ marginLeft: 8 }}>· {d.reference}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {isXml && (
                        <InfoTip title="View XML document" description="Inspect the structured trade document in XML format — useful for customs and compliance checks." position="left">
                          <button className="btn btn-s btn-sm" onClick={() => setViewingXml(d)}>
                            <Eye style={{ width: 11, height: 11 }} /> View XML
                          </button>
                        </InfoTip>
                      )}
                      {d.filename && (
                        <InfoTip title="Download document" description="Download this trade document to your device." position="left">
                          <a href={api.downloadUrl(d.id)} className="btn btn-s btn-sm" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer">
                            <Download style={{ width: 11, height: 11 }} />
                          </a>
                        </InfoTip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Discovery modal */}
      {showDiscover && (
        <div className="modal-bg" onClick={() => setShowDiscover(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Discover & Connect to Nodes</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 18 }}>Available nodes on the network. Connect to exchange organisation directories and enable cross-node data sharing.</p>
            {discoverable.length === 0 ? (
              <div className="empty">No discoverable nodes found. Ensure the peer node is running.</div>
            ) : (
              discoverable.map(n => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid var(--card-border)', borderRadius: 10, marginBottom: 8 }}>
                  <Server style={{ width: 22, height: 22, color: '#16a34a' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{n.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{n.ip}</div>
                  </div>
                  {n.connected
                    ? <span className="pill pill-g pill-dot">Connected</span>
                    : <button className="btn btn-p btn-sm" onClick={handleConnect} disabled={connecting}><Link2 style={{ width: 11, height: 11 }} />{connecting ? 'Connecting...' : 'Connect'}</button>}
                </div>
              ))
            )}
            <div className="modal-act"><button className="btn btn-s" onClick={() => setShowDiscover(false)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
