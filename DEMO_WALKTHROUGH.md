# ADAPT Demo Walkthrough
> A step-by-step presenter guide. Each section is a self-contained story you can run in sequence or pick individually. All passwords are `demo`.

---

## Setup Checklist
Before presenting, confirm:
- [ ] Alpha node running at `http://localhost:4000`
- [ ] Beta node running at `http://localhost:4001`
- [ ] Both tabs open in the browser (one per node)
- [ ] Start on the Alpha login screen

---

## Opening Frame (60 seconds)

> *"Cross-border trade in Africa involves dozens of parties — exporters, customs authorities, banks, freight operators, regulators — each working in isolation. Documents get lost, payments stall, shipments sit at ports for weeks waiting for a certificate no-one can find electronically. ADAPT is a shared trade infrastructure layer that gives every party a real-time, tamper-proof view of what's happening — from the exporter's warehouse to the importer's dock."*

Show: the login screen. Point out the two node badges — **Alpha (exporters & customs)** and **Beta (importers)**. Explain that in a real deployment, each organisation runs or connects to its own node; here we have two running locally to simulate the network.

---

## Journey 1A — The Exporter Stuck in Limbo
**Persona:** Vestline Apparel Ltd — small fashion exporter, Lagos → Nairobi
**Login:** `vestline / demo` (Alpha node)
**Story:** Goods delivered, invoice 43 days overdue. Bank won't release payment because it can't verify the exporter's identity cross-border.

### Steps
1. **Sign in** as `vestline`. Land on the Dashboard — point out the shipment summary.
2. Go to **Consignments**. Show three shipments: one Delivered, one In Transit, one Submitted.
3. Open `UCR-2026-NG-KE-01001` (Delivered). Show all 5 documents attached — Bill of Lading, Certificate of Origin, Commercial Invoice, Packing List, Export Declaration. *"The goods arrived. The paperwork is complete."*
4. Go to **Payments**. Show `INV-2026-LTL-01001` — status **Overdue**, 43 days past due. Read the note: *"Buyer citing cross-border identity verification delay — DID not recognised by Kenyan correspondent bank."*
5. Go to **Identity**. Show that Vestline has no DID yet. *"Without a verified digital identity, the bank on the other side of the border has no way to confirm who they're dealing with. One click generates a W3C DID — anchored to the ledger, portable across every node on the network."*
6. Click **Generate DID**. Watch the verified badge appear.
7. Return to Payments — the resolution path is now clear: once the DID propagates to the Kenyan correspondent bank's ADAPT node, the payment block is lifted.

**Talking point:** *"This is the identity problem in trade finance. It's not that documents are missing — it's that the identity behind them isn't machine-readable across borders."*

---

## Journey 1B — The Certificate No-One Can Find
**Persona:** Highland Growers Cooperative — coffee exporter, Tanzania → Egypt
**Login:** `highland / demo` (Alpha node)
**Story:** Arabica coffee shipment stuck at Alexandria port. Egypt Customs can't electronically retrieve the e-phyto certificate issued in Tanzania.

### Steps
1. **Sign in** as `highland`. Go to **Consignments**.
2. Open `UCR-2026-TZ-EG-02001` — status **Under Review**, red **Phytosanitary Hold** badge. Read the error: *"E-phyto certificate issued by Tanzania Plant Health and Pesticides Authority cannot be retrieved electronically by Egypt Customs. Manual re-testing ordered. Estimated delay: 18–22 days."*
3. Click into **Documents**. Show the 5 attached files including the Tanzania Export Declaration XML. *"The certificate exists — it's right here in the system. But Egypt Customs' Single Window can't pull it from Tanzania's system because there's no interoperability protocol between them."*
4. Click **View XML** on the Export Declaration. Show the structured data — country of dispatch, phytosanitary reference, commodity details. *"ADAPT doesn't replace national systems. It sits above them and makes this data visible to every authorised party, regardless of which system issued it."*

**Then switch to Egypt Customs view:**

5. Open a new tab (or sign out). **Sign in** as `egcustoms / demo`.
6. Go to **Consignments** — the same two Highland Growers shipments appear as a viewer. *"The customs officer sees exactly what the exporter sees — same documents, same status, no email needed."*
7. Point out that the officer cannot see Vestline's garments shipments — **access is scoped by permission**. Egypt Customs was granted viewer rights only on Tanzania origin shipments.

**Talking point:** *"The 18–22 day delay costs the cooperative roughly $35,000 in demurrage and storage. It's entirely avoidable if the phyto certificate is on a shared ledger both sides can read."*

---

## Journey 1C — The Invisible Trader
**Persona:** BorderLink Traders — informal cross-border trader, Ivory Coast → Ghana
**Login:** `borderlink / demo` (Alpha node)
**Story:** Small-volume goods moving across the Elubo border. No DID, no documents — exists in the system but can't access credit or formal finance.

### Steps
1. **Sign in** as `borderlink`. Go to **Consignments**.
2. Show three shipments — Delivered, Delivered, Submitted. Low values ($450–$1,200). *"These shipments happened. Goods crossed the border."*
3. Look at the **document count** on each: **0 / 5** on all of them. *"No Bill of Lading. No Certificate of Origin. No customs declaration on record. The trade happened informally — which means it doesn't exist to any bank or credit provider."*
4. Go to **Identity**. No DID, no verified status.
5. Return to **Consignments** — point at the empty document slots. *"Without documents, you can't build a trade history. Without a trade history, you can't access working capital. Without working capital, you stay small. ADAPT breaks that cycle — a trader can start documenting shipments from day one, build a verifiable record, and use it to apply for credit."*

**Talking point:** *"85% of African cross-border trade is informal. Not because traders are unserious — because the paperwork friction is higher than the value of the shipment. ADAPT makes formalisation cheaper than staying informal."*

---

## Journey 2 — The Bank That Can't See Its Own Collateral
**Persona:** Meridian Bank Trade Finance — trade finance bank, Lagos
**Login:** `meridian / demo` (Alpha node)
**Story:** Bank issued an LC against a shipment in transit. Has no real-time visibility into whether the collateral (the goods) is actually moving.

### Steps
1. **Sign in** as `meridian`. Go to **Consignments** — the three Vestline Apparel shipments appear (viewer access). *"The bank didn't originate these consignments — Vestline did. But the bank has been granted read access as part of the LC arrangement."*
2. Go to **Trade Finance**. Show the LC `LC-2026-STB-01002` — status **Issued**, $43,200 USD, Vestline as beneficiary, Nairobi Style Distributors as applicant.
3. Click into the LC — show the document compliance checklist. Three required documents: Bill of Lading, Certificate of Origin, Export Declaration. None yet submitted. *"The LC is live but the conditions haven't been met. In traditional banking, the bank has no idea where the goods are until documents land on a desk. Here, the moment the exporter uploads the Bill of Lading on their node, it appears in this checklist."*
4. Click **Smart Contracts** tab. Show `SC-2026-STB-01002` — 3 conditions, all unmet. *"When all three conditions are met — BoL verified, AfCFTA duty reduction confirmed, goods cleared at JKIA — payment releases automatically. No manual intervention, no correspondent bank delay."*

**Talking point:** *"Trade finance processes $2.5 trillion of global trade per year. Most of it still runs on fax and PDF attachments. The programmable settlement layer in ADAPT replaces that with conditions that execute themselves."*

---

## Journey 3 — The Freight Operator Caught in a Gap
**Persona:** TransRoute Logistics Ltd — logistics operator, multi-jurisdiction
**Login:** `transroute / demo` (Alpha node)
**Story:** Machinery shipment stuck at Mombasa port — a transit customs declaration is missing for the Uganda leg. Port dwell time accumulating.

### Steps
1. **Sign in** as `transroute`. Go to **Consignments**.
2. Open `UCR-2026-NG-KE-04001` — status **Customs**, red **Transit Delay** badge. Read the error: *"Shipment held at Mombasa Port — transit customs declaration missing from Uganda leg. Awaiting re-submission through Kenya TradeNet Single Window. Port dwell time: 9 days."*
3. *"TransRoute operates across 6 jurisdictions. Each one has a different Single Window, different data format, different authentication. A missing document in Uganda surfaces as a hold in Kenya — and the freight operator finds out when the port sends a detention notice, not before."*
4. Go to **Access Control**. Show that TransRoute has owner access on its two shipments. *"A freight operator can grant viewer access to the shipper, the port authority, the importer — anyone who needs to see where the goods are. Real-time, permission-controlled, auditable."*

**Talking point:** *"Port dwell time in African ports averages 5–7 days — 3× the global average. Most of that is document chasing across siloed systems. Single-pane visibility cuts that friction before it becomes detention charges."*

---

## Journey 4 — The Customs Officer Waiting for Paper
*(Already partially covered in Journey 1B — use this as a standalone if needed)*
**Persona:** Egypt Customs Authority
**Login:** `egcustoms / demo` (Alpha node)
**Story:** Customs officer sees inbound Tanzania coffee shipments in real time, with all documentation.

### Steps
1. **Sign in** as `egcustoms`. Go to **Consignments** — two Highland Growers shipments visible.
2. Show that the officer can see documents, status, error flags — but **cannot** modify them. *"Read access, not write access. The exporter controls what gets shared — the customs authority gets a live window, not a copy of a file."*
3. Go to **Identity** — show the authority's own profile. Point out that government nodes can issue attestations. *"In a full deployment, the customs authority would attest to the company's registration, authorised signatory, and commodity licences — making that data available to any other node that needs to verify the exporter."*

---

## Journey 5 — The Importer Caught in Repeated Compliance Loops
**[Switch to Beta node — `http://localhost:4001`]**
**Persona:** Metro Consumer Goods Ltd — FMCG importer, Kenya
**Login:** `metropcg / demo` (Beta node)
**Story:** Processed food shipment from Egypt flagged by Kenya Bureau of Standards for pesticide MRL violations. Re-testing ordered — second time this year.

### Steps
1. **Sign in** as `metropcg` on the **Beta node**.
2. Go to **Consignments** — three shipments. Open `UCR-2026-EG-KE-05002` — status **Under Review**, red **SPS Compliance Failure** badge.
3. Read the error: *"Kenya Bureau of Standards has flagged the consignment: maximum residue levels for pesticide BHC exceed Kenya thresholds. Lab re-testing at Port of Mombasa. Delay: 14–21 days."*
4. *"Metro Consumer Goods imports from three countries. Each has different SPS thresholds — and the importer only finds out about a violation when the shipment is already in port. By then it's too late to re-source."*
5. Show the other two shipments: South Africa (Delivered, clean) and Nigeria (Submitted, clean). *"The difference? The South Africa supplier has their compliance certificates pre-attached to the consignment on ADAPT. The Egypt supplier doesn't — so when KEBS runs a check, there's nothing to validate against."*

**Talking point:** *"SPS compliance failures are the #1 cause of rejected African food imports into other African markets. If supplier certifications live on ADAPT before the goods ship, a compliance officer can screen them in minutes instead of discovering violations at the dock."*

---

## Journey 6 — The Regulator Flying Blind
**[Back to Alpha node — `http://localhost:4000`]**
**Persona:** Central Finance Regulator — financial oversight authority
**Login:** `cfregulator / demo` (Alpha node)
**Story:** Regulator responsible for monitoring trade finance flows across the country — currently has to request data from individual banks.

### Steps
1. **Sign in** as `cfregulator`. Go to **Consignments** — empty. *"This regulator doesn't handle shipments directly."*
2. Go to **Trade Finance**. Show **4 payments, 3 LCs, 3 smart contracts** — spanning both Nortex Minerals and Vestline Apparel trade flows.
3. Point out the overdue payment for Vestline ($58,800, 43 days). *"As a regulator, you can see which exporters are experiencing payment delays, which banks have issued LCs against in-transit goods, and where smart contracts are pending. This is systemic visibility — not a report filed 30 days after the fact."*
4. Go to **Analytics** (Tangle). Show the ledger event log — Payment Recorded, Letter of Credit Issued, Smart Contract Deployed events. *"Every finance action is timestamped and hashed on the ledger. Immutable audit trail, available to authorised regulators in real time."*

**Talking point:** *"Regulators today get trade finance data through quarterly bank reports. By the time a systemic risk is visible, it's already a crisis. ADAPT gives regulators the same real-time ledger view as the participants — with read-only access that doesn't touch the underlying transactions."*

---

## Closing Frame — The Network Effect (2 minutes)

**Switch to Trade Network page** (Alpha node, any logged-in user).

1. Show the world map — org markers across Morocco, Nigeria, Tanzania, Egypt, Ghana, Ivory Coast, Kenya, South Africa.
2. Show the trade arcs connecting countries — each arc is a live consignment route.
3. Point to the P2P beam between Node Alpha and Node Beta. *"These two nodes are talking to each other. Organisations on Beta can be discovered by organisations on Alpha — and vice versa — without a central broker."*
4. Click a country marker to drill into the country detail panel.

> *"What you've seen today is a network of 16 organisations across 9 countries, sharing trade data in real time — each with permission-controlled access to exactly what they need, nothing more. No central database. No single point of failure. No intermediary taking a cut. Just a shared ledger that makes every party faster, cheaper, and more trusted. That's ADAPT."*

---

## Quick Reference — All Login Credentials

### Alpha Node (`localhost:4000`)
| Organisation | Username | Role |
|---|---|---|
| Nortex Minerals S.A. | `nortex` | Exporter · Morocco |
| Morocco Customs | `macustoms` | Customs Authority · Morocco |
| Nigeria Customs | `ngcustoms` | Customs Authority · Nigeria |
| Kenya Revenue Authority | `kra` | Customs Authority · Kenya |
| Vestline Apparel Ltd | `vestline` | Exporter · Nigeria |
| Highland Growers Cooperative | `highland` | Exporter · Tanzania |
| BorderLink Traders | `borderlink` | Trader · West Africa |
| Meridian Bank Trade Finance | `meridian` | Financier · Nigeria |
| TransRoute Logistics Ltd | `transroute` | Logistics Operator |
| Egypt Customs Authority | `egcustoms` | Customs Authority · Egypt |
| Central Finance Regulator | `cfregulator` | Financial Regulator · Nigeria |

### Beta Node (`localhost:4001`)
| Organisation | Username | Role |
|---|---|---|
| AgriInput Supplies Ltd | `agrinput` | Importer · Nigeria |
| HorizonTrade International | `horizontrade` | Importer · Nigeria |
| Metro Consumer Goods Ltd | `metropcg` | Importer · Kenya |

**All passwords:** `demo`

---

## Timing Guide
| Segment | Time |
|---|---|
| Opening frame | 1 min |
| Journey 1A (Vestline — payments/identity) | 4 min |
| Journey 1B (Highland — phyto hold + Egypt Customs) | 4 min |
| Journey 1C (BorderLink — informal trader) | 3 min |
| Journey 2 (Meridian Bank — LC + smart contract) | 4 min |
| Journey 3 (TransRoute — transit delay) | 3 min |
| Journey 5 (Metro Consumer — SPS failure) | 3 min |
| Journey 6 (Central Finance Regulator) | 3 min |
| Network map close | 2 min |
| **Total** | **~27 min** |

For a 15-minute slot: run Journeys 1A, 1B, 2, and 6. They cover identity, documents, finance, and regulatory oversight — the four core value props.
