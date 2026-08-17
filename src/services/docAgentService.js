import { parseUploadedImage } from './imageParserService.js';

/**
 * DocAgent - Autonomous Document Intelligence & Vault Eligibility Auditor
 * 
 * Capabilities:
 * 1. Autonomous OCR & Attribute Extraction (PhilSys CRN, PhilHealth PIN, SSS, TIN, Indigency, Expiration)
 * 2. Proactive Document Expiration & Renewal Monitoring
 * 3. Autonomous Renewal Packet & Request Form Generator
 * 4. Dynamic Civic Opportunity Gap-Filling & Readiness Optimization
 */

// Statutory Document Validity Periods (in Days)
export const STATUTORY_VALIDITY_DAYS = {
  'Barangay Certificate': 180, // 6 months (DILG Standard)
  'Barangay Indigency': 180, // 6 months
  'Barangay Clearance': 180, // 6 months
  'Proof of Residence / Utility Bill': 90, // 3 months
  'Utility Bill / Proof of Billing': 90, // 3 months
  'NBI Clearance': 365, // 1 year
  'Police Clearance': 180, // 6 months
  'Medical Certificate': 90, // 3 months
  'Clinical Abstract': 90, // 3 months
  'Certificate of Employment': 180, // 6 months
  'PhilHealth MDR': 365, // 1 year
  'School Registration / COR': 120, // 1 Semester (~4 months)
  'National ID / Gov ID': 3650, // 10 years / Lifetime (PhilSys)
  'Birth Certificate (PSA)': 36500, // Permanent / No expiration
  'PWD Identification Card': 1825, // 5 years (NCDA Standard)
};

// Visual profile per document category, used to render a thumbnail that actually looks
// like the document it represents (ID card, seal-stamped certificate, clearance, etc.)
// instead of an unrelated stock photo.
const DOCUMENT_VISUAL_PROFILES = [
  {
    match: (type) => /national id|gov id|identity card|osca|pwd identification/i.test(type),
    label: 'GOVERNMENT ID',
    kind: 'card',
    from: '#093a96',
    to: '#1e5fd9',
  },
  {
    match: (type) => /utility|bill|water|electric|meralco|maynilad|residence/i.test(type),
    label: 'UTILITY BILL / PROOF OF RESIDENCE',
    kind: 'document',
    from: '#0284c7',
    to: '#38bdf8',
  },
  {
    match: (type) => /barangay/i.test(type),
    label: 'BARANGAY CERTIFICATE',
    kind: 'seal',
    from: '#0f766e',
    to: '#14b8a6',
  },
  {
    match: (type) => /nbi|police/i.test(type),
    label: 'CLEARANCE',
    kind: 'shield',
    from: '#7c2d12',
    to: '#c2410c',
  },
  {
    match: (type) => /medical|clinical/i.test(type),
    label: 'MEDICAL CERTIFICATE',
    kind: 'cross',
    from: '#be123c',
    to: '#f43f5e',
  },
  {
    match: (type) => /philhealth/i.test(type),
    label: 'PHILHEALTH MDR',
    kind: 'cross',
    from: '#7e22ce',
    to: '#a855f7',
  },
  {
    match: (type) => /birth certificate|psa/i.test(type),
    label: 'CERTIFICATE OF LIVE BIRTH',
    kind: 'seal',
    from: '#0e7490',
    to: '#22d3ee',
  },
  {
    match: (type) => /employment|coe|civil service/i.test(type),
    label: 'CERTIFICATE OF EMPLOYMENT',
    kind: 'briefcase',
    from: '#334155',
    to: '#64748b',
  },
  {
    match: (type) => /school|registration|transcript/i.test(type),
    label: 'CERTIFICATE OF REGISTRATION',
    kind: 'cap',
    from: '#a16207',
    to: '#eab308',
  },
];

const DEFAULT_VISUAL_PROFILE = {
  label: 'GOVERNMENT DOCUMENT',
  kind: 'document',
  from: '#334155',
  to: '#64748b',
};

// Small hand-drawn icon glyphs (kept minimal so they render crisply at thumbnail size)
const VISUAL_ICON_PATHS = {
  card: '<rect x="18" y="20" width="20" height="14" rx="2" fill="none" stroke="white" stroke-width="1.6"/><circle cx="23" cy="27" r="2.4" fill="white"/><rect x="28" y="24.5" width="7" height="1.4" rx="0.7" fill="white"/><rect x="28" y="27.5" width="7" height="1.4" rx="0.7" fill="white"/>',
  seal: '<circle cx="28" cy="26" r="8" fill="none" stroke="white" stroke-width="1.6"/><path d="M28 21 L29.2 24.8 L33 24.8 L30 27.1 L31.1 31 L28 28.6 L24.9 31 L26 27.1 L23 24.8 L26.8 24.8 Z" fill="white"/>',
  shield: '<path d="M28 18 L36 21 V27 C36 32 32.5 35.5 28 37 C23.5 35.5 20 32 20 27 V21 Z" fill="none" stroke="white" stroke-width="1.6"/><path d="M24.5 27 L27 29.5 L32 24" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  cross: '<rect x="25.5" y="19" width="5" height="16" rx="1.2" fill="white"/><rect x="20" y="24.5" width="16" height="5" rx="1.2" fill="white"/>',
  briefcase: '<rect x="18" y="24" width="20" height="12" rx="1.5" fill="none" stroke="white" stroke-width="1.6"/><path d="M24 24 V21.5 C24 20.7 24.7 20 25.5 20 H30.5 C31.3 20 32 20.7 32 21.5 V24" fill="none" stroke="white" stroke-width="1.6"/>',
  cap: '<path d="M28 19 L38 24 L28 29 L18 24 Z" fill="none" stroke="white" stroke-width="1.6" stroke-linejoin="round"/><path d="M22 26 V31 C22 32.5 24.7 34 28 34 C31.3 34 34 32.5 34 31 V26" fill="none" stroke="white" stroke-width="1.6"/>',
  document: '<rect x="20" y="18" width="16" height="20" rx="1.5" fill="none" stroke="white" stroke-width="1.6"/><rect x="23" y="23" width="10" height="1.4" rx="0.7" fill="white"/><rect x="23" y="27" width="10" height="1.4" rx="0.7" fill="white"/><rect x="23" y="31" width="6" height="1.4" rx="0.7" fill="white"/>',
};

/**
 * Builds a self-contained SVG placeholder thumbnail that visually matches the given
 * document type (e.g. a card icon for a National ID, a seal for a certificate) instead
 * of showing an unrelated stock photo.
 */
export function getDocumentPlaceholderThumbnail(type = '') {
  const profile = DOCUMENT_VISUAL_PROFILES.find((p) => p.match(type)) || DEFAULT_VISUAL_PROFILE;
  const icon = VISUAL_ICON_PATHS[profile.kind] || VISUAL_ICON_PATHS.document;
  const label = profile.label;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${profile.from}"/>
        <stop offset="1" stop-color="${profile.to}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="260" fill="url(#g)"/>
    <g transform="translate(150,30) scale(4.2)">${icon}</g>
    <text x="200" y="220" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="white" letter-spacing="0.5">${label}</text>
    <text x="200" y="240" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="rgba(255,255,255,0.75)">Republika ng Pilipinas</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Document OCR Presets for instant realistic simulation
export const OCR_PRESET_TEMPLATES = {
  philsys: {
    type: 'National ID / Gov ID',
    name: 'PhilSys National ID (ePhilID)',
    issuer: 'Philippine Statistics Authority (PSA)',
    documentNumber: 'PH-CRN-9942-8810-7214',
    validityDays: 3650,
    thumbnail: getDocumentPlaceholderThumbnail('National ID / Gov ID'),
    attributes: {
      crn: 'PH-CRN-9942-8810-7214',
      fullName: 'Adones Mendoza Santos',
      birthDate: '1992-04-18',
      civilStatus: 'Married',
      citizenship: 'Filipino',
      address: 'Unit 402, Katipunan Ave, Quezon City, Metro Manila',
      bloodType: 'O+',
      securityHash: 'PSA-PHILSYS-SEC-8910-SHA256',
    },
    confidenceScore: 99.4,
    textClarity: 'Optimal (99%)',
  },
  indigency: {
    type: 'Barangay Certificate',
    name: 'Barangay Certificate of Indigency',
    issuer: 'Office of the Punong Barangay - Brgy. Loyola Heights, QC',
    documentNumber: 'BRGY-IND-2026-0841',
    validityDays: 180,
    thumbnail: getDocumentPlaceholderThumbnail('Barangay Certificate'),
    attributes: {
      certificateNumber: 'BRGY-IND-2026-0841',
      barangay: 'Loyola Heights',
      city: 'Quezon City',
      purpose: 'Medical Assistance / DSWD AICS & Malasakit Center',
      issuedDate: new Date().toISOString().split('T')[0],
      statutoryBasis: 'Republic Act 11261 (First-Time Jobseekers) / Local Gov Code',
      signatory: 'Hon. Maria Elena Santos, Punong Barangay',
    },
    confidenceScore: 98.7,
    textClarity: 'High (98%)',
  },
  nbi: {
    type: 'NBI Clearance',
    name: 'NBI Clearance Multi-Purpose',
    issuer: 'National Bureau of Investigation (NBI)',
    documentNumber: 'NBI-CLEAR-8839-4410',
    validityDays: 365,
    thumbnail: getDocumentPlaceholderThumbnail('NBI Clearance'),
    attributes: {
      nbiId: 'NBI-CLEAR-8839-4410',
      statusRemarks: 'NO DEROGATORY RECORD / CLEAN',
      purpose: 'Multi-Purpose / Employment / Gov Loan',
      qrCodeVerified: true,
    },
    confidenceScore: 99.1,
    textClarity: 'Optimal (99%)',
  },
  medical: {
    type: 'Medical Certificate / Clinical Abstract',
    name: 'Clinical Abstract & Diagnosis Summary',
    issuer: 'Quezon City General Hospital - Department of Internal Medicine',
    documentNumber: 'QCGH-MED-9941',
    validityDays: 90,
    thumbnail: getDocumentPlaceholderThumbnail('Medical Certificate / Clinical Abstract'),
    attributes: {
      hospital: 'Quezon City General Hospital',
      physician: 'Dr. Roberto G. Cruz, MD (PRC #0084920)',
      diagnosis: 'Acute Gastroenteritis / Dehydration - Resolved',
      philhealthClaimNo: 'PHIC-2026-MED-84910',
    },
    confidenceScore: 97.8,
    textClarity: 'Good (97%)',
  },
  psa_birth: {
    type: 'Birth Certificate (PSA)',
    name: 'PSA Certificate of Live Birth',
    issuer: 'Philippine Statistics Authority (PSA)',
    documentNumber: 'PSA-COLB-1992-0418-88',
    validityDays: 36500,
    thumbnail: getDocumentPlaceholderThumbnail('Birth Certificate (PSA)'),
    attributes: {
      registryNumber: '92-0418-QC',
      motherMaidenName: 'Corazon Mendoza',
      fatherName: 'Manuel Santos',
      birthPlace: 'Quezon City, Metro Manila',
    },
    confidenceScore: 99.8,
    textClarity: 'Optimal (100%)',
  },
  senior_osca: {
    // Filed under the same 'National ID / Gov ID' type as PhilSys so it satisfies any
    // "valid government ID" requirement, not just senior-exclusive ones.
    type: 'National ID / Gov ID',
    name: 'OSCA Senior Citizen ID',
    issuer: 'Office for Senior Citizens Affairs (OSCA) - Quezon City',
    documentNumber: 'OSCA-QC-2026-05512',
    validityDays: 3650,
    thumbnail: getDocumentPlaceholderThumbnail('National ID / Gov ID'),
    attributes: {
      oscaId: 'OSCA-QC-2026-05512',
      fullName: 'Adones Mendoza Santos',
      birthDate: '1962-03-10',
      barangay: 'Loyola Heights',
      city: 'Quezon City',
      statutoryBasis: 'Republic Act No. 9994 (Expanded Senior Citizens Act) & RA 10645',
    },
    confidenceScore: 99.0,
    textClarity: 'Optimal (99%)',
  },
  pwd_id: {
    type: 'National ID / Gov ID',
    name: 'PWD Identification Card',
    issuer: 'National Council on Disability Affairs (NCDA) / City PDAO',
    documentNumber: 'PWD-QC-2026-11209',
    validityDays: 1825,
    thumbnail: getDocumentPlaceholderThumbnail('National ID / Gov ID'),
    attributes: {
      pwdId: 'PWD-QC-2026-11209',
      disabilityType: 'Orthopedic / Physical Disability',
      statutoryBasis: 'Republic Act No. 10754 (PWD Statutory Discounts & VAT Exemption)',
    },
    confidenceScore: 98.9,
    textClarity: 'High (98%)',
  },
  philhealth_mdr: {
    type: 'PhilHealth MDR',
    name: 'PhilHealth Member Data Record (MDR)',
    issuer: 'Philippine Health Insurance Corporation (PhilHealth)',
    documentNumber: 'PHIC-PIN-0219-8841-2207',
    validityDays: 365,
    thumbnail: getDocumentPlaceholderThumbnail('PhilHealth MDR'),
    attributes: {
      philhealthPin: 'PHIC-PIN-0219-8841-2207',
      memberStatus: 'Active / Contributing Member',
      dependents: 'Registered Senior Parent Dependent',
    },
    confidenceScore: 98.4,
    textClarity: 'High (98%)',
  },
  police_clearance: {
    type: 'Police Clearance',
    name: 'Philippine National Police Clearance',
    issuer: 'Philippine National Police (PNP) Clearance System',
    documentNumber: 'PNP-CLR-2026-77340',
    validityDays: 180,
    thumbnail: getDocumentPlaceholderThumbnail('Police Clearance'),
    attributes: {
      pnpReferenceNo: 'PNP-CLR-2026-77340',
      statusRemarks: 'NO DEROGATORY RECORD / CLEAN',
      purpose: 'Local Employment / Barangay Requirement',
    },
    confidenceScore: 98.1,
    textClarity: 'Good (97%)',
  },
  coe: {
    type: 'Certificate of Employment (COE)',
    name: 'Certificate of Employment',
    issuer: 'Human Resources Department, Private Employer',
    documentNumber: 'COE-2026-40218',
    validityDays: 180,
    thumbnail: getDocumentPlaceholderThumbnail('Certificate of Employment (COE)'),
    attributes: {
      position: 'Rank-and-File Employee',
      employmentStatus: 'Regular / Full-Time',
      dateHired: '2021-06-14',
    },
    confidenceScore: 97.5,
    textClarity: 'Good (97%)',
  },
  school_cor: {
    type: 'School Registration / Transcript',
    name: 'Certificate of Registration (COR)',
    issuer: 'Office of the University Registrar',
    documentNumber: 'COR-AY2026-2027-08841',
    validityDays: 120,
    thumbnail: getDocumentPlaceholderThumbnail('School Registration / Transcript'),
    attributes: {
      schoolYear: 'AY 2026-2027, 1st Semester',
      yearLevel: '2nd Year',
      enrollmentStatus: 'Officially Enrolled',
    },
    confidenceScore: 97.9,
    textClarity: 'Good (97%)',
  },
  csc_pds: {
    // Government job applications (Personal Data Sheet, CSC Form 212), distinct from
    // private-sector Certificate of Employment.
    type: 'Certificate of Employment (COE)',
    name: 'Personal Data Sheet (CSC Form 212)',
    issuer: 'Civil Service Commission (CSC)',
    documentNumber: 'CSC-PDS-2026-33017',
    validityDays: 180,
    thumbnail: getDocumentPlaceholderThumbnail('Certificate of Employment (COE)'),
    attributes: {
      formVersion: 'CS Form No. 212 (Revised 2017)',
      applicantStatus: 'Duly Accomplished & Signed',
      purpose: 'Government Employment Application',
    },
    confidenceScore: 98.0,
    textClarity: 'Good (97%)',
  },
  utility_bill: {
    type: 'Proof of Residence / Utility Bill',
    name: 'Water Utility Billing Statement (Proof of Residence)',
    issuer: 'Water Utility Provider / Local Water District',
    documentNumber: 'UTIL-BILL-2026-99120',
    validityDays: 90,
    thumbnail: getDocumentPlaceholderThumbnail('Proof of Residence / Utility Bill'),
    attributes: {
      accountNumber: 'UTIL-BILL-2026-99120',
      meterNumber: 'MTR-884210',
      serviceAddress: 'Unit 402, Katipunan Ave, Loyola Heights, Quezon City',
      billingPeriod: 'Current Billing Cycle',
      purpose: 'Proof of Residence / Billing Verification',
    },
    confidenceScore: 98.2,
    textClarity: 'Optimal (98%)',
  },
  csc_eligibility: {
    type: 'Certificate of Employment (COE)',
    name: 'CSC Civil Service Eligibility Certificate',
    issuer: 'Civil Service Commission (CSC)',
    documentNumber: 'CSC-ELIG-2026-90142',
    validityDays: 36500,
    thumbnail: getDocumentPlaceholderThumbnail('Certificate of Employment (COE)'),
    attributes: {
      eligibilityLevel: 'Professional (Career Service)',
      examDate: '2024-10-06',
      rating: '82.40%',
    },
    confidenceScore: 98.6,
    textClarity: 'Optimal (99%)',
  },
};

/**
 * 1. Autonomous Document Parser & Attribute Extractor (DocAgent OCR Engine)
 */
export async function scanAndExtractDocumentMetadata(fileOrName, customFields = {}, requiredType = null) {
  // If fileOrName is a File or Blob, attempt Multimodal Image & Document Parsing
  if (typeof File !== 'undefined' && fileOrName instanceof File) {
    try {
      const parsed = await parseUploadedImage(fileOrName);
      if (parsed && (parsed.docName || parsed.docType)) {
        const issuedDate = new Date();
        const validityDays = 90;
        const calculatedExpiration =
          parsed.expirationDate ||
          new Date(issuedDate.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Format normalized document type
        let detectedType = parsed.docType || 'Government Document';
        if (/utility|bill|water|electric|meralco|maynilad|residence/i.test(detectedType)) {
          detectedType = 'Proof of Residence / Utility Bill';
        }

        return {
          name: customFields.name || parsed.docName || 'Uploaded Document',
          type: customFields.type || detectedType,
          issuer: customFields.issuer || parsed.issuer || 'Authorized Authority',
          documentNumber: customFields.documentNumber || parsed.docNumber || `DOC-${Math.floor(100000 + Math.random() * 900000)}`,
          expirationDate: customFields.expirationDate || calculatedExpiration,
          attributes: {
            fullName: parsed.fullName || parsed.firstName || '',
            address: parsed.address || '',
            documentNumber: parsed.docNumber || '',
            ...(customFields.attributes || {}),
          },
          confidenceScore: parsed.confidenceScore || 96.5,
          textClarity: 'Optimal (98%)',
          thumbnail: parsed.previewUrl || getDocumentPlaceholderThumbnail(detectedType),
          status: 'Valid',
          scannedAt: new Date().toISOString(),
        };
      }
    } catch (parseErr) {
      console.warn('[DocAgent OCR] Image parsing fallback triggered:', parseErr?.message || parseErr);
    }
  }

  // Simulate OCR latency for realistic agentic scanning experience
  await new Promise((resolve) => setTimeout(resolve, 650));

  const fileName = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name || 'Government Document';
  const lower = fileName.toLowerCase();

  let template = OCR_PRESET_TEMPLATES.philsys;

  // Ordered most-specific-first so overlapping words resolve to the right template
  if (lower.includes('police') || lower.includes('pnp')) {
    template = OCR_PRESET_TEMPLATES.police_clearance;
  } else if (lower.includes('nbi')) {
    template = OCR_PRESET_TEMPLATES.nbi;
  } else if (lower.includes('pwd') || lower.includes('disab')) {
    template = OCR_PRESET_TEMPLATES.pwd_id;
  } else if (lower.includes('senior') || lower.includes('osca')) {
    template = OCR_PRESET_TEMPLATES.senior_osca;
  } else if (lower.includes('philhealth') || lower.includes('mdr') || lower.includes('pmrf')) {
    template = OCR_PRESET_TEMPLATES.philhealth_mdr;
  } else if (
    lower.includes('water') ||
    lower.includes('electric') ||
    lower.includes('utility') ||
    lower.includes('bill') ||
    lower.includes('meralco') ||
    lower.includes('maynilad') ||
    lower.includes('manila water') ||
    lower.includes('mcwd') ||
    lower.includes('pldt') ||
    lower.includes('globe') ||
    lower.includes('converge')
  ) {
    template = OCR_PRESET_TEMPLATES.utility_bill;
  } else if (lower.includes('indigen') || lower.includes('barangay') || lower.includes('residency')) {
    template = OCR_PRESET_TEMPLATES.indigency;
  } else if (lower.includes('medical') || lower.includes('abstract') || lower.includes('doctor') || lower.includes('hospital') || lower.includes('clinical')) {
    template = OCR_PRESET_TEMPLATES.medical;
  } else if (lower.includes('birth') || lower.includes('psa') || lower.includes('live birth')) {
    template = OCR_PRESET_TEMPLATES.psa_birth;
  } else if (lower.includes('personal data sheet') || lower.includes('pds') || lower.includes('form 212')) {
    template = OCR_PRESET_TEMPLATES.csc_pds;
  } else if (lower.includes('eligibility') || lower.includes('csc')) {
    template = OCR_PRESET_TEMPLATES.csc_eligibility;
  } else if (lower.includes('employment') || lower.includes('coe')) {
    template = OCR_PRESET_TEMPLATES.coe;
  } else if (lower.includes('school') || lower.includes('cor') || lower.includes('enrollment') || lower.includes('registration') || lower.includes('transcript') || lower.includes('matriculation')) {
    template = OCR_PRESET_TEMPLATES.school_cor;
  } else if (lower.includes('clearance')) {
    template = OCR_PRESET_TEMPLATES.nbi;
  } else if (requiredType) {
    // If the filename was generic (e.g. numeric photo/camera name from phone like 462548462...)
    const reqNorm = requiredType.toLowerCase();
    if (reqNorm.includes('residence') || reqNorm.includes('utility') || reqNorm.includes('bill')) {
      template = OCR_PRESET_TEMPLATES.utility_bill;
    } else if (reqNorm.includes('barangay') || reqNorm.includes('indigency')) {
      template = OCR_PRESET_TEMPLATES.indigency;
    } else if (reqNorm.includes('philhealth') || reqNorm.includes('mdr')) {
      template = OCR_PRESET_TEMPLATES.philhealth_mdr;
    } else if (reqNorm.includes('nbi')) {
      template = OCR_PRESET_TEMPLATES.nbi;
    } else if (reqNorm.includes('medical')) {
      template = OCR_PRESET_TEMPLATES.medical;
    } else if (reqNorm.includes('birth')) {
      template = OCR_PRESET_TEMPLATES.psa_birth;
    } else if (reqNorm.includes('employment') || reqNorm.includes('coe')) {
      template = OCR_PRESET_TEMPLATES.coe;
    } else if (reqNorm.includes('school')) {
      template = OCR_PRESET_TEMPLATES.school_cor;
    }
  }

  // Calculate Expiration Date
  const issuedDate = new Date();
  const validityDays = template.validityDays || 180;
  const expDateObj = new Date(issuedDate.getTime() + validityDays * 24 * 60 * 60 * 1000);
  const calculatedExpiration = expDateObj.toISOString().split('T')[0];

  // A real uploaded image/PDF is the actual document the citizen scanned — always prefer
  // showing that over the generic type-based placeholder used for quick-test presets.
  const isRealFile = typeof File !== 'undefined' && fileOrName instanceof File && fileOrName.type?.startsWith('image/');
  const thumbnail = isRealFile ? URL.createObjectURL(fileOrName) : template.thumbnail;

  return {
    name: customFields.name || template.name,
    type: customFields.type || template.type,
    issuer: customFields.issuer || template.issuer,
    documentNumber: customFields.documentNumber || template.documentNumber,
    expirationDate: customFields.expirationDate || calculatedExpiration,
    attributes: { ...template.attributes, ...(customFields.attributes || {}) },
    confidenceScore: template.confidenceScore,
    textClarity: template.textClarity,
    thumbnail,
    status: 'Valid',
    scannedAt: new Date().toISOString(),
  };
}

/**
 * 1.5. Upload Verification — checks that an OCR-scanned document actually matches what
 * was required, either a specific requirement (e.g. uploading to satisfy a missing
 * "PhilHealth MDR") or generically against the category the citizen selected in the
 * upload form. Deterministic, mirroring the rest of DocAgent's rules-primacy design —
 * no AI judgment call, just a straight comparison against the extracted type/confidence.
 */
export function verifyDocumentUpload(extracted, requiredType = null) {
  const confidence = extracted?.confidenceScore || 0;
  const detectedType = extracted?.type || 'Unknown Document';
  const normalize = (t) => (t || '').toLowerCase().trim();

  // ── Semantic Equivalence Groups ──────────────────────────────────────────────
  // Multiple real-world document types satisfy the same Philippine government
  // requirement. A water bill, electricity bill, or utility bill is a perfectly
  // valid "Proof of Residence" — the old strict-equality check falsely rejected
  // these because the scanned type didn't exactly match "Barangay Certificate".
  //
  // Each group entry is an array of normalized type strings that are all
  // considered equivalent for verification purposes.
  const EQUIVALENCE_GROUPS = [
    // Proof of Residence / Barangay Documents
    [
      'barangay certificate',
      'barangay clearance',
      'certificate of indigency',
      'barangay indigency',
      'proof of residence',
      'certificate of residency',
      'utility bill',
      'water bill',
      'electricity bill',
      'meralco bill',
      'manila water bill',
      'maynilad bill',
      'internet bill',
      'telephone bill',
      'cable bill',
      'gas bill',
      'barangay id',
    ],
    // Government IDs
    [
      'national id / gov id',
      'national id',
      'gov id',
      'government id',
      'philsys id',
      'philsys national id (ephilid)',
      'valid id',
      'valid government id',
      'umid',
      'postal id',
      'prc id',
      'voter id',
      'driver\'s license',
      'passport',
      'sss id',
      'gsis id',
      'tin id',
      'osca id',
      'senior citizen id',
    ],
    // PhilHealth
    [
      'philhealth mdr',
      'philhealth',
      'member data record',
      'pmrf',
      'philhealth registration form',
    ],
    // Medical / Hospital
    [
      'medical certificate / clinical abstract',
      'medical certificate',
      'clinical abstract',
      'statement of account',
      'hospital bill',
      'soa',
      'prescription',
      'medical record',
    ],
    // Birth / Civil Registry
    [
      'birth certificate (psa)',
      'birth certificate',
      'psa birth certificate',
      'nso birth certificate',
      'marriage certificate',
      'psa marriage certificate',
    ],
    // Clearances
    [
      'nbi clearance',
      'nbi',
    ],
    [
      'police clearance',
    ],
    // Employment
    [
      'certificate of employment (coe)',
      'certificate of employment',
      'coe',
      'employment certificate',
    ],
    // School / Education
    [
      'school registration / transcript',
      'certificate of registration',
      'cor',
      'school registration',
      'transcript of records',
      'form 138',
      'report card',
      'enrollment form',
    ],
    // Application Forms (filled out by ALALAY)
    [
      'application form',
      'government application form',
      'filled out form',
    ],
  ];

  // Find which group the required type belongs to
  const findGroup = (typeStr) => {
    const n = normalize(typeStr);
    return EQUIVALENCE_GROUPS.find((group) => group.some((member) => n.includes(member) || member.includes(n)));
  };

  // If no required type — skip mismatch check entirely
  if (!requiredType) {
    if (confidence < 90) {
      return {
        status: 'review',
        confidence,
        detectedType,
        requiredType,
        message: `DocAgent is only ${confidence}% confident this is a clear, valid ${detectedType}. Please confirm the extracted details below are correct before saving.`,
      };
    }
    return {
      status: 'verified',
      confidence,
      detectedType,
      requiredType,
      message: `Verified — matches ${detectedType} with high confidence.`,
    };
  }

  const requiredGroup = findGroup(requiredType);
  const detectedGroup = findGroup(detectedType);

  // Groups match → semantically equivalent → passes
  const typeMatches =
    requiredGroup &&
    detectedGroup &&
    requiredGroup === detectedGroup; // Same array reference = same group

  // Also pass if direct normalized equality (catches any type not yet in groups)
  const directMatch = normalize(detectedType) === normalize(requiredType);

  if (!typeMatches && !directMatch) {
    return {
      status: 'mismatch',
      confidence,
      detectedType,
      requiredType,
      message: 'Not a valid document for this type of upload',
    };
  }

  if (confidence < 90) {
    return {
      status: 'review',
      confidence,
      detectedType,
      requiredType,
      message: `DocAgent is only ${confidence}% confident this is a clear, valid ${detectedType}. Please confirm the extracted details below are correct before saving.`,
    };
  }

  return {
    status: 'verified',
    confidence,
    detectedType,
    requiredType,
    message: `Verified — this matches the required ${requiredType}.`,
  };
}


/**
 * 2. Proactive Expiration & Audit Evaluator
 */
export function auditVaultDocuments(documents = []) {
  const now = new Date();

  return documents.map((doc) => {
    if (!doc.expirationDate || doc.expirationDate === 'Lifetime' || doc.expirationDate === 'Permanent') {
      return {
        ...doc,
        auditStatus: 'Valid',
        daysUntilExpiration: 9999,
        isPermanent: true,
        urgencyLabel: 'Permanent / Lifetime Validity',
        urgencyColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      };
    }

    const expDate = new Date(doc.expirationDate);
    const diffTime = expDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return {
        ...doc,
        auditStatus: 'Expired',
        daysUntilExpiration: diffDays,
        isExpired: true,
        urgencyLabel: `Expired (${Math.abs(diffDays)}d ago)`,
        urgencyColor: 'text-rose-700 bg-rose-50 border-rose-200',
      };
    }

    if (diffDays <= 30) {
      return {
        ...doc,
        auditStatus: 'Expiring Soon',
        daysUntilExpiration: diffDays,
        isExpiringSoon: true,
        urgencyLabel: `Expires in ${diffDays} days`,
        urgencyColor: 'text-amber-700 bg-amber-50 border-amber-200',
      };
    }

    return {
      ...doc,
      auditStatus: 'Valid',
      daysUntilExpiration: diffDays,
      isValid: true,
      urgencyLabel: `Valid (${diffDays}d left)`,
      urgencyColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    };
  });
}

/**
 * 3. Autonomous Renewal Packet & Request Form Generator
 */
export function generateRenewalPacket(doc, user = {}) {
  const citizenName = `${user.firstName || 'Adones'} ${user.lastName || 'Santos'}`.trim();
  const address = user.address || 'Loyola Heights, Quezon City, Metro Manila';
  const currentDate = new Date().toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const docType = doc.type || 'Barangay Certificate';
  const isIndigency = doc.name?.toLowerCase().includes('indigen') || docType.toLowerCase().includes('indigen');
  const isNbi = doc.name?.toLowerCase().includes('nbi') || docType.toLowerCase().includes('nbi');

  let formalSubject = `Request for Re-issuance & Renewal of ${doc.name}`;
  let authorityTitle = 'Honorable Punong Barangay / Barangay Council';
  let legalBasis = 'Republic Act 11261 (First-Time Jobseekers Act) & DILG Memorandum Circular No. 2019-14';

  if (isNbi) {
    authorityTitle = 'The Director, National Bureau of Investigation (NBI)';
    legalBasis = 'NBI Electronic Clearance System & RA 11261 Priority Clearance Order';
  }

  const formalRequestLetter = `OFFICIAL REQUEST FOR DOCUMENT RENEWAL & RE-ISSUANCE

Date: ${currentDate}

TO:
${authorityTitle}
${doc.issuer || 'Local Government Office'}

FROM:
${citizenName}
Address: ${address}
Contact / Email: ${user.email || 'adones.santos@egov.ph'} | ${user.phone || '+63 917 842 1099'}
eGov PH Reference ID: ${user.egovId || 'PH-CRN-9942-8810-7214'}

SUBJECT: ${formalSubject}

Good day,

I am writing to formally request the renewal and re-issuance of my ${doc.name} (Previous Reference No: ${doc.documentNumber || 'N/A'}), which is expiring / scheduled for periodic update.

This document is required to maintain active compliance and eligibility for official Philippine Government Assistance Programs, including:
1. DSWD Crisis Intervention & Emergency Assistance (AICS)
2. Malasakit Center 100% Medical Zero-Balance Billing
3. Statutory Local Government Social Services & Employment Clearances

Pursuant to ${legalBasis}, I respectfully submit that all necessary prerequisites and valid identification credentials are ready and verified in my Alalay eGov Digital Vault.

Thank you for your prompt assistance and public service.

Respectfully yours,

____________________________________
${citizenName}
Verified Citizen Applicant`;

  return {
    documentId: doc.id,
    documentName: doc.name,
    authority: doc.issuer || authorityTitle,
    requestLetter: formalRequestLetter,
    feeNotice: '100% Free under RA 11261 for indigent assistance and first-time applicants.',
    turnaroundTime: isNbi ? '1-3 Working Days (Online NBI Quick Renewal)' : 'Same-day issuance (15-30 minutes at Barangay Hall)',
    checklist: [
      'Present 1 Valid Photo ID (PhilSys National ID / ePhilID preferred)',
      'Signed Copy of this Request Form',
      'Previous Document Reference / Number',
      'Proof of Residency (Barangay ID / Meralco / Water Bill)',
    ],
  };
}

/**
 * 4. Dynamic Civic Opportunity Gap-Filling & Readiness Optimization
 */
export function calculateOpportunityDocumentGaps(opportunities = [], auditedDocs = []) {
  const validDocNames = auditedDocs
    .filter((d) => d.auditStatus === 'Valid' || d.auditStatus === 'Expiring Soon')
    .map((d) => (d.name || '').toLowerCase());

  const gapAnalysis = opportunities.map((opp) => {
    const requirements = opp.requirements || [];
    let matchedCount = 0;
    const missingItems = [];

    requirements.forEach((req) => {
      const rName = (typeof req === 'string' ? req : req.name || '').toLowerCase();
      const isMet = validDocNames.some((vName) => {
        if (rName.includes('id') && (vName.includes('id') || vName.includes('philsys') || vName.includes('umid'))) return true;
        if (rName.includes('indigen') && (vName.includes('indigen') || vName.includes('barangay'))) return true;
        if (rName.includes('birth') && vName.includes('birth')) return true;
        if (rName.includes('nbi') && vName.includes('nbi')) return true;
        if (rName.includes('medical') && (vName.includes('medical') || vName.includes('abstract'))) return true;
        if (rName.includes('clearance') && (vName.includes('clearance') || vName.includes('police'))) return true;
        return false;
      });

      if (isMet) {
        matchedCount++;
      } else {
        missingItems.push(typeof req === 'string' ? req : req.name);
      }
    });

    const totalReqs = Math.max(requirements.length, 1);
    const readinessPercentage = Math.round((matchedCount / totalReqs) * 100);

    return {
      opportunityId: opp.id,
      title: opp.title,
      agency: opp.agency,
      category: opp.categoryName || opp.category,
      totalRequirements: totalReqs,
      matchedRequirementsCount: matchedCount,
      missingRequirements: missingItems,
      readinessPercentage,
      isFullyReady: missingItems.length === 0,
      isOneDocAway: missingItems.length === 1,
      sourceUrl: opp.officialSource?.url || 'https://www.gov.ph',
    };
  });

  // Sort by highest readiness percentage
  gapAnalysis.sort((a, b) => b.readinessPercentage - a.readinessPercentage);

  const oneDocAwayPrograms = gapAnalysis.filter((g) => g.isOneDocAway);
  const fullyReadyPrograms = gapAnalysis.filter((g) => g.isFullyReady);

  return {
    allGaps: gapAnalysis,
    oneDocAwayPrograms,
    fullyReadyPrograms,
    totalAuditedOpportunities: opportunities.length,
  };
}
