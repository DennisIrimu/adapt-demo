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
const NODE_NAME= process.env.NODE_NAME || args.name || 'Node Alpha';
const PEER_URL = process.env.PEER_URL  || args.peer || null;
const NODE_IP  = `127.0.0.1:${PORT}`;

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
    { id: 'org1', name: 'AtlasPhosphate S.A.',     role: 'Exporter · Morocco',          username: 'atlas',      password: 'demo', orgType: 'private', did: null, verified: false, regNumber: null },
    { id: 'org2', name: 'Morocco Customs',          role: 'Customs Authority · Morocco', username: 'macustoms',  password: 'demo', orgType: 'public',  did: null, verified: false, regNumber: null },
    { id: 'org3', name: 'Nigeria Customs',          role: 'Customs Authority · Nigeria', username: 'ngcustoms',  password: 'demo', orgType: 'public',  did: null, verified: false, regNumber: null },
    { id: 'org4', name: 'Kenya Revenue Authority',  role: 'Customs Authority · Kenya',   username: 'kra',        password: 'demo', orgType: 'public',  did: null, verified: false, regNumber: null },
    { id: 'org7', name: 'Financier 1',              role: 'Financier',                   username: 'financier1', password: 'demo', orgType: 'private', did: null, verified: false, regNumber: null },
    { id: 'org8', name: 'Financier 2',              role: 'Financier',                   username: 'financier2', password: 'demo', orgType: 'private', did: null, verified: false, regNumber: null },
  ] : [
    { id: 'org5', name: 'PrimeFert Nigeria Ltd',        role: 'Importer · Nigeria', username: 'primefert', password: 'demo', orgType: 'private', did: null, verified: false, regNumber: null },
    { id: 'org6', name: 'TradeLink International Ltd',  role: 'Importer · Nigeria', username: 'tradelink', password: 'demo', orgType: 'private', did: null, verified: false, regNumber: null },
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
  const carrier     = m.vessel.startsWith('KQ') ? 'Kenya Airways Cargo' : 'NordShip Line S.A.';
  const exporterAddr = m.fromCountry === 'Morocco'  ? '12 Rue Al Borj, Casablanca 20000, Morocco'
                     : m.fromCountry === 'Kenya'    ? 'Westlands Business Park, Nairobi, Kenya'
                     : '14 Creek Road, Apapa, Lagos, Nigeria';
  const importerAddr = m.toCountry === 'Netherlands' ? 'Prins Bernhardplein 200, Amsterdam, Netherlands'
                     : m.toCountry === 'Germany'      ? 'Speicherstadt 1, Hamburg, Germany'
                     : m.toCountry === 'United Kingdom' ? '1 Dock Road, Felixstowe, Suffolk, UK'
                     : m.toCountry === 'South Africa'   ? 'Island View, Durban, South Africa'
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
  <DeclarantName>${m.fromCountry === 'Morocco' ? 'Morocco Customs' : m.fromCountry === 'Kenya' ? 'Kenya Revenue Authority' : 'Nigeria Customs'}</DeclarantName>
  <DeclarationLocation>${m.originPort}</DeclarationLocation>
  <Status>ACCEPTED</Status>
</CustomsDeclaration>`;
  }

  return null;
}

// ── Hardcoded demo consignments ──
const ALPHA_CONSIGNMENTS = [
  // Morocco → Nigeria (AtlasPhosphate, org1)
  { ucr:'UCR-2026-MA-NG-00101', product:'Triple Super Phosphate (TSP)',    hsCode:'3103.10', quantity:'2,400 MT', totalValue:340000, currency:'USD', exporter:'AtlasPhosphate S.A.', importer:'PrimeFert Nigeria Ltd',       fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Apapa Port, Lagos',      vessel:'MV Atlas Pioneer',    shipDate:'2026-02-18', incoterms:'CFR', invoiceRef:'INV-2026-APM-0101', declRef:'MA-EXP-2026-0101', status:'Delivered',   creatorOrgId:'org1', creatorOrgName:'AtlasPhosphate S.A.' },
  { ucr:'UCR-2026-MA-NG-00102', product:'Di-Ammonium Phosphate (DAP)',     hsCode:'3105.30', quantity:'1,800 MT', totalValue:290000, currency:'USD', exporter:'AtlasPhosphate S.A.', importer:'TradeLink International Ltd', fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Tin Can Island Port',    vessel:'MV Maroc Express',    shipDate:'2026-02-20', incoterms:'FOB', invoiceRef:'INV-2026-APM-0102', declRef:'MA-EXP-2026-0102', status:'In Transit',  creatorOrgId:'org1', creatorOrgName:'AtlasPhosphate S.A.' },
  { ucr:'UCR-2026-MA-NG-00103', product:'Granular Urea (46% N)',           hsCode:'3102.10', quantity:'3,000 MT', totalValue:510000, currency:'USD', exporter:'AtlasPhosphate S.A.', importer:'PrimeFert Nigeria Ltd',       fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Agadir',      destinationPort:'Apapa Port, Lagos',      vessel:'MV Sahara Star',      shipDate:'2026-03-01', incoterms:'CIF', invoiceRef:'INV-2026-APM-0103', declRef:'MA-EXP-2026-0103', status:'Customs',     creatorOrgId:'org1', creatorOrgName:'AtlasPhosphate S.A.' },
  { ucr:'UCR-2026-MA-NG-00104', product:'Phosphoric Acid (75% P₂O₅)',     hsCode:'2809.20', quantity:'950 MT',   totalValue:178000, currency:'USD', exporter:'AtlasPhosphate S.A.', importer:'TradeLink International Ltd', fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Jorf Lasfar', destinationPort:'Onne Port',              vessel:'MV Chemtrans Atlas',  shipDate:'2026-03-05', incoterms:'CFR', invoiceRef:'INV-2026-APM-0104', declRef:'MA-EXP-2026-0104', status:'Submitted',   creatorOrgId:'org1', creatorOrgName:'AtlasPhosphate S.A.' },
  { ucr:'UCR-2026-MA-NG-00105', product:'Mono-Ammonium Phosphate (MAP)',   hsCode:'3105.40', quantity:'2,100 MT', totalValue:375000, currency:'USD', exporter:'AtlasPhosphate S.A.', importer:'PrimeFert Nigeria Ltd',       fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Apapa Port, Lagos',      vessel:'MV Northern Cape',    shipDate:'2026-03-12', incoterms:'FOB', invoiceRef:'INV-2026-APM-0105', declRef:'MA-EXP-2026-0105', status:'Released',    creatorOrgId:'org1', creatorOrgName:'AtlasPhosphate S.A.' },
  { ucr:'UCR-2026-MA-NG-00106', product:'Sulphate of Potash (SOP)',        hsCode:'3104.20', quantity:'1,200 MT', totalValue:264000, currency:'USD', exporter:'AtlasPhosphate S.A.', importer:'TradeLink International Ltd', fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Tin Can Island Port',    vessel:'MV Atlas Pioneer',    shipDate:'2026-03-18', incoterms:'CIF', invoiceRef:'INV-2026-APM-0106', declRef:'MA-EXP-2026-0106', status:'In Transit',  creatorOrgId:'org1', creatorOrgName:'AtlasPhosphate S.A.' },
  { ucr:'UCR-2026-MA-NG-E001',  product:'Rock Phosphate (35% P₂O₅)',      hsCode:'2510.20', quantity:'4,500 MT', totalValue:148500, currency:'USD', exporter:'AtlasPhosphate S.A.', importer:'PrimeFert Nigeria Ltd',       fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Jorf Lasfar', destinationPort:'Apapa Port, Lagos',      vessel:'MV Desert Wind',      shipDate:'2026-01-24', incoterms:'CFR', invoiceRef:'INV-2026-APM-E001', declRef:'MA-EXP-2026-E001', status:'Under Review', creatorOrgId:'org1', creatorOrgName:'AtlasPhosphate S.A.', errorType:'Document Discrepancy', errorDescription:'Certificate of Origin issuer code does not match Morocco Customs registry. Awaiting reissue from MAEX.' },
  { ucr:'UCR-2026-MA-NG-E003',  product:'Ammonium Sulphate (21% N)',      hsCode:'3102.21', quantity:'1,600 MT', totalValue:214400, currency:'USD', exporter:'AtlasPhosphate S.A.', importer:'TradeLink International Ltd', fromCountry:'Morocco', toCountry:'Nigeria', originPort:'Port of Casablanca',  destinationPort:'Tin Can Island Port',    vessel:'MV Maroc Express',    shipDate:'2026-02-10', incoterms:'FOB', invoiceRef:'INV-2026-APM-E003', declRef:'MA-EXP-2026-E003', status:'Under Review', creatorOrgId:'org1', creatorOrgName:'AtlasPhosphate S.A.', errorType:'HS Code Mismatch', errorDescription:'HS code declared on Export Declaration (3102.29) does not match Commercial Invoice (3102.21). Nigeria Customs has flagged for reconciliation.' },
  // Kenya exports (KRA, org4)
  { ucr:'KE-2026-EXP-00101', product:'Fresh Cut Flowers (Mixed)',          hsCode:'0603.19', quantity:'18,400 kg',totalValue: 92000, currency:'USD', exporter:'Kenya Flower Council',   importer:'Aalsmeer Flower Auction',   fromCountry:'Kenya',   toCountry:'Netherlands', originPort:'JKIA Cargo, Nairobi',  destinationPort:'Amsterdam Schiphol',     vessel:'KQ Cargo 101',        shipDate:'2026-02-15', incoterms:'CPT', invoiceRef:'INV-2026-KFC-0101', declRef:'KE-EXP-2026-0101', status:'Delivered',   creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00102', product:'Green Tea — Orthodox (PEKOE)',       hsCode:'0902.10', quantity:'42,000 kg',totalValue:168000, currency:'USD', exporter:'Kenya Tea Development Agency',importer:'British Tea Holdings Ltd', fromCountry:'Kenya',  toCountry:'United Kingdom', originPort:'Port of Mombasa',     destinationPort:'Port of Felixstowe',     vessel:'MV Kwanza Bridge',    shipDate:'2026-02-22', incoterms:'CIF', invoiceRef:'INV-2026-KTDA-0102',declRef:'KE-EXP-2026-0102', status:'In Transit',  creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00103', product:'Washed Arabica Coffee (AA Grade)',   hsCode:'0901.11', quantity:'21,600 kg',totalValue:324000, currency:'USD', exporter:'Nairobi Coffee Exchange', importer:'Volcafe Speciality Coffee', fromCountry:'Kenya',  toCountry:'Germany',         originPort:'Port of Mombasa',     destinationPort:'Port of Hamburg',        vessel:'MV MSC Zanzibar',     shipDate:'2026-03-03', incoterms:'FOB', invoiceRef:'INV-2026-NCE-0103', declRef:'KE-EXP-2026-0103', status:'Customs',     creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00104', product:'Fresh Avocados — Hass',              hsCode:'0804.40', quantity:'38,000 kg',totalValue:114000, currency:'USD', exporter:'Kakuzi PLC',              importer:'EuroFresh Distributors B.V.',fromCountry:'Kenya', toCountry:'Netherlands',  originPort:'Port of Mombasa',     destinationPort:'Port of Rotterdam',      vessel:'MV African Spirit',   shipDate:'2026-03-08', incoterms:'CFR', invoiceRef:'INV-2026-KAK-0104', declRef:'KE-EXP-2026-0104', status:'Released',    creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00105', product:'Macadamia Nuts — Raw (In-Shell)',    hsCode:'0802.60', quantity:'14,500 kg',totalValue: 87000, currency:'USD', exporter:'Kenya Nut Company Ltd',   importer:'Olam International Ltd',    fromCountry:'Kenya',  toCountry:'South Africa',    originPort:'Port of Mombasa',     destinationPort:'Port of Durban',         vessel:'MV Safmarine Mafadi', shipDate:'2026-03-14', incoterms:'CIF', invoiceRef:'INV-2026-KNC-0105', declRef:'KE-EXP-2026-0105', status:'Submitted',   creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
  { ucr:'KE-2026-EXP-00106', product:'French Green Beans (Fine)',          hsCode:'0708.20', quantity:'22,000 kg',totalValue: 66000, currency:'USD', exporter:'Vegpro Group Ltd',        importer:'M&S Food Suppliers UK',     fromCountry:'Kenya',  toCountry:'United Kingdom',  originPort:'JKIA Cargo, Nairobi',  destinationPort:'Heathrow Air Cargo',     vessel:'KQ Cargo 107',        shipDate:'2026-03-19', incoterms:'DAP', invoiceRef:'INV-2026-VPG-0106', declRef:'KE-EXP-2026-0106', status:'In Transit',  creatorOrgId:'org4', creatorOrgName:'Kenya Revenue Authority' },
];

const BETA_CONSIGNMENTS = [
  // Nigeria → Morocco (PrimeFert/TradeLink, org5/org6)
  { ucr:'UCR-2026-NG-MA-00201', product:'Sesame Seeds (White Hulled)',     hsCode:'1207.40', quantity:'1,200 MT', totalValue:156000, currency:'USD', exporter:'PrimeFert Nigeria Ltd',       importer:'Oleagineux du Maghreb S.A.',  fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Apapa Port, Lagos',      destinationPort:'Port of Casablanca', vessel:'MV Bight of Benin',   shipDate:'2026-02-25', incoterms:'FOB', invoiceRef:'INV-2026-PFN-0201', declRef:'NG-EXP-2026-0201', status:'Delivered',   creatorOrgId:'org5', creatorOrgName:'PrimeFert Nigeria Ltd' },
  { ucr:'UCR-2026-NG-MA-00202', product:'Raw Cocoa Beans (Grade 1)',       hsCode:'1801.00', quantity:'850 MT',   totalValue:272000, currency:'USD', exporter:'TradeLink International Ltd', importer:'Barry Callebaut Maroc S.A.',  fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Tin Can Island Port',     destinationPort:'Port of Casablanca', vessel:'MV Ebony Star',       shipDate:'2026-03-04', incoterms:'CIF', invoiceRef:'INV-2026-TLI-0202', declRef:'NG-EXP-2026-0202', status:'In Transit',  creatorOrgId:'org6', creatorOrgName:'TradeLink International Ltd' },
  { ucr:'UCR-2026-NG-MA-00203', product:'Palm Kernel Oil (PKO)',           hsCode:'1513.21', quantity:'600 MT',   totalValue: 78000, currency:'USD', exporter:'PrimeFert Nigeria Ltd',       importer:'Lesieur Cristal S.A.',        fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Onne Port',               destinationPort:'Port of Agadir',     vessel:'MV Atlantic Trader', shipDate:'2026-03-10', incoterms:'CFR', invoiceRef:'INV-2026-PFN-0203', declRef:'NG-EXP-2026-0203', status:'Customs',     creatorOrgId:'org5', creatorOrgName:'PrimeFert Nigeria Ltd' },
  { ucr:'UCR-2026-NG-MA-00204', product:'Cashew Nuts RCN (W240 Grade)',    hsCode:'0801.31', quantity:'420 MT',   totalValue:189000, currency:'USD', exporter:'TradeLink International Ltd', importer:'Olam Maroc S.A.',             fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Apapa Port, Lagos',      destinationPort:'Port of Casablanca', vessel:'MV Bight of Benin',   shipDate:'2026-03-17', incoterms:'FOB', invoiceRef:'INV-2026-TLI-0204', declRef:'NG-EXP-2026-0204', status:'Submitted',   creatorOrgId:'org6', creatorOrgName:'TradeLink International Ltd' },
  { ucr:'UCR-2026-NG-MA-E002',  product:'Soybean Meal (47% Protein)',      hsCode:'2304.00', quantity:'2,000 MT', totalValue:160000, currency:'USD', exporter:'PrimeFert Nigeria Ltd',       importer:'Coopagri Maroc',              fromCountry:'Nigeria', toCountry:'Morocco', originPort:'Apapa Port, Lagos',      destinationPort:'Port of Casablanca', vessel:'MV African Spirit',  shipDate:'2026-02-12', incoterms:'CIF', invoiceRef:'INV-2026-PFN-E002', declRef:'NG-EXP-2026-E002', status:'Under Review', creatorOrgId:'org5', creatorOrgName:'PrimeFert Nigeria Ltd', errorType:'Phytosanitary Failure', errorDescription:'NAQS phytosanitary certificate expired 14 days before shipment date. Morocco Plant Protection Directorate has placed shipment on hold pending resubmission.' },
];

function docsForConsignment(m) {
  const coIssuer = m.fromCountry === 'Kenya'   ? 'Kenya Export Promotion & Branding Agency'
                 : m.fromCountry === 'Morocco'  ? 'MAEX — Morocco Agri-Export Bureau'
                 : 'NEPC — Nigeria Export Promotion Council';
  const edIssuer = m.fromCountry === 'Kenya'   ? 'Kenya Revenue Authority'
                 : m.fromCountry === 'Morocco'  ? 'Morocco Customs'
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
app.get('/api/node', (req, res) => res.json({ nodeId: NODE_ID, nodeName: NODE_NAME, nodeIp: NODE_IP, wsPort: WS_PORT, peerConnected: store.peerConnected, orgCount: store.orgs.length, peerOrgCount: store.peerOrgs.length }));

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

// DID registration
function getAttestingAuthority(org) {
  if (org.role?.includes('Morocco'))  return 'Morocco Customs';
  if (org.role?.includes('Nigeria'))  return 'Nigeria Customs';
  if (org.role?.includes('Kenya'))    return 'Kenya Revenue Authority';
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
        peerWs.send(JSON.stringify({ type: 'HANDSHAKE', nodeId: NODE_ID, nodeName: NODE_NAME, nodeIp: NODE_IP, orgs: store.orgs.map(o => ({ id: o.id, name: o.name, role: o.role, did: o.did, verified: o.verified, nodeId: NODE_ID, nodeName: NODE_NAME })) }));
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
  ws.on('message', d => { const m = JSON.parse(d.toString()); if (m.type === 'HANDSHAKE') { store.peerOrgs = m.orgs || []; store.peerConnected = true; broadcastToClients({ type: 'PEER_STATUS', connected: true, peerOrgs: store.peerOrgs }); ws.send(JSON.stringify({ type: 'ORG_DIRECTORY', orgs: store.orgs.map(o => ({ id: o.id, name: o.name, role: o.role, did: o.did, verified: o.verified, nodeId: NODE_ID, nodeName: NODE_NAME })) })); addLog('network', 'Peer Connected', 'System', 'Inbound P2P connection accepted. Peer orgs now discoverable.'); } else handlePeerMsg(m); });
  ws.on('close', () => { store.peerConnected = false; store.peerOrgs = []; broadcastToClients({ type: 'PEER_STATUS', connected: false, peerOrgs: [] }); });
}
function handlePeerMsg(m) {
  switch (m.type) {
    case 'HANDSHAKE': store.peerOrgs = m.orgs || []; store.peerConnected = true; broadcastToClients({ type: 'PEER_STATUS', connected: true, peerOrgs: store.peerOrgs }); break;
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
    beneficiary: 'AtlasPhosphate S.A.', applicant: 'PrimeFert Nigeria Ltd',
    amount: 340000, currency: 'USD', expiryDate: '2026-07-31',
    status: 'Confirmed',
    documentCompliance: docs1.map((d, i) => ({ docType: d.title, required: true, submitted: true, compliant: i < 4 ? true : null })),
    creatorOrgId: atlas, createdAt: ts1,
  };
  const lc2 = {
    id: genId(), consignmentId: c2.id, ucr: c2.ucr,
    lcNumber: 'LC-2026-ATW-00102',
    issuingBank: 'Bank 1', advisingBank: 'Bank 2',
    beneficiary: 'AtlasPhosphate S.A.', applicant: 'TradeLink International Ltd',
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
  const seedTs = (t, ts) => { if (!store.tangleLog.some(e => e.details && e.details.includes(t))) store.tangleLog.push({ id: genId(), timestamp: ts, hash: genHash(), type: 'finance', action: 'Finance Seeded', actor: 'AtlasPhosphate S.A.', details: t }); };
  seedTs(`Payment INV-APM-2026-0101 created for ${c1.ucr}. USD 340,000. Partially Paid.`, ts1);
  seedTs(`Payment INV-APM-2026-0102 created for ${c2.ucr}. EUR 288,000. Overdue.`, ts2);
  seedTs(`LC LC-2026-ATW-00101 created for ${c1.ucr}. Amount: USD 340,000. Status: Confirmed.`, ts1);
  seedTs(`LC LC-2026-ATW-00102 created for ${c2.ucr}. Amount: EUR 288,000. Status: Issued.`, ts2);
  seedTs(`Contract SC-2026-ATW-0101 deployed for ${c1.ucr}. 3 release conditions. Hash: ${hash1}.`, ts1);
  seedTs(`Contract SC-2026-ATW-0102 deployed for ${c2.ucr}. 2 release conditions. Hash: ${hash2}.`, ts2);
  saveTangleLog();

  console.log(`[${NODE_NAME}] Seeded finance data: 2 payments, 2 LCs, 2 smart contracts`);
}

// Seed demo data
seedConsignments();
seedFinanceData();

// Start server — skipped on Vercel (serverless handles the lifecycle)
if (!IS_VERCEL) {
  httpServer.listen(PORT, () => { console.log(`[${NODE_NAME}] Listening on port ${PORT} (HTTP + WS on same port)`); });
}

// Export for Vercel's @vercel/node runner
export default app;
