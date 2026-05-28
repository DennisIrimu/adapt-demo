# ADAPT — Africa Digital Access & Public Infrastructure for Trade

ADAPT is a framework for cross-border trade infrastructure — demonstrating how digital identity, document exchange, and trade finance can interoperate across organisations and jurisdictions without replacing existing systems.

This repository contains a two-node interactive demo built for stakeholder presentations.

---

## Quick Start (Local)

```bash
npm install
npm run dev
```

Builds the React client and starts two live nodes:

| Node | URL | Organisations |
|------|-----|---------------|
| Alpha | http://localhost:4000 | AtlasPhosphate S.A., Morocco Customs, Nigeria Customs, Kenya Revenue Authority, Financier 1, Financier 2 |
| Beta | http://localhost:4001 | PrimeFert Nigeria Ltd, TradeLink International Ltd |

Open both URLs in separate browser windows and sign in with the credentials shown on each login page (password is `demo` for all accounts).

---

## Demo Credentials

### Node Alpha — http://localhost:4000

| Organisation | Username | Role |
|---|---|---|
| AtlasPhosphate S.A. | `atlas` | Exporter · Morocco |
| Morocco Customs | `macustoms` | Customs Authority · Morocco |
| Nigeria Customs | `ngcustoms` | Customs Authority · Nigeria |
| Kenya Revenue Authority | `kra` | Customs Authority · Kenya |
| Financier 1 | `financier1` | Financier |
| Financier 2 | `financier2` | Financier |

### Node Beta — http://localhost:4001

| Organisation | Username | Role |
|---|---|---|
| PrimeFert Nigeria Ltd | `primefert` | Importer · Nigeria |
| TradeLink International Ltd | `tradelink` | Importer · Nigeria |

---

## Architecture

```
┌─────────────────────┐    WebSocket P2P    ┌─────────────────────┐
│     Node Alpha      │◄────────────────────►│     Node Beta       │
│   localhost:4000    │   ws://4010 ↔ 4011   │   localhost:4001    │
│                     │                       │                     │
│  Exporters          │                       │  Importers          │
│  Customs Authorities│                       │                     │
│  Financiers         │                       │                     │
└─────────────────────┘                       └─────────────────────┘
          │                                             │
          └──────── Distributed Ledger (simulated) ─────┘
```

Each node is a standalone Express server with:
- In-memory store (orgs, consignments, documents, permissions, tangle log)
- WebSocket server for real-time client push
- P2P WebSocket to the peer node for cross-border data sync

---

## Features

### Digital Identity
- Private organisations register a DID using a business registration number
- 5-step animated verification — format check → registry query → licence status → DID generation → credential issuance
- Government authorities (Morocco Customs, Nigeria Customs, KRA) act as **attestation authorities** — not registrants
- Verifiable Credentials anchored on the distributed ledger
- Peer organisations can inspect a "View Credential" modal showing DID, issuing authority, and ledger hash

**Test registration numbers:**

| Code | Result |
|---|---|
| `BRN-123456` | ✓ Passes — valid business registration |
| `TIN-254789` | ✓ Passes — valid tax ID |
| `BRN-000000` | ✗ Fails step 2 — blacklisted |
| `BRN-111111` | ✗ Fails step 3 — expired licence |
| `BRN-222222` | ✗ Fails step 3 — suspended |
| `X-anything` | ✗ Fails step 2 — invalid prefix |

### Consignments
- UCR as primary identifier; Commercial Invoice and Export Declaration as secondary IDs
- Documents attach to consignment digital twins
- File upload (stored in memory, downloadable by authorised parties)

### Payments
- Full payment lifecycle per consignment: Unpaid → Partially Paid → Paid / Overdue
- Status changes anchored as ledger events
- Finance access managed independently from document access

### Trade Finance
- **Letters of Credit** — Draft → Issued → Advised → Confirmed → Presented → Drawn, with document compliance checklist
- **Smart Contracts** — encode payment release conditions; auto-releases when all conditions are met; each state transition anchored on ledger

### Cross-Node Sharing
- Connect Alpha and Beta nodes from the Dashboard
- Share consignments and documents to organisations on the peer node
- Peer orgs are searchable; Identity page shows their verified credentials

### Access Control
- Visual permission matrix per consignment
- Grant / revoke per organisation
- All changes produce an immutable ledger audit entry

### Analytics (Ledger Explorer)
- Filterable event log: identity, document, permission, payment, contract, network
- Hash, timestamp, actor, and detail for every event
- Syncs across both nodes in real time

---

## Deployment

### Railway (recommended — free tier)

1. Push this repository to GitHub.
2. Create two Railway services from the same repo.
3. Set environment variables per service:

**adapt-alpha**
```
NODE_ID=alpha
NODE_NAME=Node Alpha
PEER_URL=wss://<adapt-beta-railway-url>
```

**adapt-beta**
```
NODE_ID=beta
NODE_NAME=Node Beta
PEER_URL=wss://<adapt-alpha-railway-url>
```

> `PORT` is set automatically by Railway. WebSocket runs on the same port as HTTP — no separate WS port needed.

4. Set the start command for each service:
   - Alpha: `node server/index.js`
   - Beta: `node server/index.js`

> **Note:** You must build the client (`npm run build`) and commit `server/public/` before deploying, since the build step is not run on Railway. Remove `server/public/` from `.gitignore` before pushing to GitHub.

---

## Tech Stack

- **Backend:** Node.js 18+, Express, WebSocket (ws), Multer
- **Frontend:** React 18, Vite, Lucide icons
- **Fonts:** DM Sans, JetBrains Mono
- **Storage:** In-memory (resets on server restart — intentional for demo)
