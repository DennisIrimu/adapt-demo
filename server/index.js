import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).reduce((a, c) => { const [k, v] = c.replace('--', '').split('='); a[k] = v; return a; }, {});
// Env vars take priority (Railway/cloud deployment), CLI args used for local dev
const PORT     = parseInt(process.env.PORT     || args.port || '4000');
const WS_PORT  = parseInt(process.env.WS_PORT  || args.ws   || '4010');
const NODE_ID  = process.env.NODE_ID   || args.id   || 'alpha';
const NODE_NAME= process.env.NODE_NAME || args.name || (NODE_ID === 'beta' ? 'Node Beta' : 'Node Alpha');
const PEER_URL = process.env.PEER_URL  || args.peer || null;
const NODE_IP  = `127.0.0.1:${PORT}`;
const NODE_COUNTRY = process.env.NODE_COUNTRY || (NODE_ID === 'beta' ? 'Kenya' : 'Nigeria');

const DATA_DIR = path.join(__dirname, '../data');
const TANGLE_FILE = path.join(DATA_DIR, `tangle-${NODE_ID}.json`);

function loadTangleLog() {
  try {
    if (existsSync(TANGLE_FILE)) return JSON.parse(readFileSync(TANGLE_FILE, 'utf-8'));
  } catch (e) { console.error(`[${NODE_NAME}] Failed to load tangle log:`, e.message); }
  return [];
}

function saveTangleLog() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(TANGLE_FILE, JSON.stringify(store.tangleLog, null, 2));
  } catch (e) { console.error(`[${NODE_NAME}] Failed to save tangle log:`, e.message); }
}

const genId = () => crypto.randomBytes(8).toString('hex');
const genHash = () => '0x' + crypto.randomBytes(16).toString('hex');
const genDID = () => 'did:iota:0x' + crypto.randomBytes(12).toString('hex');
const now = () => new Date().toISOString();


// ── Credential validation ──
const BLACKLISTED = ['BRN-000000','TIN-000000','LEI-000000','DUNS-000000','BRN-999999'];
const EXPIRED = ['BRN-111111','TIN-111111'];
const SUSPENDED = ['BRN-222222','TIN-222222'];

function validateCredential(regNumber) {
  const n = (regNumber || '').toUpperCase().trim();
  if (n.length < 6) return { valid: false, reason: 'Registration number too short (minimum 6 characters)', failStep: 0 };
  if (BLACKLISTED.includes(n)) return { valid: false, reason: 'Registration number is on the DENIED list — organisation not recognised by any registry', failStep: 1 };
  if (n.startsWith('X') || n.startsWith('0')) return { valid: false, reason: 'Invalid prefix — number not found in any recognised national or international registry', failStep: 1 };
  if (EXPIRED.includes(n)) return { valid: false, reason: 'Registration has EXPIRED — licence is no longer active. Organisation must renew before DID issuance.', failStep: 2 };
  if (SUSPENDED.includes(n)) return { valid: false, reason: 'Registration is SUSPENDED — organisation is under regulatory review. DID issuance blocked.', failStep: 2 };
  const prefix = n.split('-')[0];
  const typeMap = { BRN: 'Business Registration Number', TIN: 'Tax Identification Number', LEI: 'Legal Entity Identifier', DUNS: 'DUNS Number' };
  return { valid: true, type: typeMap[prefix] || 'National Registration Number', formatted: n };
}

// ── Store ──
const store = {
  orgs: NODE_ID === 'alpha' ? [
    { id: 'org1',  name: 'Nortex Minerals S.A.',         role: 'Exporter · Morocco',              username: 'nortex',       password: 'demo', orgType: 'private', did: 'did:iota:adapt:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d', verified: true,  regNumber: 'RC-CASA-2018-042891', attestedBy: 'OMPIC – Office Marocain de la Propriété Industrielle et Commerciale' },
    { id: 'org2',  name: 'Morocco Customs',               role: 'Customs Authority · Morocco',     username: 'macustoms',    password: 'demo', orgType: 'public',  did: 'did:iota:adapt:2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e', verified: true,  regNumber: 'GOV-MA-CUSTOMS-001',  attestedBy: 'Ministry of Economy and Finance, Morocco' },
    { id: 'org3',  name: 'Nigeria Customs',               role: 'Customs Authority · Nigeria',     username: 'ngcustoms',    password: 'demo', orgType: 'public',  did: 'did:iota:adapt:3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f', verified: true,  regNumber: 'GOV-NG-CUSTOMS-001',  attestedBy: 'Federal Government of Nigeria' },
    { id: 'org4',  name: 'Kenya Revenue Authority',       role: 'Customs Authority · Kenya',       username: 'kra',          password: 'demo', orgType: 'public',  did: 'did:iota:adapt:4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a', verified: true,  regNumber: 'GOV-KE-KRA-001',     attestedBy: 'Parliament of Kenya — KRA Act' },
    { id: 'org7',  name: 'Financier 1',                   role: 'Financier',                       username: 'financier1',   password: 'demo', orgType: 'private', did: 'did:iota:adapt:7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', verified: true,  regNumber: 'RC-2020-NG-071182',   attestedBy: 'Nigeria National Registry' },
    { id: 'org8',  name: 'Financier 2',                   role: 'Financier',                       username: 'financier2',   password: 'demo', orgType: 'private', did: 'did:iota:adapt:8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c', verified: true,  regNumber: 'RC-2020-NG-071183',   attestedBy: 'Nigeria National Registry' },
    // Journey 1A — Urban Formal MSME Exporter
    { id: 'org9',  name: 'Vestline Apparel Ltd',           role: 'Exporter · Nigeria',              username: 'vestline',     password: 'demo', orgType: 'private', did: 'did:iota:adapt:9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d', verified: true,  regNumber: 'RC-2019-NG-047821',   attestedBy: 'Nigeria National Registry' },
    // Journey 1B — Smallholder Agriculture Exporter
    { id: 'org10', name: 'Highland Growers Cooperative',   role: 'Exporter · Tanzania',             username: 'highland',     password: 'demo', orgType: 'private', did: 'did:iota:adapt:0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', verified: true,  regNumber: 'REG-TZ-2017-089234',  attestedBy: 'BRELA – Tanzania Business Registrations & Licensing Agency' },
    // Journey 1C — Informal Cross-Border Trader (unverified — demo story)
    { id: 'org11', name: 'BorderLink Traders',             role: 'Trader · West Africa',            username: 'borderlink',   password: 'demo', orgType: 'private', did: null, verified: false, regNumber: null, attestedBy: null },
    // Journey 2 — Bank (Trade Finance)
    { id: 'org12', name: 'Meridian Bank Trade Finance',    role: 'Financier · Nigeria',             username: 'meridian',     password: 'demo', orgType: 'private', did: 'did:iota:adapt:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8', verified: true,  regNumber: 'RC-2008-NG-189034',   attestedBy: 'Nigeria National Registry' },
    // Journey 3 — Logistics Operator
    { id: 'org13', name: 'TransRoute Logistics Ltd',       role: 'Logistics Operator',              username: 'transroute',   password: 'demo', orgType: 'private', did: 'did:iota:adapt:d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9', verified: true,  regNumber: 'RC-2015-NG-293847',   attestedBy: 'Nigeria National Registry' },
    // Journey 4 — Destination Customs Officer
    { id: 'org14', name: 'Egypt Customs Authority',        role: 'Customs Authority · Egypt',       username: 'egcustoms',    password: 'demo', orgType: 'public',  did: 'did:iota:adapt:e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', verified: true,  regNumber: 'GOV-EG-CUSTOMS-001',  attestedBy: 'General Authority for Investment (GAFI), Egypt' },
    // Journey 6 — Financial Regulator
    { id: 'org15', name: 'Central Finance Regulator',      role: 'Financial Regulator · Nigeria',   username: 'cfregulator',  password: 'demo', orgType: 'public',  did: 'did:iota:adapt:f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1', verified: true,  regNumber: 'GOV-NG-CFR-001',      attestedBy: 'Federal Government of Nigeria' },
  ] : [
    { id: 'org5',  name: 'AgriInput Supplies Ltd',         role: 'Importer · Nigeria',              username: 'agrinput',     password: 'demo', orgType: 'private', did: 'did:iota:adapt:5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', verified: true,  regNumber: 'RC-2021-NG-061293',   attestedBy: 'Nigeria National Registry' },
    { id: 'org6',  name: 'HorizonTrade International',     role: 'Importer · Nigeria',              username: 'horizontrade', password: 'demo', orgType: 'private', did: 'did:iota:adapt:6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c', verified: true,  regNumber: 'RC-2017-NG-142567',   attestedBy: 'Nigeria National Registry' },
    // Journey 5 — FMCG Importer
    { id: 'org16', name: 'Metro Consumer Goods Ltd',       role: 'Importer · Kenya',                username: 'metropcg',     password: 'demo', orgType: 'private', did: 'did:iota:adapt:a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2', verified: true,  regNumber: 'CPR-2018-KE-094831',  attestedBy: 'Registrar of Companies, Kenya' },
  ],
  consignments: [], documents: [], permissions: {}, docPermissions: {},
  payments: [], letterOfCredits: [], smartContracts: [], financePermissions: {},
  tangleLog: loadTangleLog(),
  peerOrgs: [], peerConnected: false,
};

function addLog(type, action, actor, details, extra = {}) {
  const entry = { id: genId(), timestamp: now(), hash: genHash(), type, action, actor, details, ...extra };
  store.tangleLog.unshift(entry);
  saveTangleLog();
  broadcastToClients({ type: 'TANGLE_UPDATE', log: store.tangleLog });
  if (store.peerConnected && peerWs?.readyState === WebSocket.OPEN) peerWs.send(JSON.stringify({ type: 'TANGLE_ENTRY', entry }));
  return entry;
}

// Idempotent seed helper — appends historical events without duplicating
function seedLog(type, action, actor, details, timestamp) {
  if (store.tangleLog.some(e => e.details === details)) return;
  store.tangleLog.push({ id: genId(), timestamp, hash: genHash(), type, action, actor, details });
}

// ── PDF generator for seeded documents ──
function makeSeedPdf(docType, ref, issuer, ucr, shipDate, exporter, importer, fromCountry, toCountry) {
  const lines = {
    'Commercial Invoice': [
      `COMMERCIAL INVOICE`, ``,
      `Invoice No : ${ref}`,
      `Date       : ${shipDate}`,
      `Exporter   : ${exporter}`,
      `Importer   : ${importer}`,
      `UCR        : ${ucr}`,
      `Route      : ${fromCountry} to ${toCountry}`,
      ``, `This document serves as the commercial invoice for the above shipment.`,
      `All details are as agreed under the relevant sales contract.`,
    ],
    'Packing List': [
      `PACKING LIST`, ``,
      `Reference  : ${ref}`,
      `Date       : ${shipDate}`,
      `Exporter   : ${exporter}`,
      `UCR        : ${ucr}`,
      ``, `Package details are as per the accompanying commercial invoice.`,
      `All goods have been inspected and packed in accordance with export requirements.`,
    ],
    'Bill of Lading': [
      `BILL OF LADING`, ``,
      `B/L No     : ${ref}`,
      `Date       : ${shipDate}`,
      `Shipper    : ${exporter}`,
      `Consignee  : ${importer}`,
      `UCR        : ${ucr}`,
      `Port of Loading    : ${fromCountry}`,
      `Port of Discharge  : ${toCountry}`,
      ``, `Received in apparent good order and condition the goods described herein.`,
    ],
    'Certificate of Origin': [
      `CERTIFICATE OF ORIGIN`, ``,
      `Certificate No : ${ref}`,
      `Date           : ${shipDate}`,
      `Issued by      : ${issuer}`,
      `Exporter       : ${exporter}`,
      `UCR            : ${ucr}`,
      `Country of Origin : ${fromCountry}`,
      ``, `We hereby certify that the goods described in this document`,
      `originate in ${fromCountry} and comply with all applicable regulations.`,
    ],
    'Export Declaration': [
      `EXPORT DECLARATION`, ``,
      `Declaration No : ${ref}`,
      `Date           : ${shipDate}`,
      `Declarant      : ${issuer}`,
      `Exporter       : ${exporter}`,
      `UCR            : ${ucr}`,
      `Country of Export : ${fromCountry}`,
      `Country of Destination : ${toCountry}`,
      ``, `This export declaration is submitted in accordance with applicable customs regulations.`,
    ],
  };
  const body = (lines[docType] || [`${docType}`, ``, `Reference: ${ref}`, `Issuer: ${issuer}`, `UCR: ${ucr}`])
    .map(l => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`)
    .join('\n');

  const stream =
    `BT\n/F1 11 Tf\n72 720 Td\n14 TL\n` + body + `\nET`;
  const streamLen = Buffer.byteLength(stream, 'utf8');

  const pdf =
    `%PDF-1.4\n` +
    `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
    `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
    `3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n` +
    `4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n` +
    `5 0 obj<</Length ${streamLen}>>\nstream\n${stream}\nendstream\nendobj\n` +
    `xref\n0 6\n0000000000 65535 f \n` +
    `trailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8').toString('base64');
}

// ── XML generator for seeded BOL / Export Declaration documents ──
function makeSeedXml(docType, m, ref) {
  // Deterministic fake values derived from the UCR so they're stable across restarts
  const seed = parseInt(m.ucr.replace(/\D/g, '').slice(-4) || '1234');
  const voyageNo  = `V${2600 + (seed % 99)}`;
  const imoNo     = `IMO${9000000 + (seed % 999999)}`;
  const blOriginals = '3';
  const containerNo = `TCKU${3000000 + (seed % 9999999)}`;
  const sealNo      = `SL${10000 + (seed % 89999)}`;
  const grossMass   = m.quantity.match(/[\d,]+/)?.[0]?.replace(',','') || '1000';
  const netMass     = Math.round(parseInt(grossMass) * 0.97);
  const arrival     = new Date(new Date(m.shipDate).getTime() + 14 * 86400000).toISOString().slice(0,10);
  const carrier     = m.vessel.startsWith('KQ') ? 'Kenya Airways Cargo'
                    : m.vessel.startsWith('ET') ? 'Ethiopian Airlines Cargo'
                    : 'NordShip Line S.A.';
  const exporterAddr = m.fromCountry === 'Morocco'      ? '12 Rue Al Borj, Casablanca 20000, Morocco'
                     : m.fromCountry === 'Kenya'         ? 'Westlands Business Park, Nairobi, Kenya'
                     : m.fromCountry === 'Tanzania'      ? 'Ohio Street, Dar es Salaam, Tanzania'
                     : m.fromCountry === 'Ivory Coast'   ? 'Boulevard de la Paix, Abidjan, Ivory Coast'
                     : m.fromCountry === 'Ghana'         ? 'Ring Road Central, Accra, Ghana'
                     : m.fromCountry === 'South Africa'  ? 'Sandton Drive, Johannesburg, South Africa'
                     : m.fromCountry === 'Egypt'         ? 'Port Said Road, Alexandria, Egypt'
                     : '14 Creek Road, Apapa, Lagos, Nigeria';
  const importerAddr = m.toCountry === 'Netherlands'    ? 'Prins Bernhardplein 200, Amsterdam, Netherlands'
                     : m.toCountry === 'Germany'         ? 'Speicherstadt 1, Hamburg, Germany'
                     : m.toCountry === 'United Kingdom'  ? '1 Dock Road, Felixstowe, Suffolk, UK'
                     : m.toCountry === 'South Africa'    ? 'Island View, Durban, South Africa'
                     : m.toCountry === 'Kenya'           ? 'Westlands Avenue, Nairobi, Kenya'
                     : m.toCountry === 'Egypt'           ? 'Port Said Road, Alexandria, Egypt'
                     : m.toCountry === 'Ghana'           ? 'Tema Industrial Area, Accra, Ghana'
                     : '24 Marina Street, Victoria Island, Lagos, Nigeria';

  if (docType === 'Bill of Lading') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<TransportDocument>
  <TransportDocumentReference>${ref}</TransportDocumentReference>
  <ContractQuotationReference>${m.ucr}</ContractQuotationReference>
  <IssueDate>${m.shipDate}</IssueDate>
  <ShippedOnBoardDate>${m.shipDate}</ShippedOnBoardDate>
  <IssuerCode>NL-SHP-001</IssuerCode>
  <ServiceContractReference>${m.invoiceRef}</ServiceContractReference>
  <Shipper>
    <PartyName>${m.exporter}</PartyName>
    <Address>${exporterAddr}</Address>
    <RegistrationNumber>REG-${m.fromCountry.slice(0,2).toUpperCase()}-${seed}</RegistrationNumber>
    <TaxIdentifier>TAX-${seed + 1000}</TaxIdentifier>
  </Shipper>
  <Consignee>
    <PartyName>${m.importer}</PartyName>
    <Address>${importerAddr}</Address>
    <RegistrationNumber>REG-${m.toCountry.slice(0,2).toUpperCase()}-${seed + 500}</RegistrationNumber>
  </Consignee>
  <VesselName>${m.vessel}</VesselName>
  <VoyageNumber>${voyageNo}</VoyageNumber>
  <IMONumber>${imoNo}</IMONumber>
  <CarrierName>${carrier}</CarrierName>
  <PortOfLoading>${m.originPort}</PortOfLoading>
  <PortOfDischarge>${m.destinationPort}</PortOfDischarge>
  <EstimatedArrival>${arrival}</EstimatedArrival>
  <HSCode>${m.hsCode}</HSCode>
  <DescriptionOfGoods>${m.product}</DescriptionOfGoods>
  <Quantity>${grossMass}</Quantity>
  <QuantityUnit>MT</QuantityUnit>
  <GrossWeight>${grossMass}</GrossWeight>
  <GrossWeightUnit>MT</GrossWeightUnit>
  <NumberOfPackages>${Math.ceil(parseInt(grossMass) / 25)}</NumberOfPackages>
  <DeclaredValue>${m.totalValue}</DeclaredValue>
  <Currency>${m.currency}</Currency>
  <Incoterms>${m.incoterms}</Incoterms>
  <FreightPayableBy>${m.incoterms === 'FOB' ? 'Consignee' : 'Shipper'}</FreightPayableBy>
  <NumberOfOriginalsBL>${blOriginals}</NumberOfOriginalsBL>
  <IssuePlaceAndDate>${m.originPort}, ${m.shipDate}</IssuePlaceAndDate>
  <SignatoryName>Captain, ${m.vessel}</SignatoryName>
</TransportDocument>`;
  }

  if (docType === 'Export Declaration') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<CustomsDeclaration>
  <DeclarationNumber>${ref}</DeclarationNumber>
  <UCR>${m.ucr}</UCR>
  <DeclarationDate>${m.shipDate}</DeclarationDate>
  <DeclarationType>EX</DeclarationType>
  <ProcedureCode>1000</ProcedureCode>
  <CountryOfDispatch>${m.fromCountry}</CountryOfDispatch>
  <CountryOfDestination>${m.toCountry}</CountryOfDestination>
  <PortOfExport>${m.originPort}</PortOfExport>
  <PortOfDestination>${m.destinationPort}</PortOfDestination>
  <Exporter>
    <Name>${m.exporter}</Name>
    <Address>${exporterAddr}</Address>
    <Identifier>EXP-${m.fromCountry.slice(0,2).toUpperCase()}-${seed}</Identifier>
    <TaxIdentifier>TAX-${seed + 1000}</TaxIdentifier>
  </Exporter>
  <Consignee>
    <Name>${m.importer}</Name>
    <Address>${importerAddr}</Address>
    <Identifier>IMP-${m.toCountry.slice(0,2).toUpperCase()}-${seed + 500}</Identifier>
  </Consignee>
  <TransportMode>1</TransportMode>
  <VesselName>${m.vessel}</VesselName>
  <VoyageNumber>${voyageNo}</VoyageNumber>
  <IMONumber>${imoNo}</IMONumber>
  <ContainerNumber>${containerNo}</ContainerNumber>
  <SealNumber>${sealNo}</SealNumber>
  <HSCode>${m.hsCode}</HSCode>
  <Description>${m.product}</Description>
  <Quantity>${grossMass}</Quantity>
  <QuantityUnit>MT</QuantityUnit>
  <UnitPrice>${Math.round(m.totalValue / parseInt(grossMass))}</UnitPrice>
  <CustomsValue>${m.totalValue}</CustomsValue>
  <Currency>${m.currency}</Currency>
  <GrossMass>${grossMass}</GrossMass>
  <NetMass>${netMass}</NetMass>
  <CountryOfOrigin>${m.fromCountry}</CountryOfOrigin>
  <PreferenceCode>100</PreferenceCode>
  <InvoiceNumber>${m.invoiceRef}</InvoiceNumber>
  <InvoiceDate>${m.shipDate}</InvoiceDate>
  <InvoiceTotal>${m.totalValue}</InvoiceTotal>
  <InvoiceCurrency>${m.currency}</InvoiceCurrency>
  <Incoterms>${m.incoterms}</Incoterms>
  <BillOfLadingRef>BL-${ref.replace(/[A-Z]+-\d+-/,'')}</BillOfLadingRef>
  <CertificateOfOriginRef>CO-${ref.replace(/[A-Z]+-\d+-/,'')}</CertificateOfOriginRef>
  <InsuranceCertificateRef>INS-${seed}</InsuranceCertificateRef>
  <DeclarantName>${m.fromCountry === 'Morocco' ? 'Morocco Customs' : m.fromCountry === 'Kenya' ? 'Kenya Revenue Authority' : m.fromCountry === 'Tanzania' ? 'Tanzania Revenue Authority' : m.fromCountry === 'Ivory Coast' ? 'Direction Générale des Douanes, Ivory Coast' : m.fromCountry === 'Ghana' ? 'Ghana Revenue Authority' : m.fromCountry === 'South Africa' ? 'South African Revenue Service (SARS)' : m.fromCountry === 'Egypt' ? 'Egyptian Customs Authority' : 'Nigeria Customs'}</DeclarantName>
  <DeclarationLocation>${m.originPort}</DeclarationLocation>
  <Status>ACCEPTED</Status>
</CustomsDeclaration>`;
  }

  return null;
}

// ── Hardcoded demo consignments ──
const ALPHA_CONSIGNMENTS = [
  // Morocco → Nigeria (AtlasPhosphate, org1)
  { ucr:'UCR-2026-MA-NG-00101', product:'Triple Super Phosphate (TSP)',    hsCode:'3103.10', quantity:'2,400 MT', totalValue:340000, currency:'USD', exporter:'Nortex Minerals S.A.', importer:'AgriInput Supplies Ltd',       fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Apapa Port, Lagos',      vessel:'MV Atlas Pioneer',    shipDate:'2026-02-18', incoterms:'CFR', invoiceRef:'INV-2026-APM-0101', declRef:'MA-EXP-2026-0101', status:'Delivered',   creatorOrgId:'org1', creatorOrgName:'Nortex Minerals S.A.' },
  { ucr:'UCR-2026-MA-NG-00102', product:'Di-Ammonium Phosphate (DAP)',     hsCode:'3105.30', quantity:'1,800 MT', totalValue:290000, currency:'USD', exporter:'Nortex Minerals S.A.', importer:'HorizonTrade International', fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Tin Can Island Port',    vessel:'MV Maroc Express',    shipDate:'2026-02-20', incoterms:'FOB', invoiceRef:'INV-2026-APM-0102', declRef:'MA-EXP-2026-0102', status:'In Transit',  creatorOrgId:'org1', creatorOrgName:'Nortex Minerals S.A.' },
  { ucr:'UCR-2026-MA-NG-00103', product:'Granular Urea (46% N)',           hsCode:'3102.10', quantity:'3,000 MT', totalValue:510000, currency:'USD', exporter:'Nortex Minerals S.A.', importer:'AgriInput Supplies Ltd',       fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Agadir',      destinationPort:'Apapa Port, Lagos',      vessel:'MV Sahara Star',      shipDate:'2026-03-01', incoterms:'CIF', invoiceRef:'INV-2026-APM-0103', declRef:'MA-EXP-2026-0103', status:'Customs',     creatorOrgId:'org1', creatorOrgName:'Nortex Minerals S.A.' },
  { ucr:'UCR-2026-MA-NG-00104', product:'Phosphoric Acid (75% P₂O₅)',     hsCode:'2809.20', quantity:'950 MT',   totalValue:178000, currency:'USD', exporter:'Nortex Minerals S.A.', importer:'HorizonTrade International', fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Jorf Lasfar', destinationPort:'Onne Port',              vessel:'MV Chemtrans Atlas',  shipDate:'2026-03-05', incoterms:'CFR', invoiceRef:'INV-2026-APM-0104', declRef:'MA-EXP-2026-0104', status:'Submitted',   creatorOrgId:'org1', creatorOrgName:'Nortex Minerals S.A.' },
  { ucr:'UCR-2026-MA-NG-00105', product:'Mono-Ammonium Phosphate (MAP)',   hsCode:'3105.40', quantity:'2,100 MT', totalValue:375000, currency:'USD', exporter:'Nortex Minerals S.A.', importer:'AgriInput Supplies Ltd',       fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Apapa Port, Lagos',      vessel:'MV Northern Cape',    shipDate:'2026-03-12', incoterms:'FOB', invoiceRef:'INV-2026-APM-0105', declRef:'MA-EXP-2026-0105', status:'Released',    creatorOrgId:'org1', creatorOrgName:'Nortex Minerals S.A.' },
  { ucr:'UCR-2026-MA-NG-00106', product:'Sulphate of Potash (SOP)',        hsCode:'3104.20', quantity:'1,200 MT', totalValue:264000, currency:'USD', exporter:'Nortex Minerals S.A.', importer:'HorizonTrade International', fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Tin Can Island Port',    vessel:'MV Atlas Pioneer',    shipDate:'2026-03-18', incoterms:'CIF', invoiceRef:'INV-2026-APM-0106', declRef:'MA-EXP-2026-0106', status:'In Transit',  creatorOrgId:'org1', creatorOrgName:'Nortex Minerals S.A.' },
  { ucr:'UCR-2026-MA-NG-E001',  product:'Rock Phosphate (35% P₂O₅)',      hsCode:'2510.20', quantity:'4,500 MT', totalValue:148500, currency:'USD', exporter:'Nortex Minerals S.A.', importer:'AgriInput Supplies Ltd',       fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Jorf Lasfar', destinationPort:'Apapa Port, Lagos',      vessel:'MV Desert Wind',      shipDate:'2026-01-24', incoterms:'CFR', invoiceRef:'INV-2026-APM-E001', declRef:'MA-EXP-2026-E001', status:'Under Review', creatorOrgId:'org1', creatorOrgName:'Nortex Minerals S.A.', errorType:'Document Discrepancy', errorDescription:'Certificate of Origin issuer code does not match Morocco Customs registry. Awaiting reissue from MAEX.' },
  { ucr:'UCR-2026-MA-NG-E003',  product:'Ammonium Sulphate (21% N)',      hsCode:'3102.21', quantity:'1,600 MT', totalValue:214400, currency:'USD', exporter:'Nortex Minerals S.A.', importer:'HorizonTrade International', fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Tin Can Island Port',    vessel:'MV Maroc Express',    shipDate:'2026-02-10', incoterms:'FOB', invoiceRef:'INV-2026-APM-E003', declRef:'MA-EXP-2026-E003', status:'Under Review', creatorOrgId:'org1', creatorOrgName:'Nortex Minerals S.A.', errorType:'HS Code Mismatch', errorDescription:'HS code declared on Export Declaration (3102.29) does not match Commercial Invoice (3102.21). Nigeria Customs has flagged for reconciliation.' },
  // Kenya exports (KRA, org4)
  { ucr:'KE-2026-EXP-00101', product:'Fresh Cut Flowers (Mixed)',          hsCode:'0603.19', quantity:'18,400 kg',totalValue: 92000, currency:'USD', exporter:'Kenya Flower Council',   importer:'Aalsmeer Flower Auction',   fromCountry:'Kenya',   toCountry:'Netherlands', originPort:'JKIA Cargo, Nairobi',  destinationPort:'Amsterdam Schiphol',     vessel:'KQ Cargo 101',        shipDate:'2026-02-15', incoterms:'CPT', invoiceRef:'INV-2026-KFC-0101', declRef:'KE-EXP-2026-0101', status:'Delivered',   creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00102', product:'Green Tea — Orthodox (PEKOE)',       hsCode:'0902.10', quantity:'42,000 kg',totalValue:168000, currency:'USD', exporter:'Kenya Tea Development Agency',importer:'British Tea Holdings Ltd', fromCountry:'Kenya',  toCountry:'United Kingdom', originPort:'Port of Mombasa',     destinationPort:'Port of Felixstowe',     vessel:'MV Kwanza Bridge',    shipDate:'2026-02-22', incoterms:'CIF', invoiceRef:'INV-2026-KTDA-0102',declRef:'KE-EXP-2026-0102', status:'In Transit',  creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00103', product:'Washed Arabica Coffee (AA Grade)',   hsCode:'0901.11', quantity:'21,600 kg',totalValue:324000, currency:'USD', exporter:'Nairobi Coffee Exchange', importer:'Volcafe Speciality Coffee', fromCountry:'Kenya',  toCountry:'Germany',         originPort:'Port of Mombasa',     destinationPort:'Port of Hamburg',        vessel:'MV MSC Zanzibar',     shipDate:'2026-03-03', incoterms:'FOB', invoiceRef:'INV-2026-NCE-0103', declRef:'KE-EXP-2026-0103', status:'Customs',     creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00104', product:'Fresh Avocados — Hass',              hsCode:'0804.40', quantity:'38,000 kg',totalValue:114000, currency:'USD', exporter:'Kakuzi PLC',              importer:'EuroFresh Distributors B.V.',fromCountry:'Kenya', toCountry:'Netherlands',  originPort:'Port of Mombasa',     destinationPort:'Port of Rotterdam',      vessel:'MV African Spirit',   shipDate:'2026-03-08', incoterms:'CFR', invoiceRef:'INV-2026-KAK-0104', declRef:'KE-EXP-2026-0104', status:'Released',    creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00105', product:'Macadamia Nuts — Raw (In-Shell)',    hsCode:'0802.60', quantity:'14,500 kg',totalValue: 87000, currency:'USD', exporter:'Kenya Nut Company Ltd',   importer:'Olam International Ltd',    fromCountry:'Kenya',  toCountry:'South Africa',    originPort:'Port of Mombasa',     destinationPort:'Port of Durban',         vessel:'MV Safmarine Mafadi', shipDate:'2026-03-14', incoterms:'CIF', invoiceRef:'INV-2026-KNC-0105', declRef:'KE-EXP-2026-0105', status:'Submitted',   creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00106', product:'French Green Beans (Fine)',          hsCode:'0708.20', quantity:'22,000 kg',totalValue: 66000, currency:'USD', exporter:'Vegpro Group Ltd',        importer:'M&S Food Suppliers UK',     fromCountry:'Kenya',  toCountry:'United Kingdom',  originPort:'JKIA Cargo, Nairobi',  destinationPort:'Heathrow Air Cargo',     vessel:'KQ Cargo 107',        shipDate:'2026-03-19', incoterms:'DAP', invoiceRef:'INV-2026-VPG-0106', declRef:'KE-EXP-2026-0106', status:'In Transit',  creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  // Journey 1A — Vestline Apparel Ltd (org9): MSME fashion exporter, Lagos → Nairobi
  // Story: 43-day overdue payment, identity not recognised cross-border
  { ucr:'UCR-2026-NG-KE-01001', product:'Woven Cotton Garments (Kente-style)',       hsCode:'6204.42', quantity:'4,200 units', totalValue: 58800, currency:'USD', exporter:'Vestline Apparel Ltd', importer:'Nairobi Style Distributors',   fromCountry:'Nigeria', toCountry:'Kenya', originPort:'Murtala Muhammed Airport Cargo, Lagos', destinationPort:'JKIA Cargo, Nairobi',   vessel:'ET Cargo 441', shipDate:'2026-01-15', incoterms:'DAP', invoiceRef:'INV-2026-LTL-01001', declRef:'NG-EXP-2026-LT01', status:'Delivered',   creatorOrgId:'org9', creatorOrgName:'Vestline Apparel Ltd' },
  { ucr:'UCR-2026-NG-KE-01002', product:'African Print Fabric (Ankara, 100% Cotton)', hsCode:'5208.52', quantity:'12,000 metres', totalValue: 43200, currency:'USD', exporter:'Vestline Apparel Ltd', importer:'Nairobi Style Distributors',   fromCountry:'Nigeria', toCountry:'Kenya', originPort:'Apapa Port, Lagos',                     destinationPort:'Port of Mombasa',       vessel:'MV East Africa', shipDate:'2026-02-10', incoterms:'FOB', invoiceRef:'INV-2026-LTL-01002', declRef:'NG-EXP-2026-LT02', status:'In Transit',  creatorOrgId:'org9', creatorOrgName:'Vestline Apparel Ltd' },
  { ucr:'UCR-2026-NG-KE-01003', product:'Embroidered Dashiki Shirts (Mixed Sizes)',   hsCode:'6205.20', quantity:'2,800 units',  totalValue: 33600, currency:'USD', exporter:'Vestline Apparel Ltd', importer:'Nairobi Style Distributors',   fromCountry:'Nigeria', toCountry:'Kenya', originPort:'Murtala Muhammed Airport Cargo, Lagos', destinationPort:'JKIA Cargo, Nairobi',   vessel:'ET Cargo 508', shipDate:'2026-03-05', incoterms:'DAP', invoiceRef:'INV-2026-LTL-01003', declRef:'NG-EXP-2026-LT03', status:'Submitted',   creatorOrgId:'org9', creatorOrgName:'Vestline Apparel Ltd' },
  // Journey 1B — Highland Growers Cooperative (org10): e-phyto not retrievable
  // Story: Phytosanitary certificate cannot be digitally retrieved by Egypt Customs
  { ucr:'UCR-2026-TZ-EG-02001', product:'Highland Arabica Coffee (Green Beans, AA Grade)',   hsCode:'0901.11', quantity:'28,000 kg', totalValue:196000, currency:'USD', exporter:'Highland Growers Cooperative', importer:'Cairo Import Partners Co.',  fromCountry:'Tanzania', toCountry:'Egypt', originPort:'Port of Dar es Salaam', destinationPort:'Port of Alexandria', vessel:'MV African Horizon',  shipDate:'2026-02-08', incoterms:'CIF', invoiceRef:'INV-2026-KCC-02001', declRef:'TZ-EXP-2026-KC01', status:'Under Review', creatorOrgId:'org10', creatorOrgName:'Highland Growers Cooperative', errorType:'Phytosanitary Hold', errorDescription:'E-phyto certificate issued by Tanzania Plant Health and Pesticides Authority (TPHPA) cannot be retrieved electronically by Egypt Customs Authority. Manual re-testing ordered at Port of Alexandria. Estimated delay: 18-22 days.' },
  { ucr:'UCR-2026-TZ-EG-02002', product:'Highland Peaberry Coffee (Roasted, Specialty Grade)', hsCode:'0901.21', quantity:'14,500 kg', totalValue:130500, currency:'USD', exporter:'Highland Growers Cooperative', importer:'Cairo Import Partners Co.',  fromCountry:'Tanzania', toCountry:'Egypt', originPort:'Port of Dar es Salaam', destinationPort:'Port of Alexandria', vessel:'MV Red Sea Express', shipDate:'2026-03-14', incoterms:'FOB', invoiceRef:'INV-2026-KCC-02002', declRef:'TZ-EXP-2026-KC02', status:'In Transit',   creatorOrgId:'org10', creatorOrgName:'Highland Growers Cooperative' },
  // Journey 1C — BorderLink Traders (org11): Informal cross-border trader
  // Story: No DID, no documents — cannot build trade history for formal credit
  { ucr:'UCR-2026-CI-GH-03001', product:'Dried Hibiscus Flowers (Bissap)',          hsCode:'0712.90', quantity:'320 kg',    totalValue:   960, currency:'USD', exporter:'BorderLink Traders', importer:'Kumasi Market Importers', fromCountry:'Ivory Coast', toCountry:'Ghana', originPort:'Abidjan Land Border, Elubo', destinationPort:'Elubo Border Post, Ghana', vessel:'Road — Truck GH-4421', shipDate:'2026-01-22', incoterms:'EXW', invoiceRef:'INV-2026-ADT-03001', declRef:'CI-EXP-2026-AD01', status:'Delivered',  creatorOrgId:'org11', creatorOrgName:'BorderLink Traders' },
  { ucr:'UCR-2026-CI-GH-03002', product:'Shea Butter (Unrefined, Grade A)',          hsCode:'1515.90', quantity:'480 kg',    totalValue:  1200, currency:'USD', exporter:'BorderLink Traders', importer:'Kumasi Market Importers', fromCountry:'Ivory Coast', toCountry:'Ghana', originPort:'Abidjan Land Border, Elubo', destinationPort:'Elubo Border Post, Ghana', vessel:'Road — Truck GH-4421', shipDate:'2026-02-18', incoterms:'EXW', invoiceRef:'INV-2026-ADT-03002', declRef:'CI-EXP-2026-AD02', status:'Delivered',  creatorOrgId:'org11', creatorOrgName:'BorderLink Traders' },
  { ucr:'UCR-2026-CI-GH-03003', product:'Hand-Woven Kente Cloth Strips',             hsCode:'5801.90', quantity:'150 metres', totalValue:   450, currency:'USD', exporter:'BorderLink Traders', importer:'Kumasi Market Importers', fromCountry:'Ivory Coast', toCountry:'Ghana', originPort:'Abidjan Land Border, Elubo', destinationPort:'Elubo Border Post, Ghana', vessel:'Road — Truck GH-5203', shipDate:'2026-03-11', incoterms:'EXW', invoiceRef:'INV-2026-ADT-03003', declRef:'CI-EXP-2026-AD03', status:'Submitted',  creatorOrgId:'org11', creatorOrgName:'BorderLink Traders' },
  // Journey 3 — TransRoute Logistics Ltd (org13): Logistics Operator, multi-jurisdiction
  // Story: No Single Window interoperability — port dwell time accumulating
  { ucr:'UCR-2026-NG-KE-04001', product:'Industrial Machinery Parts (Mixed)',  hsCode:'8431.49', quantity:'14,200 kg', totalValue:312000, currency:'USD', exporter:'Western Industrial Exports Ltd', importer:'Mombasa Port Industrial Co.',    fromCountry:'Nigeria',  toCountry:'Kenya',        originPort:'Apapa Port, Lagos',  destinationPort:'Port of Mombasa',      vessel:'MV Mombasa Pride',      shipDate:'2026-02-22', incoterms:'CFR', invoiceRef:'INV-2026-PAF-04001', declRef:'NG-EXP-2026-PA01', status:'Customs',     creatorOrgId:'org13', creatorOrgName:'TransRoute Logistics Ltd', errorType:'Transit Delay', errorDescription:'Shipment held at Mombasa Port — transit customs declaration missing from Uganda leg. TransRoute Logistics awaiting re-submission through Kenya TradeNet Single Window. Port dwell time: 9 days and counting.' },
  { ucr:'UCR-2026-GH-ZA-04002', product:'Cocoa Powder (Alkalized, Bulk)',      hsCode:'1805.00', quantity:'6,800 kg',  totalValue: 54400, currency:'USD', exporter:'Ghana Cocoa Processing Co.',  importer:'Johannesburg Confectionery Ltd', fromCountry:'Ghana',    toCountry:'South Africa', originPort:'Port of Tema',       destinationPort:'Port of Durban',       vessel:'MV Safmarine Kariba',   shipDate:'2026-03-09', incoterms:'CIF', invoiceRef:'INV-2026-PAF-04002', declRef:'GH-EXP-2026-PA02', status:'In Transit',  creatorOrgId:'org13', creatorOrgName:'TransRoute Logistics Ltd' },
];

const BETA_CONSIGNMENTS = [
  // Nigeria → Morocco (PrimeFert/TradeLink, org5/org6)
  { ucr:'UCR-2026-NG-MA-00201', product:'Sesame Seeds (White Hulled)',     hsCode:'1207.40', quantity:'1,200 MT', totalValue:156000, currency:'USD', exporter:'AgriInput Supplies Ltd',       importer:'Oleagineux du Maghreb S.A.',  fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Apapa Port, Lagos',      destinationPort:'Port of Casablanca', vessel:'MV Bight of Benin',   shipDate:'2026-02-25', incoterms:'FOB', invoiceRef:'INV-2026-PFN-0201', declRef:'NG-EXP-2026-0201', status:'Delivered',   creatorOrgId:'org5', creatorOrgName:'AgriInput Supplies Ltd' },
  { ucr:'UCR-2026-NG-MA-00202', product:'Raw Cocoa Beans (Grade 1)',       hsCode:'1801.00', quantity:'850 MT',   totalValue:272000, currency:'USD', exporter:'HorizonTrade International', importer:'Confitrade Maroc S.A.',  fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Tin Can Island Port',     destinationPort:'Port of Casablanca', vessel:'MV Ebony Star',       shipDate:'2026-03-04', incoterms:'CIF', invoiceRef:'INV-2026-TLI-0202', declRef:'NG-EXP-2026-0202', status:'In Transit',  creatorOrgId:'org6', creatorOrgName:'HorizonTrade International' },
  { ucr:'UCR-2026-NG-MA-00203', product:'Palm Kernel Oil (PKO)',           hsCode:'1513.21', quantity:'600 MT',   totalValue: 78000, currency:'USD', exporter:'AgriInput Supplies Ltd',       importer:'Maghreb Oils S.A.',        fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Onne Port',               destinationPort:'Port of Agadir',     vessel:'MV Atlantic Trader', shipDate:'2026-03-10', incoterms:'CFR', invoiceRef:'INV-2026-PFN-0203', declRef:'NG-EXP-2026-0203', status:'Customs',     creatorOrgId:'org5', creatorOrgName:'AgriInput Supplies Ltd' },
  { ucr:'UCR-2026-NG-MA-00204', product:'Cashew Nuts RCN (W240 Grade)',    hsCode:'0801.31', quantity:'420 MT',   totalValue:189000, currency:'USD', exporter:'HorizonTrade International', importer:'Horizon Agri Maroc S.A.',             fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Apapa Port, Lagos',      destinationPort:'Port of Casablanca', vessel:'MV Bight of Benin',   shipDate:'2026-03-17', incoterms:'FOB', invoiceRef:'INV-2026-TLI-0204', declRef:'NG-EXP-2026-0204', status:'Submitted',   creatorOrgId:'org6', creatorOrgName:'HorizonTrade International' },
  { ucr:'UCR-2026-NG-MA-E002',  product:'Soybean Meal (47% Protein)',      hsCode:'2304.00', quantity:'2,000 MT', totalValue:160000, currency:'USD', exporter:'AgriInput Supplies Ltd',       importer:'Coopagri Maroc',              fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Apapa Port, Lagos',      destinationPort:'Port of Casablanca', vessel:'MV African Spirit',  shipDate:'2026-02-12', incoterms:'CIF', invoiceRef:'INV-2026-PFN-E002', declRef:'NG-EXP-2026-E002', status:'Under Review', creatorOrgId:'org5', creatorOrgName:'AgriInput Supplies Ltd', errorType:'Phytosanitary Failure', errorDescription:'NAQS phytosanitary certificate expired 14 days before shipment date. Morocco Plant Protection Directorate has placed shipment on hold pending resubmission.' },
  // Journey 5 — Metro Consumer Goods Ltd (org16): FMCG Importer, Kenya
  // Story: Manual SPS/TBT re-testing at destination; capital tied in inventory hedges
  { ucr:'UCR-2026-ZA-KE-05001', product:'Household Cleaning Products (Bulk FMCG)',       hsCode:'3402.20', quantity:'8,400 units',  totalValue:126000, currency:'USD', exporter:'Cape Town Consumer Brands Ltd', importer:'Metro Consumer Goods Ltd', fromCountry:'South Africa', toCountry:'Kenya', originPort:'Port of Durban',       destinationPort:'Port of Mombasa', vessel:'MV Safmarine Ngami', shipDate:'2026-02-14', incoterms:'CIF', invoiceRef:'INV-2026-JCG-05001', declRef:'ZA-EXP-2026-JC01', status:'Delivered',    creatorOrgId:'org16', creatorOrgName:'Metro Consumer Goods Ltd' },
  { ucr:'UCR-2026-EG-KE-05002', product:'Processed Food — Canned Tomatoes (Mixed Case)', hsCode:'2002.90', quantity:'22,000 cans',  totalValue: 88000, currency:'USD', exporter:'Cairo Food Exporters S.A.E.',   importer:'Metro Consumer Goods Ltd', fromCountry:'Egypt',        toCountry:'Kenya', originPort:'Port of Alexandria',   destinationPort:'Port of Mombasa', vessel:'MV Nile Spirit',     shipDate:'2026-03-01', incoterms:'CFR', invoiceRef:'INV-2026-JCG-05002', declRef:'EG-EXP-2026-JC02', status:'Under Review', creatorOrgId:'org16', creatorOrgName:'Metro Consumer Goods Ltd', errorType:'SPS Compliance Failure', errorDescription:'Kenya Bureau of Standards (KEBS) has flagged the consignment: maximum residue levels (MRLs) for pesticide BHC exceed Kenya\'s permissible thresholds. KEBS has ordered laboratory re-testing at Port of Mombasa. Estimated delay: 14-21 days pending results.' },
  { ucr:'UCR-2026-NG-KE-05003', product:'Personal Care Products — Shea Butter Cosmetics', hsCode:'3304.99', quantity:'15,600 units', totalValue:109200, currency:'USD', exporter:'Lagos Beauty Exports Ltd',      importer:'Metro Consumer Goods Ltd', fromCountry:'Nigeria',      toCountry:'Kenya', originPort:'Apapa Port, Lagos',    destinationPort:'Port of Mombasa', vessel:'MV East Africa',     shipDate:'2026-03-20', incoterms:'FOB', invoiceRef:'INV-2026-JCG-05003', declRef:'NG-EXP-2026-JC03', status:'Submitted',   creatorOrgId:'org16', creatorOrgName:'Metro Consumer Goods Ltd' },
];

function docsForConsignment(m) {
  const coIssuer = m.fromCountry === 'Kenya'        ? 'Kenya Export Promotion & Branding Agency'
                 : m.fromCountry === 'Morocco'       ? 'MAEX — Morocco Agri-Export Bureau'
                 : m.fromCountry === 'Tanzania'      ? 'Tanzania Trade Development Authority (TanTrade)'
                 : m.fromCountry === 'Ivory Coast'   ? 'APEX-CI — Ivory Coast Export Promotion Agency'
                 : m.fromCountry === 'Ghana'         ? 'Ghana Export Promotion Authority (GEPA)'
                 : m.fromCountry === 'South Africa'  ? 'International Trade Administration Commission (ITAC)'
                 : m.fromCountry === 'Egypt'         ? 'Egyptian Export Promotion Center (EEPC)'
                 : 'NEPC — Nigeria Export Promotion Council';
  const edIssuer = m.fromCountry === 'Kenya'        ? 'Kenya Revenue Authority'
                 : m.fromCountry === 'Morocco'       ? 'Morocco Customs'
                 : m.fromCountry === 'Tanzania'      ? 'Tanzania Revenue Authority'
                 : m.fromCountry === 'Ivory Coast'   ? 'Direction Générale des Douanes (DGD), Ivory Coast'
                 : m.fromCountry === 'Ghana'         ? 'Ghana Revenue Authority (GRA)'
                 : m.fromCountry === 'South Africa'  ? 'South African Revenue Service (SARS)'
                 : m.fromCountry === 'Egypt'         ? 'Egyptian Customs Authority'
                 : 'Nigeria Customs';
  return [
    { name:'Commercial Invoice',    docType:'Commercial Invoice',   issuer:m.creatorOrgName, suffix:'INV' },
    { name:'Packing List',          docType:'Packing List',          issuer:m.creatorOrgName, suffix:'PL'  },
    { name:'Bill of Lading',        docType:'Bill of Lading',        issuer:'NordShip Line S.A.', suffix:'BL' },
    { name:'Certificate of Origin', docType:'Certificate of Origin', issuer:coIssuer,         suffix:'CO'  },
    { name:'Export Declaration',    docType:'Export Declaration',    issuer:edIssuer,          suffix:'ED'  },
  ];
}

function seedConsignments() {
  if (store.consignments.length > 0) return;
  const list = NODE_ID === 'alpha' ? ALPHA_CONSIGNMENTS : BETA_CONSIGNMENTS;

  for (const m of list) {
    const cId = `seed-${m.ucr}`;
    const createdAt = m.shipDate + 'T08:00:00.000Z';
    const docs = docsForConsignment(m);
    const c = {
      id: cId, ucr: m.ucr,
      commercialInvoiceNo: m.invoiceRef, exportDeclarationNo: m.declRef,
      description: m.product, product: m.product,
      hsCode: m.hsCode, quantity: m.quantity, unit: '',
      totalValue: m.totalValue, currency: m.currency,
      exporter: m.exporter, importer: m.importer,
      fromCountry: m.fromCountry, toCountry: m.toCountry,
      originPort: m.originPort, destinationPort: m.destinationPort,
      vessel: m.vessel, shipDate: m.shipDate, incoterms: m.incoterms,
      errorType: m.errorType || null, errorDescription: m.errorDescription || null,
      creatorOrgId: m.creatorOrgId, creatorOrgName: m.creatorOrgName,
      createdAt, documentCount: docs.length, status: m.status,
    };
    store.consignments.push(c);
    store.permissions[cId] = { [m.creatorOrgId]: 'owner' };
    store.financePermissions[cId] = { [m.creatorOrgId]: 'owner' };
    seedLog('document', 'Consignment Anchored', m.exporter,
      `Digital twin created: ${m.ucr} — ${m.product}. Anchored on the ledger.`, createdAt);

    for (const d of docs) {
      const ref = d.suffix === 'INV' ? m.invoiceRef
                : d.suffix === 'ED'  ? m.declRef
                : `${d.suffix}-${m.ucr.split('-').pop()}`;
      const xmlContent = (d.suffix === 'BL' || d.suffix === 'ED') ? makeSeedXml(d.docType, m, ref) : null;
      const fileBase64 = xmlContent
        ? Buffer.from(xmlContent, 'utf8').toString('base64')
        : makeSeedPdf(d.docType, ref, d.issuer, m.ucr, m.shipDate, m.exporter, m.importer, m.fromCountry, m.toCountry);
      const filename = xmlContent ? `${ref}.xml` : `${ref}.pdf`;
      const format   = xmlContent ? 'XML' : 'PDF';
      const fileSize = Buffer.from(fileBase64, 'base64').length;
      store.documents.push({
        id: `${cId}-${d.suffix}`, consignmentId: cId,
        title: d.name, docType: d.docType,
        filename, fileSize, fileBase64,
        hash: genHash(),
        creatorOrgId: m.creatorOrgId, creatorOrgName: m.creatorOrgName,
        timestamp: createdAt, reference: ref,
        format, issuer: d.issuer,
      });
      seedLog('document', 'Document Anchored', m.exporter,
        `"${d.name}" anchored to ${m.ucr}. Issued by ${d.issuer}.`, createdAt);
    }
  }
  // Journey 1C: Strip documents for informal trader (org11) — story is the absence of records
  store.documents = store.documents.filter(d => {
    const c = store.consignments.find(c => c.id === d.consignmentId);
    return c?.creatorOrgId !== 'org11';
  });
  store.consignments.forEach(c => { if (c.creatorOrgId === 'org11') c.documentCount = 0; });

  // Journey 4: Egypt Customs (org14) gets viewer access to Kilimanjaro coffee consignments
  ['UCR-2026-TZ-EG-02001', 'UCR-2026-TZ-EG-02002'].forEach(ucr => {
    const c = store.consignments.find(x => x.ucr === ucr);
    if (c) store.permissions[c.id]['org14'] = 'viewer';
  });

  // Journey 2: StanbicBank (org12) gets viewer access to LagosThreads consignments
  ['UCR-2026-NG-KE-01001', 'UCR-2026-NG-KE-01002', 'UCR-2026-NG-KE-01003'].forEach(ucr => {
    const c = store.consignments.find(x => x.ucr === ucr);
    if (c) store.permissions[c.id]['org12'] = 'viewer';
  });

  saveTangleLog();
  console.log(`[${NODE_NAME}] Seeded ${store.consignments.length} consignments`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const publicDir = path.join(__dirname, 'public');
if (existsSync(publicDir)) app.use(express.static(publicDir));

// Auth
app.post('/api/login', (req, res) => {
  const org = store.orgs.find(o => o.username === req.body.username && o.password === req.body.password);
  if (!org) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ org: { ...org, password: undefined }, nodeId: NODE_ID, nodeName: NODE_NAME, nodeIp: NODE_IP });
});

// Node info
app.get('/api/node', (req, res) => res.json({ nodeId: NODE_ID, nodeName: NODE_NAME, nodeIp: NODE_IP, nodeCountry: NODE_COUNTRY, wsPort: WS_PORT, peerConnected: store.peerConnected, orgCount: store.orgs.length, peerOrgCount: store.peerOrgs.length }));

app.get('/api/node/discover', (req, res) => {
  if (!PEER_URL) return res.json([]);
  const peerWsPort = parseInt(PEER_URL.match(/:(\d+)/)?.[1] || '0');
  const peerHttpPort = peerWsPort - 10;
  res.json([{ id: NODE_ID === 'alpha' ? 'beta' : 'alpha', name: NODE_ID === 'alpha' ? 'Node Beta' : 'Node Alpha', ip: `127.0.0.1:${peerHttpPort}`, wsUrl: PEER_URL, connected: store.peerConnected }]);
});

app.post('/api/node/connect', (req, res) => {
  if (store.peerConnected) return res.json({ success: true, message: 'Already connected' });
  connectToPeer();
  setTimeout(() => res.json({ success: store.peerConnected, message: store.peerConnected ? 'Connected — organisations now discoverable' : 'Connection attempt sent. Peer may not be online yet.' }), 2500);
});
app.post('/api/node/disconnect', (req, res) => {
  if (peerWs) { peerWs.close(); peerWs = null; }
  store.peerConnected = false; store.peerOrgs = [];
  broadcastToClients({ type: 'PEER_STATUS', connected: false, peerOrgs: [] });
  addLog('network', 'Peer Disconnected', 'System', 'P2P connection terminated. Peer organisations no longer visible.');
  res.json({ success: true });
});

// Orgs
app.get('/api/orgs', (req, res) => res.json(store.orgs.map(o => ({ ...o, password: undefined }))));
app.get('/api/orgs/all', (req, res) => {
  const local = store.orgs.map(o => ({ ...o, password: undefined, nodeId: NODE_ID, nodeName: NODE_NAME, local: true }));
  const remote = store.peerConnected ? store.peerOrgs.map(o => ({ ...o, local: false })) : [];
  res.json([...local, ...remote]);
});
app.put('/api/orgs/:id', (req, res) => {
  store.orgs = store.orgs.map(o => o.id === req.params.id ? { ...o, name: req.body.name ?? o.name, role: req.body.role ?? o.role } : o);
  const org = store.orgs.find(o => o.id === req.params.id);
  if (org) syncOrgsToPeer();
  res.json({ ...org, password: undefined });
});

// ── National registry data for confirm-verification simulation ──
const REGISTRY_DATA = {
  org1:  { orgName: 'Nortex Minerals S.A.',              regNumber: 'RC-CASA-2018-042891', status: 'Active', registeredDate: '12 February 2018', address: 'Zone Industrielle Ain Sebaâ, Casablanca 20250, Morocco',                    industry: 'Mining & Minerals Processing',                              directors: ['Youssef El Mansouri', 'Fatima Benali'],              registry: 'OMPIC – Office Marocain de la Propriété Industrielle et Commerciale' },
  org2:  { orgName: 'Morocco Customs',                   regNumber: 'GOV-MA-CUSTOMS-001',  status: 'Active', registeredDate: '01 January 1956',  address: 'Direction Générale des Douanes, Av. Abdelkrim Al Khattabi, Rabat, Morocco', industry: 'Government — Customs & Trade Regulation',                   directors: ['Director-General of Customs'],                       registry: 'Ministry of Economy and Finance, Morocco' },
  org3:  { orgName: 'Nigeria Customs Service',           regNumber: 'GOV-NG-CUSTOMS-001',  status: 'Active', registeredDate: '03 March 1891',    address: 'NCS Headquarters, Old Secretariat Annex, Ikoyi, Lagos, Nigeria',           industry: 'Government — Customs & Border Control',                    directors: ['Comptroller-General of Customs'],                    registry: 'Federal Government of Nigeria — Customs & Excise Management Act' },
  org4:  { orgName: 'Kenya Revenue Authority',           regNumber: 'GOV-KE-KRA-001',      status: 'Active', registeredDate: '01 July 1995',     address: 'Times Tower Building, Haile Selassie Avenue, Nairobi, Kenya',              industry: 'Government — Revenue & Customs Authority',                 directors: ['Commissioner-General KRA'],                          registry: 'Parliament of Kenya — KRA Act Cap. 469' },
  org5:  { orgName: 'AgriInput Supplies Ltd',            regNumber: 'RC-2021-NG-061293',   status: 'Active', registeredDate: '19 April 2021',    address: '18 Ozumba Mbadiwe Avenue, Victoria Island, Lagos, Nigeria',                industry: 'Agricultural Inputs — Fertiliser Import & Distribution',   directors: ['Emeka Okafor', 'Ngozi Adeyemi'],                     registry: 'Nigeria National Registry' },
  org6:  { orgName: 'HorizonTrade International',        regNumber: 'RC-2017-NG-142567',   status: 'Active', registeredDate: '07 August 2017',   address: '5 Customs Street, Lagos Island, Lagos, Nigeria',                           industry: 'Import & Export — Agricultural Commodities',               directors: ['Taiwo Akinwale', 'Blessing Eze'],                    registry: 'Nigeria National Registry' },
  org7:  { orgName: 'Financier 1',                       regNumber: 'RC-2020-NG-071182',   status: 'Active', registeredDate: '14 January 2020',  address: '21 Broad Street, Lagos Island, Lagos, Nigeria',                            industry: 'Trade Finance & Banking',                                  directors: ['Adaeze Okonkwo', 'Babatunde Fashola'],               registry: 'Nigeria National Registry' },
  org8:  { orgName: 'Financier 2',                       regNumber: 'RC-2020-NG-071183',   status: 'Active', registeredDate: '14 January 2020',  address: '21 Broad Street, Lagos Island, Lagos, Nigeria',                            industry: 'Trade Finance & Banking',                                  directors: ['Chidi Nwosu', 'Amaka Obi'],                          registry: 'Nigeria National Registry' },
  org9:  { orgName: 'Vestline Apparel Ltd',              regNumber: 'RC-2019-NG-047821',   status: 'Active', registeredDate: '14 March 2019',    address: '42 Broad Street, Lagos Island, Lagos, Nigeria',                            industry: 'Textile & Garment Manufacturing',                          directors: ['Chidi Okafor', 'Amina Bello'],                       registry: 'Nigeria National Registry' },
  org10: { orgName: 'Highland Growers Cooperative',      regNumber: 'REG-TZ-2017-089234',  status: 'Active', registeredDate: '08 June 2017',     address: 'Moshi District, Kilimanjaro Region, Tanzania',                             industry: 'Agricultural Export — Coffee',                             directors: ['James Mollel', 'Grace Swai', 'Peter Kimaro'],        registry: 'BRELA – Tanzania Business Registrations & Licensing Agency' },
  org12: { orgName: 'Meridian Bank Trade Finance',       regNumber: 'RC-2008-NG-189034',   status: 'Active', registeredDate: '03 November 2008', address: 'Plot 4, Adeola Odeku Street, Victoria Island, Lagos, Nigeria',              industry: 'Banking & Trade Finance',                                  directors: ['Olumide Fawole', 'Chinwe Eze'],                      registry: 'Nigeria National Registry' },
  org13: { orgName: 'TransRoute Logistics Ltd',          regNumber: 'RC-2015-NG-293847',   status: 'Active', registeredDate: '22 September 2015',address: 'Freight Terminal Road, Tin Can Island, Apapa, Lagos, Nigeria',              industry: 'Logistics, Freight & Customs Brokerage',                   directors: ['Kunle Adewale', 'Sule Ibrahim'],                     registry: 'Nigeria National Registry' },
  org14: { orgName: 'Egypt Customs Authority',           regNumber: 'GOV-EG-CUSTOMS-001',  status: 'Active', registeredDate: '01 January 1964',  address: 'Egyptian Customs Authority, Port Said Road, Alexandria, Egypt',             industry: 'Government — Customs & Border Authority',                  directors: ['Chairperson, Egyptian Customs Authority'],           registry: 'General Authority for Investment (GAFI), Egypt' },
  org15: { orgName: 'Central Finance Regulator',         regNumber: 'GOV-NG-CFR-001',      status: 'Active', registeredDate: '01 July 1958',     address: 'Central Business District, Abuja, Nigeria',                                industry: 'Government — Financial Regulation',                        directors: ['Governor, Central Finance Regulator'],               registry: 'Federal Government of Nigeria' },
  org16: { orgName: 'Metro Consumer Goods Ltd',          regNumber: 'CPR-2018-KE-094831',  status: 'Active', registeredDate: '17 March 2018',    address: 'Westlands Commercial Zone, Nairobi, Kenya',                                industry: 'Fast Moving Consumer Goods (FMCG) — Import & Distribution',directors: ['David Kamau', 'Wanjiku Githii'],                      registry: 'Registrar of Companies, Kenya' },
};

app.get('/api/orgs/:id/confirm-verification', (req, res) => {
  const data = REGISTRY_DATA[req.params.id];
  if (!data) return res.status(404).json({ error: 'No registry data found for this organisation' });
  // Simulate a slight delay for realism
  res.json({ confirmed: true, ...data, confirmedAt: new Date().toISOString() });
});

// DID registration
function getAttestingAuthority(org) {
  if (org.role?.includes('Morocco'))   return 'Morocco Customs';
  if (org.role?.includes('Nigeria'))   return 'Nigeria Customs';
  if (org.role?.includes('Kenya'))     return 'Kenya Revenue Authority';
  if (org.role?.includes('Tanzania'))  return 'Tanzania Revenue Authority';
  if (org.role?.includes('Egypt'))     return 'Egypt Customs Authority';
  return 'National Registry';
}

app.post('/api/orgs/:id/register', (req, res) => {
  const v = validateCredential(req.body.regNumber);
  if (!v.valid) return res.status(400).json({ error: v.reason, failStep: v.failStep });
  const did = genDID();
  const org0 = store.orgs.find(o => o.id === req.params.id);
  if (!org0) return res.status(404).json({ error: 'Org not found' });
  const attestedBy = getAttestingAuthority(org0);
  store.orgs = store.orgs.map(o => o.id === req.params.id ? { ...o, regNumber: v.formatted, did, verified: true, attestedBy } : o);
  const org = store.orgs.find(o => o.id === req.params.id);
  addLog('identity', 'DID Issued', org.name, `DID created for ${org.name} (${v.type}: ${v.formatted}). Attested by ${attestedBy}. Anchored on the ledger.`, { did, attestedBy });
  syncOrgsToPeer();
  res.json({ ...org, password: undefined });
});
app.post('/api/orgs/validate-credential', (req, res) => {
  const v = validateCredential(req.body.regNumber);
  // attach attestedBy based on orgId if provided
  if (v.valid && req.body.orgId) {
    const org = store.orgs.find(o => o.id === req.body.orgId);
    if (org) v.attestedBy = getAttestingAuthority(org);
  }
  res.json(v);
});

// Consignments
app.get('/api/consignments', (req, res) => {
  const { orgId } = req.query;
  res.json(store.consignments.filter(c => {
    const p = store.permissions[c.id] || {};
    return p[orgId] === 'owner' || p[orgId] === 'viewer';
  }));
});
app.post('/api/consignments', (req, res) => {
  const { ucr, commercialInvoiceNo, exportDeclarationNo, creatorOrgId, description } = req.body;
  const org = store.orgs.find(o => o.id === creatorOrgId);
  if (!org) return res.status(400).json({ error: 'Org not found' });
  const c = { id: genId(), ucr, commercialInvoiceNo: commercialInvoiceNo || '', exportDeclarationNo: exportDeclarationNo || '', description: description || '', creatorOrgId, creatorOrgName: org.name, createdAt: now(), documentCount: 0, status: 'Draft' };
  store.consignments.push(c);
  store.permissions[c.id] = { [creatorOrgId]: 'owner' };
  addLog('document', 'Consignment Created', org.name, `Digital twin created: ${ucr}. Anchored on the ledger.`);
  res.json(c);
});

// Documents
app.get('/api/documents', (req, res) => {
  const { orgId, consignmentId } = req.query;
  let docs = store.documents;
  if (consignmentId) docs = docs.filter(d => d.consignmentId === consignmentId);
  if (orgId) {
    docs = docs.filter(d => {
      const cp = store.permissions[d.consignmentId] || {};
      if (cp[orgId] === 'owner' || d.creatorOrgId === orgId) return true;
      const dp = store.docPermissions[d.id] || {};
      if (dp[orgId]) return true;
      const hasDLP = store.documents.filter(dd => dd.consignmentId === d.consignmentId).some(dd => Object.keys(store.docPermissions[dd.id] || {}).length > 0);
      if (hasDLP) return false;
      return cp[orgId] === 'viewer';
    });
  }
  res.json(docs.map(d => ({ ...d, fileBase64: undefined })));
});
app.post('/api/documents', upload.single('file'), (req, res) => {
  const { consignmentId, title, docType, creatorOrgId } = req.body;
  const org = store.orgs.find(o => o.id === creatorOrgId);
  const consignment = store.consignments.find(c => c.id === consignmentId);
  if (!org || !consignment) return res.status(400).json({ error: 'Not found' });
  let fileBase64 = null, filename = null, fileSize = 0;
  if (req.file) { fileBase64 = req.file.buffer.toString('base64'); filename = req.file.originalname; fileSize = req.file.size; }
  const doc = { id: genId(), consignmentId, title, docType: docType || 'General', filename, fileBase64, fileSize, hash: genHash(), creatorOrgId, creatorOrgName: org.name, timestamp: now() };
  store.documents.push(doc);
  consignment.documentCount = store.documents.filter(d => d.consignmentId === consignmentId).length;
  addLog('document', 'Document Anchored', org.name, `"${title}" anchored to ${consignment.ucr}. Anchored on the ledger.`);
  res.json({ ...doc, fileBase64: undefined });
});

app.get('/api/documents/:id/download', (req, res) => {
  const doc = store.documents.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (!doc.fileBase64) return res.status(404).json({ error: 'File not stored — upload a real file to enable download' });
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
  res.send(Buffer.from(doc.fileBase64, 'base64'));
});

app.get('/api/documents/:id/xml', (req, res) => {
  const doc = store.documents.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.fileBase64 && doc.filename?.endsWith('.xml')) {
    return res.json({ content: Buffer.from(doc.fileBase64, 'base64').toString('utf-8'), docType: doc.docType });
  }
  res.status(400).json({ error: 'Not an XML file or not available' });
});

// Permissions
app.get('/api/permissions/:consignmentId', (req, res) => res.json(store.permissions[req.params.consignmentId] || {}));
app.post('/api/permissions/share', (req, res) => {
  const { consignmentId, recipientOrgId, recipientOrgName, sharerOrgName, shareMode, selectedDocIds } = req.body;
  const consignment = store.consignments.find(c => c.id === consignmentId);
  if (!consignment) return res.status(400).json({ error: 'Not found' });
  if (!store.permissions[consignmentId]) store.permissions[consignmentId] = {};
  store.permissions[consignmentId][recipientOrgId] = 'viewer';
  const allDocs = store.documents.filter(d => d.consignmentId === consignmentId);
  if (shareMode === 'selective' && selectedDocIds?.length > 0) {
    for (const docId of selectedDocIds) { if (!store.docPermissions[docId]) store.docPermissions[docId] = {}; store.docPermissions[docId][recipientOrgId] = 'viewer'; }
    const names = allDocs.filter(d => selectedDocIds.includes(d.id)).map(d => d.title).join(', ');
    addLog('permission', 'Selective Share', sharerOrgName, `${consignment.ucr}: shared ${selectedDocIds.length}/${allDocs.length} docs with ${recipientOrgName}. [${names}]`);
  } else {
    for (const doc of allDocs) { if (!store.docPermissions[doc.id]) store.docPermissions[doc.id] = {}; store.docPermissions[doc.id][recipientOrgId] = 'viewer'; }
    addLog('permission', 'Full Share', sharerOrgName, `"${consignment.ucr}" — all ${allDocs.length} docs shared with ${recipientOrgName}. Encrypted via TLIP.`);
  }
  const isPeer = store.peerOrgs.some(o => o.id === recipientOrgId);
  if (isPeer && peerWs?.readyState === WebSocket.OPEN) {
    const docsToSend = shareMode === 'selective' && selectedDocIds?.length ? allDocs.filter(d => selectedDocIds.includes(d.id)) : allDocs;
    peerWs.send(JSON.stringify({ type: 'SHARE_CONSIGNMENT', consignment, documents: docsToSend.map(d => ({ ...d, fileBase64: undefined })), permissions: store.permissions[consignmentId], docPermissions: Object.fromEntries(docsToSend.map(d => [d.id, store.docPermissions[d.id] || {}])) }));
  }
  res.json({ success: true });
});
app.post('/api/permissions/revoke', (req, res) => {
  const { consignmentId, recipientOrgId, recipientOrgName, revokerOrgName } = req.body;
  const c = store.consignments.find(c => c.id === consignmentId);
  if (store.permissions[consignmentId]) delete store.permissions[consignmentId][recipientOrgId];
  store.documents.filter(d => d.consignmentId === consignmentId).forEach(d => { if (store.docPermissions[d.id]) delete store.docPermissions[d.id][recipientOrgId]; });
  addLog('permission', 'Access Revoked', revokerOrgName, `Access to "${c?.ucr}" revoked for ${recipientOrgName}.`);
  res.json({ success: true });
});

// ── Finance helpers ──────────────────────────────────────────────────────────
function hasFinanceAccess(consignmentId, orgId) {
  const fp = store.financePermissions[consignmentId] || {};
  return fp[orgId] === 'owner' || fp[orgId] === 'viewer';
}
function financeAccessibleIds(orgId) {
  return Object.keys(store.financePermissions).filter(cId => hasFinanceAccess(cId, orgId));
}

// Finance Permissions
app.get('/api/finance-permissions/:consignmentId', (req, res) =>
  res.json(store.financePermissions[req.params.consignmentId] || {}));
app.post('/api/finance-permissions/share', (req, res) => {
  const { consignmentId, targetOrgId, role, sharerOrgName, targetOrgName } = req.body;
  if (!store.financePermissions[consignmentId]) store.financePermissions[consignmentId] = {};
  store.financePermissions[consignmentId][targetOrgId] = role || 'viewer';
  const c = store.consignments.find(c => c.id === consignmentId);
  addLog('finance', 'Finance Access Granted', sharerOrgName,
    `Finance data for ${c?.ucr} shared with ${targetOrgName}.`);
  res.json({ success: true });
});

// Payments
app.get('/api/payments', (req, res) => {
  const { orgId, consignmentId } = req.query;
  if (consignmentId) {
    if (!hasFinanceAccess(consignmentId, orgId)) return res.json([]);
    return res.json(store.payments.filter(p => p.consignmentId === consignmentId));
  }
  const ids = financeAccessibleIds(orgId);
  res.json(store.payments.filter(p => ids.includes(p.consignmentId)));
});
app.post('/api/payments', (req, res) => {
  const { consignmentId, invoiceRef, amount, currency, dueDate, paymentMethod, payorOrgId, payeeOrgId, notes, creatorOrgId } = req.body;
  const fp = store.financePermissions[consignmentId] || {};
  if (fp[creatorOrgId] !== 'owner') return res.status(403).json({ error: 'Finance owner access required' });
  const c = store.consignments.find(c => c.id === consignmentId);
  const payment = { id: genId(), consignmentId, ucr: c?.ucr || '', invoiceRef, amount: Number(amount), currency,
    dueDate, status: 'Unpaid', paidAmount: 0, paymentMethod: paymentMethod || 'Bank Transfer',
    payorOrgId, payeeOrgId, creatorOrgId, notes: notes || '', createdAt: now(), updatedAt: now() };
  store.payments.push(payment);
  const org = store.orgs.find(o => o.id === creatorOrgId);
  addLog('payment', 'Payment Record Created', org?.name || creatorOrgId,
    `Payment of ${currency} ${Number(amount).toLocaleString()} created for ${c?.ucr}. Invoice: ${invoiceRef}. Due: ${dueDate}.`);
  res.json(payment);
});
app.put('/api/payments/:id/status', (req, res) => {
  const { status, paidAmount, orgId, orgName } = req.body;
  const payment = store.payments.find(p => p.id === req.params.id);
  if (!payment) return res.status(404).json({ error: 'Not found' });
  const prev = payment.status;
  payment.status = status;
  if (paidAmount !== undefined) payment.paidAmount = Number(paidAmount);
  payment.updatedAt = now();
  addLog('payment', `Payment ${status}`, orgName || orgId,
    `${payment.ucr} (${payment.invoiceRef}): ${prev} → ${status}. Confirmed: ${payment.currency} ${payment.paidAmount.toLocaleString()}.`);
  res.json(payment);
});

// Letter of Credit
app.get('/api/lc', (req, res) => {
  const { orgId, consignmentId } = req.query;
  if (consignmentId) {
    if (!hasFinanceAccess(consignmentId, orgId)) return res.json([]);
    return res.json(store.letterOfCredits.filter(l => l.consignmentId === consignmentId));
  }
  const ids = financeAccessibleIds(orgId);
  res.json(store.letterOfCredits.filter(l => ids.includes(l.consignmentId)));
});
app.post('/api/lc', (req, res) => {
  const { consignmentId, issuingBank, advisingBank, applicant, amount, currency, expiryDate, creatorOrgId } = req.body;
  const fp = store.financePermissions[consignmentId] || {};
  if (fp[creatorOrgId] !== 'owner') return res.status(403).json({ error: 'Finance owner access required' });
  const c = store.consignments.find(c => c.id === consignmentId);
  const docs = store.documents.filter(d => d.consignmentId === consignmentId);
  const lcNumber = `LC-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const lc = { id: genId(), consignmentId, ucr: c?.ucr || '', lcNumber, issuingBank, advisingBank,
    beneficiary: c?.exporter || '', applicant: applicant || c?.importer || '',
    amount: Number(amount), currency, expiryDate, status: 'Draft',
    documentCompliance: docs.map(d => ({ docType: d.title, required: true, submitted: true, compliant: null })),
    creatorOrgId, createdAt: now() };
  store.letterOfCredits.push(lc);
  const org = store.orgs.find(o => o.id === creatorOrgId);
  addLog('finance', 'LC Created', org?.name || creatorOrgId,
    `LC ${lcNumber} created for ${c?.ucr}. Amount: ${currency} ${Number(amount).toLocaleString()}. Bank: ${issuingBank}.`);
  res.json(lc);
});
app.put('/api/lc/:id/status', (req, res) => {
  const { status, orgId, orgName, docType, compliant } = req.body;
  const lc = store.letterOfCredits.find(l => l.id === req.params.id);
  if (!lc) return res.status(404).json({ error: 'Not found' });
  if (docType !== undefined) {
    const doc = lc.documentCompliance.find(d => d.docType === docType);
    if (doc) doc.compliant = compliant;
    return res.json(lc);
  }
  const prev = lc.status;
  lc.status = status;
  addLog('finance', `LC ${status}`, orgName || orgId,
    `LC ${lc.lcNumber} for ${lc.ucr}: ${prev} → ${status}.`);
  res.json(lc);
});

// Smart Contracts
app.get('/api/contracts', (req, res) => {
  const { orgId, consignmentId } = req.query;
  if (consignmentId) {
    if (!hasFinanceAccess(consignmentId, orgId)) return res.json([]);
    return res.json(store.smartContracts.filter(c => c.consignmentId === consignmentId));
  }
  const ids = financeAccessibleIds(orgId);
  res.json(store.smartContracts.filter(c => ids.includes(c.consignmentId)));
});
app.post('/api/contracts', (req, res) => {
  const { consignmentId, amount, currency, conditions, autoRelease, payorOrgId, payeeOrgId, creatorOrgId } = req.body;
  const fp = store.financePermissions[consignmentId] || {};
  if (fp[creatorOrgId] !== 'owner') return res.status(403).json({ error: 'Finance owner access required' });
  const c = store.consignments.find(c => c.id === consignmentId);
  const contractHash = genHash();
  const contractRef = `SC-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const contract = { id: genId(), consignmentId, ucr: c?.ucr || '', contractRef, contractHash,
    payorOrgId, payeeOrgId, amount: Number(amount), currency,
    conditions: (conditions || []).map((cond, i) => ({ id: `cond-${i}`, description: cond.description, docType: cond.docType || null, met: false, metAt: null })),
    status: 'Active', autoRelease: autoRelease !== false, creatorOrgId, createdAt: now(), settledAt: null };
  store.smartContracts.push(contract);
  const org = store.orgs.find(o => o.id === creatorOrgId);
  addLog('finance', 'Smart Contract Deployed', org?.name || creatorOrgId,
    `Contract ${contractRef} deployed for ${c?.ucr}. ${contract.conditions.length} release conditions. Hash: ${contractHash}.`);
  res.json(contract);
});
app.put('/api/contracts/:id/condition/:condId', (req, res) => {
  const { orgId, orgName } = req.body;
  const contract = store.smartContracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Not found' });
  const cond = contract.conditions.find(c => c.id === req.params.condId);
  if (!cond) return res.status(404).json({ error: 'Condition not found' });
  cond.met = true; cond.metAt = now();
  addLog('finance', 'Condition Verified', orgName || orgId,
    `"${cond.description}" verified on contract ${contract.contractRef} (${contract.ucr}).`);
  const allMet = contract.conditions.every(c => c.met);
  if (allMet && contract.status === 'Active') {
    contract.status = 'Conditions Met';
    addLog('finance', 'All Conditions Met', orgName || orgId,
      `All ${contract.conditions.length} conditions satisfied on ${contract.contractRef}. ${contract.autoRelease ? 'Auto-releasing...' : 'Awaiting release.'}`);
    if (contract.autoRelease) {
      contract.status = 'Released'; contract.settledAt = now();
      addLog('finance', 'Payment Auto-Released', orgName || orgId,
        `Contract ${contract.contractRef} executed. ${contract.currency} ${contract.amount.toLocaleString()} released. Hash: ${contract.contractHash}.`);
    }
  }
  res.json(contract);
});
app.put('/api/contracts/:id/status', (req, res) => {
  const { status, orgId, orgName } = req.body;
  const contract = store.smartContracts.find(c => c.id === req.params.id);
  if (!contract) return res.status(404).json({ error: 'Not found' });
  const prev = contract.status;
  contract.status = status;
  if (status === 'Settled' || status === 'Released') contract.settledAt = now();
  addLog('finance', `Contract ${status}`, orgName || orgId,
    `Contract ${contract.contractRef} (${contract.ucr}): ${prev} → ${status}. Hash: ${contract.contractHash}.`);
  res.json(contract);
});

// Tangle
app.get('/api/tangle', (req, res) => res.json(store.tangleLog));
app.get('/api/peer/orgs', (req, res) => {
  if (!store.peerConnected) return res.json([]);
  let orgs = store.peerOrgs;
  if (req.query.q) orgs = orgs.filter(o => o.name.toLowerCase().includes(req.query.q.toLowerCase()));
  res.json(orgs);
});
app.get('*', (req, res) => { const f = path.join(publicDir, 'index.html'); existsSync(f) ? res.sendFile(f) : res.status(404).json({ error: 'Build first' }); });

// ── WebSocket + P2P (disabled on Vercel — serverless can't hold sockets) ──
const IS_VERCEL = !!process.env.VERCEL;
const httpServer = http.createServer(app);
const clients = new Set();

function broadcastToClients(msg) {
  if (IS_VERCEL) return; // no persistent connections on serverless
  const d = JSON.stringify(msg);
  clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(d); });
}

let peerWs = null;
function connectToPeer() {}   // no-op stub (filled below if not Vercel)
function syncOrgsToPeer() {}  // no-op stub

if (!IS_VERCEL) {
  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/peer') { handlePeerIn(ws); } else { clients.add(ws); ws.on('close', () => clients.delete(ws)); ws.send(JSON.stringify({ type: 'NODE_INFO', nodeId: NODE_ID, nodeName: NODE_NAME })); }
  });

  // ── P2P ──
  connectToPeer = function() {
    if (!PEER_URL || peerWs?.readyState === WebSocket.OPEN) return;
    try {
      peerWs = new WebSocket(PEER_URL + '/peer');
      peerWs.on('open', () => {
        store.peerConnected = true;
        peerWs.send(JSON.stringify({ type: 'HANDSHAKE', nodeId: NODE_ID, nodeName: NODE_NAME, nodeIp: NODE_IP, nodeCountry: NODE_COUNTRY, orgs: store.orgs.map(o => ({ id: o.id, name: o.name, role: o.role, did: o.did, verified: o.verified, attestedBy: o.attestedBy, regNumber: o.regNumber, nodeId: NODE_ID, nodeName: NODE_NAME })) }));
        addLog('network', 'Peer Connected', 'System', `P2P handshake completed with peer at ${PEER_URL}. Organisations now discoverable.`);
        broadcastToClients({ type: 'PEER_STATUS', connected: true });
      });
      peerWs.on('message', d => handlePeerMsg(JSON.parse(d.toString())));
      peerWs.on('close', () => { store.peerConnected = false; store.peerOrgs = []; broadcastToClients({ type: 'PEER_STATUS', connected: false, peerOrgs: [] }); });
      peerWs.on('error', () => {});
    } catch (e) {}
  };

  syncOrgsToPeer = function() { if (peerWs?.readyState === WebSocket.OPEN) peerWs.send(JSON.stringify({ type: 'ORG_UPDATE', orgs: store.orgs.map(o => ({ id: o.id, name: o.name, role: o.role, did: o.did, verified: o.verified, nodeId: NODE_ID, nodeName: NODE_NAME })) })); };
}

function handlePeerIn(ws) {
  ws.on('message', d => { const m = JSON.parse(d.toString()); if (m.type === 'HANDSHAKE') { store.peerOrgs = m.orgs || []; store.peerConnected = true; broadcastToClients({ type: 'PEER_STATUS', connected: true, peerOrgs: store.peerOrgs, peerNodeCountry: m.nodeCountry || null }); ws.send(JSON.stringify({ type: 'ORG_DIRECTORY', orgs: store.orgs.map(o => ({ id: o.id, name: o.name, role: o.role, did: o.did, verified: o.verified, attestedBy: o.attestedBy, regNumber: o.regNumber, nodeId: NODE_ID, nodeName: NODE_NAME })) })); addLog('network', 'Peer Connected', 'System', 'Inbound P2P connection accepted. Peer orgs now discoverable.'); } else handlePeerMsg(m); });
  ws.on('close', () => { store.peerConnected = false; store.peerOrgs = []; broadcastToClients({ type: 'PEER_STATUS', connected: false, peerOrgs: [] }); });
}
function handlePeerMsg(m) {
  switch (m.type) {
    case 'HANDSHAKE': store.peerOrgs = m.orgs || []; store.peerConnected = true; broadcastToClients({ type: 'PEER_STATUS', connected: true, peerOrgs: store.peerOrgs, peerNodeCountry: m.nodeCountry || null }); break;
    case 'ORG_DIRECTORY': case 'ORG_UPDATE': store.peerOrgs = m.orgs || []; broadcastToClients({ type: 'PEER_ORGS', peerOrgs: store.peerOrgs }); break;
    case 'TANGLE_ENTRY': if (!store.tangleLog.some(e => e.id === m.entry.id)) { store.tangleLog.unshift(m.entry); broadcastToClients({ type: 'TANGLE_UPDATE', log: store.tangleLog }); } break;
    case 'SHARE_CONSIGNMENT': {
      const { consignment, documents, permissions, docPermissions } = m;
      if (!store.consignments.some(c => c.id === consignment.id)) store.consignments.push(consignment);
      for (const doc of documents) { if (!store.documents.some(d => d.id === doc.id)) store.documents.push(doc); }
      if (permissions) store.permissions[consignment.id] = { ...store.permissions[consignment.id], ...permissions };
      if (docPermissions) { for (const [did, p] of Object.entries(docPermissions)) { store.docPermissions[did] = { ...store.docPermissions[did], ...p }; } }
      broadcastToClients({ type: 'DATA_SYNC' }); break;
    }
  }
}

function seedFinanceData() {
  if (NODE_ID !== 'alpha') return;
  // Only seed once
  if (store.payments.length > 0 || store.letterOfCredits.length > 0 || store.smartContracts.length > 0) return;

  // Pick two MA-NG consignments to showcase finance
  const c1 = store.consignments.find(c => c.ucr === 'UCR-2026-MA-NG-00101');
  const c2 = store.consignments.find(c => c.ucr === 'UCR-2026-MA-NG-00102');
  if (!c1 || !c2) return;

  const atlas = 'org1';
  const attijari = 'org7';
  const accessBank = 'org8';
  const ts1 = '2026-02-18T09:00:00.000Z';
  const ts2 = '2026-02-20T11:30:00.000Z';

  // ── Finance permissions: grant banks viewer access ──
  store.financePermissions[c1.id][attijari]  = 'viewer';
  store.financePermissions[c1.id][accessBank] = 'viewer';
  store.financePermissions[c2.id][attijari]  = 'viewer';
  store.financePermissions[c2.id][accessBank] = 'viewer';

  // ── Payments ──
  const pay1 = {
    id: genId(), consignmentId: c1.id, ucr: c1.ucr,
    invoiceRef: 'INV-APM-2026-0101', amount: 340000, currency: 'USD',
    dueDate: '2026-04-30', status: 'Partially Paid', paidAmount: 120000,
    paymentMethod: 'Letter of Credit',
    payorOrgId: 'org5', payeeOrgId: atlas, creatorOrgId: atlas,
    notes: 'First instalment received. Balance due on BL presentation.', createdAt: ts1, updatedAt: ts1,
  };
  const pay2 = {
    id: genId(), consignmentId: c2.id, ucr: c2.ucr,
    invoiceRef: 'INV-APM-2026-0102', amount: 288000, currency: 'EUR',
    dueDate: '2026-03-28', status: 'Overdue', paidAmount: 0,
    paymentMethod: 'Open Account',
    payorOrgId: 'org6', payeeOrgId: atlas, creatorOrgId: atlas,
    notes: 'Payment overdue — buyer requested 15-day extension pending vessel arrival.', createdAt: ts2, updatedAt: ts2,
  };
  store.payments.push(pay1, pay2);

  // ── Letters of Credit ──
  const docs1 = store.documents.filter(d => d.consignmentId === c1.id);
  const docs2 = store.documents.filter(d => d.consignmentId === c2.id);
  const lc1 = {
    id: genId(), consignmentId: c1.id, ucr: c1.ucr,
    lcNumber: 'LC-2026-ATW-00101',
    issuingBank: 'Bank 1', advisingBank: 'Bank 2',
    beneficiary: 'Nortex Minerals S.A.', applicant: 'AgriInput Supplies Ltd',
    amount: 340000, currency: 'USD', expiryDate: '2026-07-31',
    status: 'Confirmed',
    documentCompliance: docs1.map((d, i) => ({ docType: d.title, required: true, submitted: true, compliant: i < 4 ? true : null })),
    creatorOrgId: atlas, createdAt: ts1,
  };
  const lc2 = {
    id: genId(), consignmentId: c2.id, ucr: c2.ucr,
    lcNumber: 'LC-2026-ATW-00102',
    issuingBank: 'Bank 1', advisingBank: 'Bank 2',
    beneficiary: 'Nortex Minerals S.A.', applicant: 'HorizonTrade International',
    amount: 288000, currency: 'EUR', expiryDate: '2026-06-30',
    status: 'Issued',
    documentCompliance: docs2.map(d => ({ docType: d.title, required: true, submitted: false, compliant: null })),
    creatorOrgId: atlas, createdAt: ts2,
  };
  store.letterOfCredits.push(lc1, lc2);

  // ── Smart Contracts ──
  const hash1 = genHash();
  const hash2 = genHash();
  const sc1 = {
    id: genId(), consignmentId: c1.id, ucr: c1.ucr,
    contractRef: 'SC-2026-ATW-0101', contractHash: hash1,
    payorOrgId: 'org5', payeeOrgId: atlas,
    amount: 340000, currency: 'USD',
    conditions: [
      { id: 'cond-0', description: 'Bill of Lading (eBL) verified and presented', docType: 'Bill of Lading (eBL)', met: true,  metAt: '2026-03-01T08:00:00.000Z' },
      { id: 'cond-1', description: 'Certificate of Origin (AfCFTA) confirmed',    docType: 'Certificate of Origin (AfCFTA)', met: true,  metAt: '2026-03-01T09:15:00.000Z' },
      { id: 'cond-2', description: 'Commercial Invoice approved by advising bank', docType: 'Commercial Invoice', met: false, metAt: null },
    ],
    status: 'Active', autoRelease: true, creatorOrgId: atlas,
    createdAt: ts1, settledAt: null,
  };
  const sc2 = {
    id: genId(), consignmentId: c2.id, ucr: c2.ucr,
    contractRef: 'SC-2026-ATW-0102', contractHash: hash2,
    payorOrgId: 'org6', payeeOrgId: atlas,
    amount: 288000, currency: 'EUR',
    conditions: [
      { id: 'cond-0', description: 'Goods delivered to Apapa Port — vessel confirmed', docType: 'Bill of Lading (eBL)', met: false, metAt: null },
      { id: 'cond-1', description: 'Export Declaration cleared by Nigeria Customs',     docType: 'Export Declaration',          met: false, metAt: null },
    ],
    status: 'Active', autoRelease: true, creatorOrgId: atlas,
    createdAt: ts2, settledAt: null,
  };
  store.smartContracts.push(sc1, sc2);

  // Seed tangle entries for all seeded finance records
  const seedTs = (action, actor, t, ts) => { if (!store.tangleLog.some(e => e.details && e.details.includes(t))) store.tangleLog.push({ id: genId(), timestamp: ts, hash: genHash(), type: 'finance', action, actor, details: t }); };
  seedTs('Payment Recorded',       'Nortex Minerals S.A.',    `Payment INV-APM-2026-0101 created for ${c1.ucr}. USD 340,000. Partially Paid.`, ts1);
  seedTs('Payment Recorded',       'Nortex Minerals S.A.',    `Payment INV-APM-2026-0102 created for ${c2.ucr}. EUR 288,000. Overdue.`, ts2);
  seedTs('Letter of Credit Issued','Atlas World Logistics',  `LC LC-2026-ATW-00101 issued for ${c1.ucr}. Amount: USD 340,000. Status: Confirmed.`, ts1);
  seedTs('Letter of Credit Issued','Atlas World Logistics',  `LC LC-2026-ATW-00102 issued for ${c2.ucr}. Amount: EUR 288,000. Status: Issued.`, ts2);
  seedTs('Smart Contract Deployed','Nortex Minerals S.A.',    `Contract SC-2026-ATW-0101 deployed for ${c1.ucr}. 3 release conditions. Hash: ${hash1}.`, ts1);
  seedTs('Smart Contract Deployed','Nortex Minerals S.A.',    `Contract SC-2026-ATW-0102 deployed for ${c2.ucr}. 2 release conditions. Hash: ${hash2}.`, ts2);

  // ── Journey 1A: LagosThreads — payments, LC, smart contract ──
  const ltC1 = store.consignments.find(c => c.ucr === 'UCR-2026-NG-KE-01001');
  const ltC2 = store.consignments.find(c => c.ucr === 'UCR-2026-NG-KE-01002');
  const ltC3 = store.consignments.find(c => c.ucr === 'UCR-2026-NG-KE-01003');
  if (ltC1 && ltC2 && ltC3) {
    const lt1Ts = '2026-01-15T10:00:00.000Z';
    const lt2Ts = '2026-02-10T09:30:00.000Z';
    // Finance permissions — StanbicBank (org12) views all three
    store.financePermissions[ltC1.id] = { 'org9': 'owner', 'org12': 'viewer' };
    store.financePermissions[ltC2.id] = { 'org9': 'owner', 'org12': 'viewer' };
    store.financePermissions[ltC3.id] = { 'org9': 'owner', 'org12': 'viewer' };
    // Payment 1 — delivered, but 43 days overdue (working capital story)
    const payLt1 = {
      id: genId(), consignmentId: ltC1.id, ucr: ltC1.ucr,
      invoiceRef: 'INV-2026-LTL-01001', amount: 58800, currency: 'USD',
      dueDate: '2026-01-30', status: 'Overdue', paidAmount: 0,
      paymentMethod: 'Open Account',
      payorOrgId: 'org9', payeeOrgId: 'org9', creatorOrgId: 'org9',
      notes: 'Payment 43 days overdue. Buyer citing cross-border identity verification delay — DID not recognised by Kenyan correspondent bank. Working capital severely strained.',
      createdAt: lt1Ts, updatedAt: lt1Ts,
    };
    // Payment 2 — in transit, awaiting LC (solution in progress)
    const payLt2 = {
      id: genId(), consignmentId: ltC2.id, ucr: ltC2.ucr,
      invoiceRef: 'INV-2026-LTL-01002', amount: 43200, currency: 'USD',
      dueDate: '2026-04-10', status: 'Unpaid', paidAmount: 0,
      paymentMethod: 'Letter of Credit',
      payorOrgId: 'org9', payeeOrgId: 'org9', creatorOrgId: 'org9',
      notes: 'Awaiting LC confirmation from Meridian Bank Trade Finance. Shipment in transit.',
      createdAt: lt2Ts, updatedAt: lt2Ts,
    };
    store.payments.push(payLt1, payLt2);
    // LC — StanbicBank as issuing bank (Journey 2 cross-link)
    const ltDocs2 = store.documents.filter(d => d.consignmentId === ltC2.id);
    const lcLt = {
      id: genId(), consignmentId: ltC2.id, ucr: ltC2.ucr,
      lcNumber: 'LC-2026-STB-01002',
      issuingBank: 'Meridian Bank Trade Finance', advisingBank: 'Kenya Commercial Bank',
      beneficiary: 'Vestline Apparel Ltd', applicant: 'Nairobi Style Distributors',
      amount: 43200, currency: 'USD', expiryDate: '2026-08-31',
      status: 'Issued',
      documentCompliance: ltDocs2.map(d => ({ docType: d.title, required: true, submitted: false, compliant: null })),
      creatorOrgId: 'org9', createdAt: lt2Ts,
    };
    store.letterOfCredits.push(lcLt);
    // Smart Contract — 3 conditions, none yet met
    const scHashLt = genHash();
    const scLt = {
      id: genId(), consignmentId: ltC2.id, ucr: ltC2.ucr,
      contractRef: 'SC-2026-STB-01002', contractHash: scHashLt,
      payorOrgId: 'org9', payeeOrgId: 'org9',
      amount: 43200, currency: 'USD',
      conditions: [
        { id: 'cond-0', description: 'Bill of Lading presented and verified by StanbicBank', docType: 'Bill of Lading', met: false, metAt: null },
        { id: 'cond-1', description: 'Certificate of Origin (AfCFTA) confirmed — duty reduction applied', docType: 'Certificate of Origin', met: false, metAt: null },
        { id: 'cond-2', description: 'Goods cleared at JKIA Cargo, Nairobi', docType: 'Export Declaration', met: false, metAt: null },
      ],
      status: 'Active', autoRelease: true, creatorOrgId: 'org9',
      createdAt: lt2Ts, settledAt: null,
    };
    store.smartContracts.push(scLt);
    seedTs('Payment Recorded',       'Vestline Apparel Ltd',          `Payment INV-2026-LTL-01001 created for ${ltC1.ucr}. USD 58,800. Overdue — 43 days. Working capital strained.`, lt1Ts);
    seedTs('Payment Recorded',       'Vestline Apparel Ltd',          `Payment INV-2026-LTL-01002 created for ${ltC2.ucr}. USD 43,200. Unpaid. Awaiting LC from StanbicBank.`, lt2Ts);
    seedTs('Letter of Credit Issued','Meridian Bank Trade Finance',  `LC LC-2026-STB-01002 issued for ${ltC2.ucr}. Amount: USD 43,200. Issuing: Meridian Bank Trade Finance.`, lt2Ts);
    seedTs('Smart Contract Deployed','Meridian Bank Trade Finance',  `Contract SC-2026-STB-01002 deployed for ${ltC2.ucr}. 3 release conditions. Hash: ${scHashLt}.`, lt2Ts);
  }

  // ── Journey 6: Central Finance Regulator (org15) gets finance viewer access to all records ──
  for (const cId of Object.keys(store.financePermissions)) {
    if (!store.financePermissions[cId]['org15']) store.financePermissions[cId]['org15'] = 'viewer';
  }

  saveTangleLog();
  console.log(`[${NODE_NAME}] Seeded finance data: ${store.payments.length} payments, ${store.letterOfCredits.length} LCs, ${store.smartContracts.length} smart contracts`);
}

function seedIdentities() {
  for (const org of store.orgs) {
    if (!org.verified || !org.did) continue;
    const details = `DID created for ${org.name} (${org.regNumber}). Attested by ${org.attestedBy}. Anchored on the ledger.`;
    if (store.tangleLog.some(e => e.details === details)) continue;
    const ts = new Date(Date.now() - Math.floor(Math.random() * 90) * 86400000).toISOString();
    store.tangleLog.push({ id: genId(), timestamp: ts, hash: genHash(), type: 'identity', action: 'DID Issued', actor: org.name, details, did: org.did, attestedBy: org.attestedBy });
  }
  saveTangleLog();
}

// Seed demo data
seedConsignments();
seedFinanceData();
seedIdentities();

// Start server — skipped on Vercel (serverless handles the lifecycle)
if (!IS_VERCEL) {
  httpServer.listen(PORT, () => { console.log(`[${NODE_NAME}] Listening on port ${PORT} (HTTP + WS on same port)`); });
}

// Export for Vercel's @vercel/node runner
export default app;
