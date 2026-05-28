import React, { useState, useEffect, useRef } from 'react';
import { useNode } from '../context/NodeContext';
import { api } from '../utils/api';
import XmlViewer from './XmlViewer';
import { Plus, Upload, Send, Download, FileText, Lock, X, AlertTriangle, ChevronLeft, Eye, Code2 } from 'lucide-react';
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
    'In Transit':   'pill pill-dot pill-active',
    'Customs':      'pill pill-dot pill-active',
    'Submitted':    'pill pill-dot pill-active',
    'Released':     'pill pill-dot pill-active',
    'Delivered':    'pill pill-dot pill-delivered',
    'Draft':        'pill pill-dot pill-draft',
    'Under Review': 'pill pill-dot pill-review',
  };
  return <span className={map[status] || 'pill pill-dot pill-draft'}>{status || 'Draft'}</span>;
}

function DocsPill({ count, total }) {
  const cls = count === total ? 'docs-pill docs-complete' : count < total / 2 ? 'docs-pill docs-low' : 'docs-pill docs-partial';
  return <span className={cls}>{count}/{total}</span>;
}

const DOC_COLORS = {
  'Bill of Lading':        { bg: '#fef9ec', color: '#F3A31E' },
  'Insurance Certificate': { bg: '#fef9ec', color: '#F3A31E' },
  'Certificate of Origin': { bg: '#f0fdf4', color: '#16a34a' },
  'Commercial Invoice':    { bg: '#e8f5ed', color: '#289145' },
  'Packing List':          { bg: '#e8f5ed', color: '#289145' },
  'Export Declaration':    { bg: '#e8f5ed', color: '#289145' },
};

function DocTypeIcon({ docType }) {
  const c = DOC_COLORS[docType] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <div style={{ width: 30, height: 30, borderRadius: 7, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <FileText style={{ width: 14, height: 14, color: c.color }} />
    </div>
  );
}

export default function Consignments({ searchQ = '', targetConsignment = null, onClearTarget }) {
  const { user, peerOrgs, refresh, refreshKey, peerConnected } = useNode();
  const [consignments, setConsignments] = useState([]);
  const [selectedC, setSelectedC] = useState(null);
  const detailRef = React.useRef(null);
  const [docs, setDocs] = useState([]);
  const [allOrgs, setAllOrgs] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [viewingXml, setViewingXml] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    api.getConsignments(user.id).then(setConsignments).catch(() => {});
    api.getAllOrgs().then(setAllOrgs).catch(() => {});
  }, [user.id, refreshKey]);

  // Auto-select when navigated from Dashboard
  useEffect(() => {
    if (targetConsignment) {
      setSelectedC(targetConsignment);
      onClearTarget?.();
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [targetConsignment]);

  useEffect(() => {
    if (selectedC) api.getDocuments(user.id, selectedC.id).then(setDocs).catch(() => {});
    else setDocs([]);
  }, [selectedC, user.id, refreshKey]);

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'In Transit', label: 'In Transit' },
    { id: 'Customs', label: 'Customs' },
    { id: 'Under Review', label: 'Under Review' },
    { id: 'Delivered', label: 'Delivered' },
  ];

  const filtered = consignments.filter(c => {
    const matchFilter = activeFilter === 'all' || c.status === activeFilter;
    const matchSearch = !searchQ || c.ucr?.toLowerCase().includes(searchQ.toLowerCase()) || c.product?.toLowerCase().includes(searchQ.toLowerCase()) || c.exporter?.toLowerCase().includes(searchQ.toLowerCase());
    return matchFilter && matchSearch;
  });

  if (viewingXml) {
    return (
      <div className="stack">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button className="btn btn-s btn-sm" onClick={() => setViewingXml(null)}>
            <ChevronLeft style={{ width: 13, height: 13 }} /> Back to Documents
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{viewingXml.title}</span>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Code2 style={{ width: 16, height: 16, color: 'var(--amber)' }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{viewingXml.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{viewingXml.format} · Ref: {viewingXml.reference}</div>
              </div>
            </div>
            <a href={api.downloadUrl(viewingXml.id)} className="btn btn-s btn-sm">
              <Download style={{ width: 12, height: 12 }} /> Download XML
            </a>
          </div>
          <div style={{ padding: 16 }}>
            <XmlViewer
              docId={viewingXml.id}
              docType={viewingXml.docType}
              errorType={selectedC?.errorType}
              errorDescription={selectedC?.errorDescription}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Consignments</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>ADAPT trade documents anchored on ledger</div>
        </div>
        <InfoTip title="Create a new consignment" description="Register a new shipment on the ADAPT ledger. You'll specify the route, product, and trade partners — all anchored immutably." position="left">
          <button className="btn btn-p" onClick={() => setShowCreate(true)}><Plus style={{ width: 14, height: 14 }} /> New Consignment</button>
        </InfoTip>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {filters.map(f => (
          <button
            key={f.id}
            className={`btn btn-sm ${activeFilter === f.id ? 'btn-p' : 'btn-s'}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
            <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 10 }}>
              ({f.id === 'all' ? consignments.length : consignments.filter(c => c.status === f.id).length})
            </span>
          </button>
        ))}
      </div>

      {/* Consignments table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty">No consignments match your filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Route & Product</th>
                <th>Parties</th>
                <th>Docs</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setSelectedC(selectedC?.id === c.id ? null : c)} style={{ background: selectedC?.id === c.id ? 'var(--accent-light)' : undefined }}>
                  <td>
                    <button className="ucr-link" onClick={e => { e.stopPropagation(); setSelectedC(selectedC?.id === c.id ? null : c); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }}>{c.ucr}</button>
                    <div className="ucr-date">{c.shipDate || new Date(c.createdAt || Date.now()).toLocaleDateString()}</div>
                  </td>
                  <td>
                    {c.fromCountry && c.toCountry ? (
                      <div className="route-display">
                        <span>{c.fromCountry}</span>
                        <span className="route-arrow">→</span>
                        <span>{c.toCountry}</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{c.creatorOrgName}</div>
                    )}
                    <div className="route-product">{c.product || c.description || '—'}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.exporter || c.creatorOrgName}</div>
                    {c.importer && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.importer}</div>}
                  </td>
                  <td><DocsPill count={c.documentCount || 0} total={6} /></td>
                  <td>
                    <StatusPill status={c.status} />
                    {c.errorType && (
                      <span title={c.errorDescription} style={{ marginLeft: 5 }}>
                        <AlertTriangle style={{ width: 12, height: 12, color: '#a16207', verticalAlign: 'middle' }} />
                      </span>
                    )}
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

      {/* Selected consignment detail */}
      {selectedC && (
        <div ref={detailRef} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div className="csg-detail-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span className="ucr-ref" style={{ fontSize: 15 }}>{selectedC.ucr}</span>
                <StatusPill status={selectedC.status} />
                {selectedC.errorType && <span className="pill pill-review pill-dot">{selectedC.errorType?.replace(/_/g, ' ')}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>
                {selectedC.commercialInvoiceNo && `CI: ${selectedC.commercialInvoiceNo}`}
                {selectedC.commercialInvoiceNo && selectedC.exportDeclarationNo && ' · '}
                {selectedC.exportDeclarationNo && `ED: ${selectedC.exportDeclarationNo}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <InfoTip title="Upload a document" description="Attach a trade document (Bill of Lading, Invoice, Certificate of Origin, etc.) to this consignment. It will be anchored on the ledger." position="left">
                <button className="btn btn-p btn-sm" onClick={() => setShowUpload(true)}><Upload style={{ width: 12, height: 12 }} /> Upload</button>
              </InfoTip>
              <InfoTip title="Share with an organisation" description="Grant another organisation access to view this consignment's documents." position="left">
                <button className="btn btn-s btn-sm" onClick={() => setShowShare(true)}><Send style={{ width: 12, height: 12 }} /> Share</button>
              </InfoTip>
              <button className="btn btn-s btn-sm" onClick={() => setSelectedC(null)}><X style={{ width: 12, height: 12 }} /></button>
            </div>
          </div>

          {/* Metadata grid */}
          {(selectedC.product || selectedC.vessel || selectedC.incoterms) && (
            <div className="csg-meta-grid" style={{ borderBottom: '1px solid var(--card-border)' }}>
              {selectedC.product && <div className="csg-meta-item"><div className="meta-label">Product</div><div className="meta-value">{selectedC.product}</div></div>}
              {selectedC.hsCode && <div className="csg-meta-item"><div className="meta-label">HS Code</div><div className="meta-value">{selectedC.hsCode}</div></div>}
              {selectedC.quantity && <div className="csg-meta-item"><div className="meta-label">Quantity</div><div className="meta-value">{selectedC.quantity} {selectedC.unit}</div></div>}
              {selectedC.vessel && <div className="csg-meta-item"><div className="meta-label">Vessel</div><div className="meta-value">{selectedC.vessel}</div></div>}
              {selectedC.originPort && <div className="csg-meta-item"><div className="meta-label">Origin Port</div><div className="meta-value">{selectedC.originPort}</div></div>}
              {selectedC.destinationPort && <div className="csg-meta-item"><div className="meta-label">Destination Port</div><div className="meta-value">{selectedC.destinationPort}</div></div>}
              {selectedC.incoterms && <div className="csg-meta-item"><div className="meta-label">Incoterms</div><div className="meta-value">{selectedC.incoterms}</div></div>}
              {selectedC.shipDate && <div className="csg-meta-item"><div className="meta-label">Ship Date</div><div className="meta-value">{selectedC.shipDate}</div></div>}
              {selectedC.totalValue && <div className="csg-meta-item"><div className="meta-label">Total Value</div><div className="meta-value">{fmtValue(selectedC.totalValue, selectedC.currency)}</div></div>}
            </div>
          )}

          {selectedC.errorDescription && (
            <div style={{ padding: '10px 20px', background: '#fefce8', borderBottom: '1px solid #fde68a', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
              <AlertTriangle style={{ width: 15, height: 15, color: '#a16207', flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong style={{ color: '#a16207' }}>Reconciliation Alert:</strong>
                <span style={{ color: '#a16207', marginLeft: 6 }}>{selectedC.errorDescription}</span>
              </div>
            </div>
          )}

          {/* Documents */}
          <div style={{ padding: '16px 20px 6px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
              Documents ({docs.length})
            </div>
          </div>
          {docs.length === 0 ? (
            <div className="empty" style={{ paddingTop: 16 }}>No documents anchored yet.</div>
          ) : (
            <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(d => {
                const isXml = d.filename?.endsWith('.xml');
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid var(--card-border)' }}>
                    <DocTypeIcon docType={d.docType} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.title}</div>
                      {d.issuer && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, fontWeight: 500 }}>
                          Issued by {d.issuer}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                        {d.reference && <span>{d.reference}</span>}
                        {d.format && <span>· {d.format}</span>}
                        {d.fileSize > 0 && <span>· {Math.round(d.fileSize / 1024)}KB</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, fontFamily: 'var(--mono)', fontSize: 10, color: '#16a34a', flexShrink: 0 }}>
                      <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.hash?.slice(0, 10)}...</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {isXml && (
                        <InfoTip title="View XML" description="Inspect the structured trade document — useful for verifying data against customs requirements." position="left">
                          <button className="btn btn-s btn-sm" onClick={() => setViewingXml(d)}>
                            <Eye style={{ width: 11, height: 11 }} /> View XML
                          </button>
                        </InfoTip>
                      )}
                      {d.filename && (
                        <InfoTip title="Download" description="Download this document to your device." position="left">
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

      {showCreate && <CreateModal onClose={() => { setShowCreate(false); refresh(); }} userId={user.id} />}
      {showUpload && selectedC && <UploadModal consignment={selectedC} userId={user.id} onClose={() => { setShowUpload(false); refresh(); }} />}
      {showShare && selectedC && <ShareModal consignment={selectedC} user={user} allOrgs={allOrgs} peerOrgs={peerOrgs} peerConnected={peerConnected} onClose={() => { setShowShare(false); refresh(); }} />}
    </div>
  );
}

function CreateModal({ onClose, userId }) {
  const [ucr, setUcr] = useState('UCR-2026-' + String(Math.floor(Math.random() * 99999)).padStart(5, '0'));
  const [ci, setCi] = useState('');
  const [ed, setEd] = useState('');
  const [desc, setDesc] = useState('');
  const submit = async () => { await api.createConsignment({ ucr, commercialInvoiceNo: ci, exportDeclarationNo: ed, description: desc, creatorOrgId: userId }); onClose(); };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Create Consignment (Digital Twin)</h3>
        <div className="fg"><label>UCR Number (Primary ID)</label><input value={ucr} onChange={e => setUcr(e.target.value)} /></div>
        <div className="g2">
          <div className="fg"><label>Commercial Invoice No.</label><input value={ci} onChange={e => setCi(e.target.value)} placeholder="e.g. INV-2026-001" /></div>
          <div className="fg"><label>Export Declaration No.</label><input value={ed} onChange={e => setEd(e.target.value)} placeholder="e.g. EXD-2026-001" /></div>
        </div>
        <div className="fg"><label>Description</label><textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Consignment description..." /></div>
        <div className="modal-act">
          <button className="btn btn-s" onClick={onClose}>Cancel</button>
          <button className="btn btn-p" onClick={submit}><Plus style={{ width: 13, height: 13 }} /> Create & Anchor</button>
        </div>
      </div>
    </div>
  );
}

function UploadModal({ consignment, userId, onClose }) {
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('General');
  const [file, setFile] = useState(null);
  const fileRef = useRef();
  const submit = async () => {
    const fd = new FormData();
    fd.append('consignmentId', consignment.id); fd.append('title', title); fd.append('docType', docType); fd.append('creatorOrgId', userId);
    if (file) fd.append('file', file);
    await api.uploadDocument(fd); onClose();
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Upload Document — {consignment.ucr}</h3>
        <div className="fg"><label>Document Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Commercial Invoice" autoFocus /></div>
        <div className="fg">
          <label>Document Type</label>
          <select value={docType} onChange={e => setDocType(e.target.value)}>
            {['General','Commercial Invoice','Certificate of Origin','Bill of Lading','Export Declaration','Import Declaration','Health Certificate','Phytosanitary Certificate','Packing List','Insurance Certificate'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Attach File</label>
          <div style={{ border: '2px dashed var(--card-border)', borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', background: file ? '#f0fdf4' : 'white', transition: 'all 0.15s' }} onClick={() => fileRef.current?.click()}>
            {file
              ? <><FileText style={{ width: 22, height: 22, color: '#16a34a', margin: '0 auto 6px' }} /><div style={{ fontSize: 12.5, color: '#166534', fontWeight: 500 }}>{file.name} ({Math.round(file.size / 1024)}KB)</div></>
              : <><Upload style={{ width: 22, height: 22, color: 'var(--text-muted)', margin: '0 auto 6px' }} /><div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Click to select file</div></>}
          </div>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
        </div>
        <div className="modal-act">
          <button className="btn btn-s" onClick={onClose}>Cancel</button>
          <button className="btn btn-p" onClick={submit} disabled={!title.trim()}><Upload style={{ width: 13, height: 13 }} /> Upload & Anchor</button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({ consignment, user, allOrgs, peerOrgs, peerConnected, onClose }) {
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [shareMode, setShareMode] = useState('all');
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [docs, setDocs] = useState([]);

  const shareableOrgs = [...allOrgs.filter(o => o.id !== user.id), ...peerOrgs.filter(po => !allOrgs.some(ao => ao.id === po.id))];

  useEffect(() => {
    api.getPermissions(consignment.id).then(p => { setPerms(p); setLoading(false); }).catch(() => setLoading(false));
    api.getDocuments(user.id, consignment.id).then(setDocs).catch(() => {});
  }, [consignment.id, user.id]);

  const toggleDoc = id => setSelectedDocIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);

  const doShare = async (org) => {
    await api.shareConsignment({ consignmentId: consignment.id, recipientOrgId: org.id, recipientOrgName: org.name, sharerOrgName: user.name, shareMode, selectedDocIds: shareMode === 'selective' ? selectedDocIds : undefined });
    setPerms(p => ({ ...p, [org.id]: 'viewer' }));
  };

  const doRevoke = async (org) => {
    await api.revokeAccess({ consignmentId: consignment.id, recipientOrgId: org.id, recipientOrgName: org.name, revokerOrgName: user.name });
    setPerms(p => { const n = { ...p }; delete n[org.id]; return n; });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
        <h3>Share — {consignment.ucr}</h3>
        {docs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.3px' }}>Share Mode</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={`btn btn-sm ${shareMode === 'all' ? 'btn-p' : 'btn-s'}`} onClick={() => setShareMode('all')}>All documents ({docs.length})</button>
              <button className={`btn btn-sm ${shareMode === 'selective' ? 'btn-p' : 'btn-s'}`} onClick={() => setShareMode('selective')}>Select specific</button>
            </div>
          </div>
        )}
        {shareMode === 'selective' && docs.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Select documents:</div>
            {docs.map(d => (
              <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedDocIds.includes(d.id)} onChange={() => toggleDoc(d.id)} />
                <FileText style={{ width: 13, height: 13, color: 'var(--text-muted)' }} />
                <span style={{ fontWeight: 500 }}>{d.title}</span>
                <span className="pill pill-b" style={{ marginLeft: 4, fontSize: 10, padding: '1px 7px' }}>{d.docType}</span>
              </label>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.3px' }}>Organisations</div>
        {!peerConnected && <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 11.5, color: '#991b1b', marginBottom: 10, display: 'flex', gap: 6 }}><Lock style={{ width: 12, height: 12 }} /> Peer node offline — cross-node sharing unavailable.</div>}
        {loading ? <div className="empty">Loading...</div> : shareableOrgs.length === 0 ? <div className="empty">No other organisations available.</div> : (
          shareableOrgs.map(o => {
            const has = !!perms[o.id];
            const isRemote = !o.local && !allOrgs.some(a => a.id === o.id);
            const disabled = isRemote && !peerConnected;
            return (
              <div className="sr" key={o.id} style={{ opacity: disabled ? 0.4 : 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{o.name}{isRemote && <span className="pill pill-a" style={{ marginLeft: 6, fontSize: 10 }}>peer node</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.role}{o.nodeName ? ` — ${o.nodeName}` : ''}</div>
                </div>
                {has
                  ? <button className="btn btn-sm btn-d" onClick={() => doRevoke(o)}>Revoke</button>
                  : <button className="btn btn-sm btn-p" onClick={() => doShare(o)} disabled={disabled || (shareMode === 'selective' && selectedDocIds.length === 0)}><Send style={{ width: 11, height: 11 }} /> Share</button>}
              </div>
            );
          })
        )}
        <div className="modal-act"><button className="btn btn-p" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
