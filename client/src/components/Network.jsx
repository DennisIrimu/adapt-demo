import React, { useState, useEffect } from 'react';
import { useNode } from '../context/NodeContext';
import { api } from '../utils/api';
import TradeNetworkPanel from './TradeNetworkPanel';
import { countryFromRole } from '../data/countries';
import { Server, Link2, Globe } from 'lucide-react';

export default function Network() {
  const { user, nodeInfo, peerConnected, peerOrgs, peerNodeCountry, tangleLog, refreshKey, refresh } = useNode();
  const [orgs, setOrgs] = useState([]);
  const [consignments, setConsignments] = useState([]);
  const [discoverable, setDiscoverable] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [selection, setSelection] = useState({ countryName: null, expandedOrgKey: null });

  useEffect(() => {
    api.getOrgs().then(setOrgs).catch(() => {});
    api.getConsignments(user.id).then(setConsignments).catch(() => {});
    api.discoverNodes().then(setDiscoverable).catch(() => {});
  }, [user.id, refreshKey, peerConnected]);

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

  const peerNodeName = discoverable[0]?.name;

  const focusOrg = (org, side) => {
    const country = countryFromRole(org.role);
    if (!country) return;
    setSelection({ countryName: country, expandedOrgKey: `${side}-${org.id}`, nodeSide: null });
  };

  return (
    <div className="stack">
      <div className="net-hero">
        <div className="net-hero-left">
          <h2 className="net-hero-title"><Globe style={{ width: 18, height: 18 }} /> Trade Network</h2>
          <p className="net-hero-sub">
            Geographic view of every organization on the network, the peer connection between nodes,
            and the trade routes that link them.
          </p>
        </div>
        <div className="net-hero-stats">
          <div className="net-hero-stat">
            <div className="net-hero-stat-label">Local orgs</div>
            <div className="net-hero-stat-value">{orgs.length}</div>
          </div>
          <div className="net-hero-stat">
            <div className="net-hero-stat-label">Peer orgs</div>
            <div className="net-hero-stat-value">{peerOrgs.length}</div>
          </div>
          <div className="net-hero-stat">
            <div className="net-hero-stat-label">Active routes</div>
            <div className="net-hero-stat-value">
              {new Set(consignments.filter(c => c.fromCountry && c.toCountry).map(c => `${c.fromCountry}→${c.toCountry}`)).size}
            </div>
          </div>
          <div className="net-hero-stat">
            <div className="net-hero-stat-label">Ledger events</div>
            <div className="net-hero-stat-value">{tangleLog.length}</div>
          </div>
        </div>
      </div>

      <div className="net-map-wrap">
        <TradeNetworkPanel
          localOrgs={orgs}
          peerOrgs={peerOrgs}
          consignments={consignments}
          peerConnected={peerConnected}
          nodeInfo={nodeInfo}
          peerNodeName={peerNodeName}
          peerNodeCountry={peerNodeCountry}
          onConnect={() => setShowDiscover(true)}
          onDisconnect={handleDisconnect}
          connecting={connecting}
          selection={selection}
          onSelectionChange={setSelection}
        />
      </div>

      <div className="net-bottom-grid">
        <div className="card net-side">
          <h3 className="net-side-title">{nodeInfo?.nodeName || 'This Node'} <span className="net-side-sub">Local organizations</span></h3>
          {orgs.length === 0 ? (
            <div className="empty" style={{ padding: 12 }}>No local orgs.</div>
          ) : (
            <div className="net-org-list">
              {orgs.map(o => {
                const hasCountry = !!countryFromRole(o.role);
                const key = `local-${o.id}`;
                const isActive = selection.expandedOrgKey === key;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`net-org-row ${hasCountry ? 'net-org-row--clickable' : ''} ${isActive ? 'net-org-row--active' : ''}`}
                    onClick={() => hasCountry && focusOrg(o, 'local')}
                    disabled={!hasCountry}
                  >
                    <span className={`net-org-dot ${o.verified ? 'on' : ''}`} />
                    <div className="net-org-info">
                      <div className="net-org-name">{o.name}</div>
                      <div className="net-org-role">{o.role}</div>
                    </div>
                    {o.verified && <span className="pill pill-g pill-dot">DID</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card net-side">
          <h3 className="net-side-title">
            {peerConnected ? (peerNodeName || 'Peer Node') : 'No peer connected'}
            <span className="net-side-sub">{peerConnected ? 'Peer organizations' : 'Connect to discover orgs'}</span>
          </h3>
          {!peerConnected ? (
            <div className="empty" style={{ padding: 12 }}>
              <Server style={{ width: 16, height: 16, color: '#94a3b8', marginRight: 6, verticalAlign: 'middle' }} />
              No peer node connected.
            </div>
          ) : peerOrgs.length === 0 ? (
            <div className="empty" style={{ padding: 12 }}>Peer has no orgs.</div>
          ) : (
            <div className="net-org-list">
              {peerOrgs.map(o => {
                const hasCountry = !!countryFromRole(o.role);
                const key = `peer-${o.id}`;
                const isActive = selection.expandedOrgKey === key;
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`net-org-row ${hasCountry ? 'net-org-row--clickable' : ''} ${isActive ? 'net-org-row--active' : ''}`}
                    onClick={() => hasCountry && focusOrg(o, 'peer')}
                    disabled={!hasCountry}
                  >
                    <span className={`net-org-dot peer ${o.verified ? 'on' : ''}`} />
                    <div className="net-org-info">
                      <div className="net-org-name">{o.name}</div>
                      <div className="net-org-role">{o.role}</div>
                    </div>
                    {o.verified && <span className="pill pill-g pill-dot">DID</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
