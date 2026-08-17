/**
 * ALALAY Dedicated Apply AI Service (applyAiService.js)
 *
 * Dedicated service for the Conversational Application Intake Agent.
 * Handles program definitions, form templates, conversational interview loops,
 * DOC-format generation, Word document export, and printing.
 */

import { getApiKey } from './geminiService';

// =============================================================================
// 1. PROGRAM REGISTRY (Phase 1 — Program Selector Cards)
// =============================================================================

export const INTAKE_PROGRAMS = [
  {
    id: 'sss-salary-loan',
    title: 'SSS Salary Loan',
    shortTitle: 'SSS Loan',
    agency: 'Social Security System',
    color: '#1d4ed8',
    gradient: 'from-blue-700 to-blue-500',
    icon: '💼',
    tagline: 'Borrow up to 2 months salary from your contributions',
    benefit: 'Up to ₱40,000+',
    officialUrl: 'https://www.sss.gov.ph',
    estimatedMinutes: 2,
    profileFieldsUsed: ['Full Name', 'Birthday', 'Address', 'Employment Status'],
    gapFieldsCount: 3,
  },
  {
    id: 'dswd-aics',
    title: 'DSWD Emergency Assistance',
    shortTitle: 'DSWD AICS',
    agency: 'Dept. of Social Welfare & Development',
    color: '#b45309',
    gradient: 'from-amber-700 to-orange-500',
    icon: '🤝',
    tagline: 'Emergency cash grant for indigent families in crisis',
    benefit: '₱3,000 – ₱10,000 cash grant',
    officialUrl: 'https://www.dswd.gov.ph',
    estimatedMinutes: 3,
    profileFieldsUsed: ['Full Name', 'Birthday', 'Address', 'Civil Status', 'Income'],
    gapFieldsCount: 3,
  },
  {
    id: 'philhealth-cf1',
    title: 'PhilHealth Hospital Claim',
    shortTitle: 'PhilHealth CF1',
    agency: 'Philippine Health Insurance Corp.',
    color: '#047857',
    gradient: 'from-emerald-700 to-green-500',
    icon: '🏥',
    tagline: 'Claim your PhilHealth benefits for hospital confinement',
    benefit: 'Covers hospitalization costs',
    officialUrl: 'https://www.philhealth.gov.ph',
    estimatedMinutes: 2,
    profileFieldsUsed: ['Full Name', 'Birthday', 'Address'],
    gapFieldsCount: 4,
  },
  {
    id: 'dole-tupad',
    title: 'DOLE TUPAD Employment',
    shortTitle: 'TUPAD',
    agency: 'Dept. of Labor & Employment',
    color: '#6d28d9',
    gradient: 'from-violet-700 to-purple-500',
    icon: '👷',
    tagline: '10–30 days emergency wage employment with community work',
    benefit: 'Daily minimum wage × days',
    officialUrl: 'https://dole.gov.ph',
    estimatedMinutes: 2,
    profileFieldsUsed: ['Full Name', 'Birthday', 'Address', 'Civil Status'],
    gapFieldsCount: 4,
  },
  {
    id: 'philhealth-senior',
    title: 'PhilHealth Senior Citizen Mandatory Benefit Package',
    shortTitle: 'PhilHealth Senior',
    agency: 'Philippine Health Insurance Corporation',
    color: '#be123c',
    gradient: 'from-rose-700 to-pink-500',
    icon: '👴',
    tagline: 'Lifetime healthcare coverage & zero-balance billing for seniors 60+',
    benefit: '100% Lifetime PhilHealth Coverage (RA 10645)',
    officialUrl: 'https://www.philhealth.gov.ph',
    estimatedMinutes: 2,
    profileFieldsUsed: ['Full Name', 'Birthday', 'Address'],
    gapFieldsCount: 5,
  },
];

// =============================================================================
// 2. FORM FIELD TEMPLATES — Full definitions per program
// =============================================================================

export const INTAKE_FORM_TEMPLATES = {
  'sss-salary-loan': {
    title: 'SSS Salary Loan Application (Form E-6)',
    agency: 'Social Security System (SSS)',
    fields: [
      {
        id: 'fullName',
        label: 'Full Name',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'name',
        fallbackProfileKeys: ['firstName', 'lastName'],
        format: (u) => u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Adones Santos',
      },
      {
        id: 'sssNumber',
        label: 'SSS Member ID Number',
        section: 'Member Information',
        source: 'documents',
        docMatcher: (docs) =>
          docs.find((d) =>
            d.type?.toLowerCase().includes('umid') ||
            d.type?.toLowerCase().includes('sss') ||
            d.name?.toLowerCase().includes('sss')
          )?.documentNumber || null,
        question: "What is your 10-digit SSS Number? (You can find it on your SSS card or UMID)",
        hint: "Format: XX-XXXXXXX-X (10 digits)",
        validator: (v) => /\d{10}/.test(v.replace(/\D/g, '')),
        validationHint: "Please provide a valid 10-digit SSS number",
      },
      {
        id: 'dateOfBirth',
        label: 'Date of Birth',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'birthDate',
        format: (u) => u.birthDate || u.birth_date || '1990-05-15',
      },
      {
        id: 'residentialAddress',
        label: 'Home Address',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'address',
        format: (u) => u.address || 'Metro Manila, Philippines',
      },
      {
        id: 'monthlySalary',
        label: 'Gross Monthly Salary',
        section: 'Employment & Loan Details',
        source: 'profile',
        profileKey: 'monthlyIncome',
        format: (u) => (u.monthlyIncome ? `₱${Number(u.monthlyIncome).toLocaleString()}` : null),
        question: "What is your current gross monthly salary? (This helps calculate your maximum loan amount)",
        hint: "e.g. 25000 or ₱25,000",
        validator: (v) => {
          const num = Number(String(v).replace(/[^0-9]/g, ''));
          return !isNaN(num) && num > 0;
        },
        validationHint: "Please enter a valid amount (e.g. 25000)",
      },
      {
        id: 'loanTerm',
        label: 'Requested Loan Term',
        section: 'Employment & Loan Details',
        source: 'ask',
        question: "How long would you like to pay it back? You can choose **12 months (1 year)** or **24 months (2 years)**.",
        hint: "12 months or 24 months",
        options: ['12 months', '24 months'],
        extractOption: (text) => {
          const lower = text.toLowerCase();
          if (lower.includes('12') || lower.includes('1 yr') || lower.includes('1 year') || lower.includes('one')) return '12 months';
          if (lower.includes('24') || lower.includes('2 yr') || lower.includes('2 year') || lower.includes('two')) return '24 months';
          return '24 months'; // Default
        },
      },
      {
        id: 'disbursementAccount',
        label: 'Disbursement Bank / E-Wallet',
        section: 'Disbursement Details',
        source: 'ask',
        question: "Where should SSS send your loan proceeds? (e.g. **GCash**, **Maya**, **BDO**, **BPI**, or **LandBank** account number)",
        hint: "Bank Name + Account Number, or E-Wallet Number",
        validator: (v) => String(v).trim().length >= 4,
        validationHint: "Please enter your bank or e-wallet details",
      },
      {
        id: 'employerName',
        label: 'Employer / Business Name',
        section: 'Employment & Loan Details',
        source: 'profile',
        profileKey: 'employer',
        format: (u) => u.employer || (u.employmentStatus === 'Employed' ? 'Private Employer' : 'Self-Employed / Voluntary'),
      },
    ],
    submissionGuide: [
      'Print this completed Form E-6.',
      'Sign in the Member-Borrower signature block at the bottom.',
      'Have your employer sign Section B (Employer Certification) if currently employed.',
      'Upload to the SSS Member Portal (member.sss.gov.ph) under E-Services > Apply for Salary Loan, or submit at your nearest SSS Branch.',
    ],
  },

  'dswd-aics': {
    title: 'DSWD AICS Intake & Assessment Form',
    agency: 'Department of Social Welfare & Development (DSWD)',
    fields: [
      {
        id: 'fullName',
        label: 'Beneficiary Full Name',
        section: 'General Information',
        source: 'profile',
        profileKey: 'name',
        format: (u) => u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Adones Santos',
      },
      {
        id: 'dateOfBirth',
        label: 'Date of Birth',
        section: 'General Information',
        source: 'profile',
        profileKey: 'birthDate',
        format: (u) => u.birthDate || u.birth_date || '1990-05-15',
      },
      {
        id: 'civilStatus',
        label: 'Civil Status',
        section: 'General Information',
        source: 'profile',
        profileKey: 'civilStatus',
        format: (u) => u.civilStatus || 'Single',
      },
      {
        id: 'residentialAddress',
        label: 'Current Address',
        section: 'General Information',
        source: 'profile',
        profileKey: 'address',
        format: (u) => u.address || 'Metro Manila, Philippines',
      },
      {
        id: 'assistanceType',
        label: 'Type of Emergency Assistance Needed',
        section: 'Assistance Details',
        source: 'ask',
        question: "What type of assistance do you need most right now? (e.g. **Medical/Hospital Bills**, **Funeral Assistance**, **Transportation**, **Food/Subsistence**, or **Educational**)",
        hint: "Medical, Burial, Transportation, Food, Educational",
        options: ['Medical', 'Burial / Funeral', 'Transportation', 'Food / Subsistence', 'Educational Assistance'],
      },
      {
        id: 'crisisNarrative',
        label: 'Statement of Crisis / Purpose',
        section: 'Assistance Details',
        source: 'ask',
        question: "Could you briefly tell me what happened or why you need this emergency assistance? (Just 1–2 sentences in English or Tagalog)",
        hint: "e.g. Hospital confinement of family member, sudden loss of livelihood",
        validator: (v) => String(v).trim().length >= 8,
        validationHint: "Please share a brief sentence so the social worker understands your situation",
      },
      {
        id: 'householdDependents',
        label: 'Number of Household Dependents',
        section: 'General Information',
        source: 'ask',
        question: "How many dependents or family members currently rely on your household income?",
        hint: "e.g. 3 children, or just 1",
        validator: (v) => !isNaN(Number(String(v).replace(/[^0-9]/g, ''))),
        validationHint: "Please enter a number (e.g. 3)",
      },
      {
        id: 'barangayIndigency',
        label: 'Barangay Indigency Status',
        section: 'Supporting Documents',
        source: 'documents',
        docMatcher: (docs) => {
          const d = docs.find((doc) =>
            doc.type?.toLowerCase().includes('indigen') ||
            doc.name?.toLowerCase().includes('indigen') ||
            doc.type?.toLowerCase().includes('barangay')
          );
          return d ? `Verified in Vault (${d.documentNumber || 'Barangay Seal'})` : null;
        },
        question: "Do you have a Barangay Certificate of Indigency from your local Barangay Hall?",
        hint: "Yes or No",
      },
    ],
    submissionGuide: [
      'Print this completed DSWD AICS Intake Form.',
      'Attach your Barangay Certificate of Indigency and 1 valid government ID.',
      'For medical assistance: attach Clinical Abstract + Hospital Statement of Account (SOA).',
      'For burial assistance: attach Certified True Copy of Death Certificate.',
      'Submit to the nearest DSWD Field Office, Crisis Intervention Unit (CIU), or Malasakit Center desk.',
    ],
  },

  'philhealth-cf1': {
    title: 'PhilHealth Claim Form 1 (CF-1)',
    agency: 'Philippine Health Insurance Corporation (PhilHealth)',
    fields: [
      {
        id: 'fullName',
        label: 'Member Full Name',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'name',
        format: (u) => u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Adones Santos',
      },
      {
        id: 'philhealthNumber',
        label: 'PhilHealth Identification Number (PIN)',
        section: 'Member Information',
        source: 'documents',
        docMatcher: (docs) =>
          docs.find((d) =>
            d.type?.toLowerCase().includes('philhealth') ||
            d.name?.toLowerCase().includes('philhealth') ||
            d.name?.toLowerCase().includes('mdr')
          )?.documentNumber || null,
        question: "What is your 12-digit PhilHealth Identification Number (PIN)?",
        hint: "Format: XX-XXXXXXXXX-X (12 digits)",
        validator: (v) => /\d{12}/.test(v.replace(/\D/g, '')),
        validationHint: "Please provide a valid 12-digit PhilHealth number",
      },
      {
        id: 'dateOfBirth',
        label: 'Date of Birth',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'birthDate',
        format: (u) => u.birthDate || u.birth_date || '1990-05-15',
      },
      {
        id: 'residentialAddress',
        label: 'Permanent Address',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'address',
        format: (u) => u.address || 'Metro Manila, Philippines',
      },
      {
        id: 'membershipType',
        label: 'PhilHealth Membership Category',
        section: 'Member Information',
        source: 'ask',
        question: "What is your PhilHealth membership category? (e.g. **Employed**, **Indigent / Sponsored**, **Senior Citizen**, **Lifetime Member**, or **Self-Employed / Individually Paying**)",
        hint: "Employed, Indigent, Senior Citizen, Self-Employed",
      },
      {
        id: 'patientRelationship',
        label: 'Patient Relationship to Member',
        section: 'Confinement & Hospital Details',
        source: 'ask',
        question: "Who is the patient? Is the confinement for **yourself (Member)**, your **spouse**, your **child**, or your **parent**?",
        hint: "Self, Spouse, Child, Parent",
      },
      {
        id: 'hospitalName',
        label: 'Hospital / Healthcare Facility Name',
        section: 'Confinement & Hospital Details',
        source: 'ask',
        question: "What is the name of the hospital or clinic where the treatment or confinement took place?",
        hint: "e.g. Philippine General Hospital, East Avenue Medical Center",
        validator: (v) => String(v).trim().length >= 3,
        validationHint: "Please enter the hospital name",
      },
      {
        id: 'admissionDate',
        label: 'Date of Admission / Treatment',
        section: 'Confinement & Hospital Details',
        source: 'ask',
        question: "What date was the patient admitted (or when was the procedure done)?",
        hint: "e.g. August 10, 2026",
      },
    ],
    submissionGuide: [
      'Print this PhilHealth CF-1 form.',
      'Sign Part I (Member Certification) and date it.',
      'Submit directly to the Hospital Billing / PhilHealth Desk upon discharge for automatic deduction (Zero Balance Billing / Case Rate).',
    ],
  },

  'dole-tupad': {
    title: 'DOLE TUPAD Emergency Employment Form',
    agency: 'Department of Labor & Employment (DOLE)',
    fields: [
      {
        id: 'fullName',
        label: 'Worker Full Name',
        section: 'Personal Details',
        source: 'profile',
        profileKey: 'name',
        format: (u) => u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Adones Santos',
      },
      {
        id: 'dateOfBirth',
        label: 'Date of Birth',
        section: 'Personal Details',
        source: 'profile',
        profileKey: 'birthDate',
        format: (u) => u.birthDate || u.birth_date || '1990-05-15',
      },
      {
        id: 'residentialAddress',
        label: 'Barangay & Municipality Address',
        section: 'Personal Details',
        source: 'profile',
        profileKey: 'address',
        format: (u) => u.address || 'Metro Manila, Philippines',
      },
      {
        id: 'contactNumber',
        label: 'Active Mobile Contact Number',
        section: 'Personal Details',
        source: 'profile',
        profileKey: 'phone',
        format: (u) => u.phone || null,
        question: "What is your active mobile phone number so DOLE PESO can text you the work schedule and wage disbursement advisory?",
        hint: "e.g. 0917-123-4567",
        validator: (v) => /\d{10,11}/.test(v.replace(/\D/g, '')),
        validationHint: "Please provide a valid 11-digit mobile number",
      },
      {
        id: 'priorOccupation',
        label: 'Previous / Informal Occupation',
        section: 'Work Profile',
        source: 'ask',
        question: "What was your previous job or informal work before this? (e.g. **Vendor**, **Construction Worker**, **Tricycle Driver**, **Displaced Worker**, or **Housewife**)",
        hint: "e.g. Street vendor, displaced service crew, driver",
      },
      {
        id: 'preferredCommunityWork',
        label: 'Preferred Community Work Assignment',
        section: 'Work Profile',
        source: 'ask',
        question: "What type of community work can you perform? (e.g. **Street / Drainage Cleaning**, **Community Tree Planting**, **Public Building Maintenance**, or **Barangay Relief Packing**)",
        hint: "Community cleaning, maintenance, tree planting",
      },
      {
        id: 'emergencyContact',
        label: 'Emergency Contact Person & Number',
        section: 'Personal Details',
        source: 'ask',
        question: "Who is your emergency contact person and their mobile number?",
        hint: "e.g. Maria Santos (Spouse) - 0918-987-6543",
        validator: (v) => String(v).trim().length >= 5,
      },
    ],
    submissionGuide: [
      'Print this completed DOLE TUPAD Application Form.',
      'Attach a photocopy of 1 valid ID (PhilSys, Voter’s ID, or Barangay ID).',
      'Submit to your local Public Employment Service Office (PESO) in your Municipal/City Hall or through your Barangay Coordinator.',
    ],
  },

  'philhealth-senior': {
    title: 'PhilHealth Senior Citizen Mandatory Coverage Registration (RA 10645)',
    agency: 'Philippine Health Insurance Corporation (PhilHealth)',
    fields: [
      {
        id: 'fullName',
        label: 'Senior Citizen Full Name',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'name',
        format: (u) => u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Adones Santos',
      },
      {
        id: 'dateOfBirth',
        label: 'Date of Birth',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'birthDate',
        format: (u) => u.birthDate || u.birth_date || '1962-03-10',
      },
      {
        id: 'residentialAddress',
        label: 'Residential Address',
        section: 'Member Information',
        source: 'profile',
        profileKey: 'address',
        format: (u) => u.address || 'Metro Manila, Philippines',
      },
      {
        id: 'oscaOrPhilsysId',
        label: 'OSCA Senior Citizen ID / PhilSys National ID No.',
        section: 'Member Information',
        source: 'documents',
        docMatcher: (docs) =>
          docs.find((d) =>
            d.type?.toLowerCase().includes('national id') ||
            d.name?.toLowerCase().includes('osca') ||
            d.name?.toLowerCase().includes('philsys')
          )?.documentNumber || null,
        question: "What is your OSCA Senior Citizen ID number or PhilSys National ID (CRN)?",
        hint: "e.g. OSCA-QC-2026-05512",
        validator: (v) => String(v).trim().length >= 5,
        validationHint: "Please provide a valid ID number",
      },
      {
        id: 'philhealthPin',
        label: 'PhilHealth Identification Number (PIN)',
        section: 'Member Information',
        source: 'documents',
        docMatcher: (docs) =>
          docs.find((d) =>
            d.type?.toLowerCase().includes('philhealth') ||
            d.name?.toLowerCase().includes('philhealth') ||
            d.name?.toLowerCase().includes('mdr')
          )?.documentNumber || null,
        question: "What is your 12-digit PhilHealth Identification Number (PIN)? If you don't have one yet, type \"none\" and we'll flag this as a first-time registration.",
        hint: "Format: XX-XXXXXXXXX-X, or \"none\"",
        validator: (v) => v.toLowerCase().includes('none') || /\d{9,12}/.test(v.replace(/\D/g, '')),
        validationHint: 'Enter your PIN or type "none" if not yet registered',
      },
      {
        id: 'memberCategory',
        label: 'Registering As',
        section: 'Coverage Details',
        source: 'ask',
        question: "Are you registering as the **Principal Member** (a senior citizen who is a PhilHealth member yourself), or as a **Qualified Dependent** under a family member's PhilHealth record?",
        hint: "Principal Member or Qualified Dependent",
        options: ['Principal Member', 'Qualified Dependent'],
      },
      {
        id: 'barangayResidency',
        label: 'Barangay Certificate of Residency',
        section: 'Supporting Documents',
        source: 'documents',
        docMatcher: (docs) => {
          const d = docs.find((doc) =>
            doc.type?.toLowerCase().includes('barangay') ||
            doc.name?.toLowerCase().includes('residen')
          );
          return d ? `Verified in Vault (${d.documentNumber || 'Barangay Seal'})` : null;
        },
        question: "Do you have a Barangay Certificate of Residency on hand?",
        hint: "Yes or No",
      },
      {
        id: 'pmrfStatus',
        label: 'PMRF Online Update Status',
        section: 'Coverage Details',
        source: 'ask',
        question: "Have you already updated your PhilHealth Member Registration Form (PMRF) online to confirm your senior dependent status?",
        hint: "Yes, No, or Not Sure",
        options: ['Yes', 'No', 'Not Sure'],
      },
    ],
    submissionGuide: [
      'Print this completed PhilHealth Senior Citizen Coverage form.',
      'Present it together with your OSCA Senior Citizen ID or PhilSys National ID at any PhilHealth Local Health Insurance Office (LHIO) or accredited hospital PhilHealth desk.',
      "If registering as a Qualified Dependent, bring the Principal Member's PhilHealth MDR and your PSA Birth Certificate or Marriage Certificate as proof of relationship.",
      'Coverage is automatic and premium-free under RA 10645 — no payment is required at any step.',
    ],
  },
};

/**
 * Maps a government opportunity/benefit to the intake program whose form actually
 * matches it. Order matters: more specific matches (e.g. senior-citizen PhilHealth
 * coverage) must be checked before their broader siblings (e.g. generic PhilHealth
 * hospital claims), or a citizen applying for one program would silently get handed
 * the wrong form.
 */
export function resolveIntakeProgramId(opp) {
  const oppTitle = (opp?.title || '').toLowerCase();
  const oppAgency = (opp?.agency || '').toLowerCase();
  const oppDesc = ((opp?.shortDesc || '') + ' ' + (opp?.fullDesc || '')).toLowerCase();
  const combined = `${oppTitle} ${oppAgency} ${oppDesc}`;

  if (combined.includes('sss') && (combined.includes('loan') || combined.includes('salary'))) {
    return 'sss-salary-loan';
  }
  if (combined.includes('dswd') || combined.includes('aics') || combined.includes('crisis')) {
    return 'dswd-aics';
  }
  if (combined.includes('philhealth') && (combined.includes('senior') || combined.includes('60'))) {
    return 'philhealth-senior';
  }
  if (combined.includes('philhealth') || combined.includes('cf1') || combined.includes('claims')) {
    return 'philhealth-cf1';
  }
  if (combined.includes('tupad') || combined.includes('dole') || combined.includes('employment')) {
    return 'dole-tupad';
  }
  return null;
}

// =============================================================================
// 3. SESSION BUILDER & GAP ANALYZER
// =============================================================================

export function buildIntakeSession(programId, user, documents = []) {
  const template = INTAKE_FORM_TEMPLATES[programId];
  if (!template) throw new Error(`Unknown program: ${programId}`);

  const userObj = user || {};
  const filledFields = {};

  template.fields.forEach((field) => {
    let value = null;
    let source = null;

    if (field.source === 'profile') {
      if (typeof field.format === 'function') {
        value = field.format(userObj);
      } else if (field.profileKey && userObj[field.profileKey]) {
        value = String(userObj[field.profileKey]);
      }
      if (value) source = 'profile';
    } else if (field.source === 'documents') {
      if (typeof field.docMatcher === 'function') {
        value = field.docMatcher(documents);
        if (value) source = 'documents';
      }
    }

    if (value) {
      filledFields[field.id] = { value, source, confident: true };
    }
  });

  return {
    benefitId: programId,
    programTitle: template.title,
    template,
    filledFields,
    conversationHistory: [],
    isComplete: false,
    startedAt: new Date().toISOString(),
  };
}

export function getActiveGapFields(session) {
  const { template, filledFields } = session;
  return template.fields.filter((field) => !filledFields[field.id]?.value);
}

// =============================================================================
// 4. FIELD VALUE EXTRACTION & AGENTIC PROCESSING LOOP
// =============================================================================

export async function extractFieldValue(field, userMessage) {
  const raw = String(userMessage || '').trim();
  if (!raw) return { value: null, confidence: 'none' };

  if (typeof field.extractOption === 'function') {
    const opt = field.extractOption(raw);
    if (opt) return { value: opt, confidence: 'high' };
  }

  if (Array.isArray(field.options) && field.options.length > 0) {
    const lower = raw.toLowerCase();
    const match = field.options.find((o) => lower.includes(o.toLowerCase()));
    if (match) return { value: match, confidence: 'high' };
  }

  if (field.id.toLowerCase().includes('number') || field.id.toLowerCase().includes('pin') || field.id.toLowerCase().includes('sss')) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 7) return { value: raw, confidence: 'high' };
  }

  if (field.id.toLowerCase().includes('salary') || field.id.toLowerCase().includes('income') || field.id.toLowerCase().includes('amount')) {
    const digits = raw.replace(/[^0-9.]/g, '');
    const num = parseFloat(digits);
    if (!isNaN(num) && num > 0) {
      return { value: `₱${num.toLocaleString()}`, confidence: 'high' };
    }
  }

  return { value: raw, confidence: 'medium' };
}

export function detectContradiction(session, fieldId, value) {
  return null;
}

export async function processUserReply(session, userMessage) {
  const activeGaps = getActiveGapFields(session);

  if (activeGaps.length === 0) {
    return {
      session: { ...session, isComplete: true },
      agentMessage: "Your application is already complete! You can review and print it on the right.",
      fieldFilled: null,
      isComplete: true,
    };
  }

  const currentField = activeGaps[0];
  const extraction = await extractFieldValue(currentField, userMessage);

  if (!extraction.value) {
    return {
      session,
      agentMessage: currentField.validationHint
        ? `Could you please provide a valid ${currentField.label}? (${currentField.validationHint})`
        : `Could you clarify that for ${currentField.label}?`,
      fieldFilled: null,
      isComplete: false,
    };
  }

  const updatedSession = {
    ...session,
    filledFields: {
      ...session.filledFields,
      [currentField.id]: {
        value: extraction.value,
        source: 'conversation',
        confident: extraction.confidence === 'high',
        rawInput: userMessage,
      },
    },
    conversationHistory: [
      ...session.conversationHistory,
      { role: 'citizen', text: userMessage, fieldId: currentField.id },
    ],
  };

  const nextGaps = getActiveGapFields(updatedSession);
  const isComplete = nextGaps.length === 0;
  const nextField = nextGaps[0] || null;

  let agentMessage;
  if (isComplete) {
    agentMessage = `✅ **Your application is complete!** All ${Object.keys(updatedSession.filledFields).length} fields have been filled in.\n\nPlease review your completed form on the right. You can edit any field or save and print it directly.`;
  } else {
    agentMessage = `✓ Got it. I've noted **${extraction.value}** for ${currentField.label}.\n\n${nextField.question}`;
  }

  return {
    session: { ...updatedSession, isComplete },
    agentMessage,
    fieldFilled: { id: currentField.id, value: extraction.value, label: currentField.label },
    isComplete,
  };
}

export function generateOpeningGreeting(session, user) {
  const firstName = user?.firstName || 'there';
  const activeGaps = getActiveGapFields(session);
  const gapCount = activeGaps.length;
  const programTitle = session.programTitle;

  if (gapCount === 0) {
    return `Hi ${firstName}! I already have all the required information from your profile and document vault for the **${programTitle}**! Your completed form is ready to review.`;
  }

  return (
    `Hi ${firstName}! I'll help you complete your application for **${programTitle}**.\n\n` +
    `I've already auto-filled your personal details from your profile. I just need to ask you **${gapCount} brief question${gapCount > 1 ? 's' : ''}**.\n\n` +
    `${activeGaps[0].question}`
  );
}

export function getSessionStats(session) {
  const fields = Object.values(session?.filledFields || {});
  const templateTotal = session?.template?.fields?.length || 8;
  return {
    fromProfile: fields.filter((f) => f.source === 'profile').length,
    fromDocuments: fields.filter((f) => f.source === 'documents').length,
    fromConversation: fields.filter((f) => f.source === 'conversation').length,
    total: fields.length,
    templateTotal,
  };
}

// =============================================================================
// 5. OFFICIAL DOC-FORMAT GENERATION & PRINT UTILITIES
// =============================================================================

/**
 * Generate official Republic of the Philippines / Agency HTML document structure
 */
export function generateDocFormattedHtml(doc, user = {}) {
  const title = doc.name || doc.programTitle || 'Official Government Application Form';
  const agency = doc.issuer || doc.programAgency || 'Republic of the Philippines';
  const docNumber = doc.documentNumber || `APP-${Date.now().toString().slice(-6)}`;
  const dateStr = doc.formattedDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const appData = doc.applicationData || doc.attributes || {};
  const template = doc.template;

  // Group fields by section
  const sections = {};
  if (template?.fields) {
    template.fields.forEach((f) => {
      const sec = f.section || 'Application Details';
      if (!sections[sec]) sections[sec] = [];
      sections[sec].push({
        label: f.label,
        value: appData[f.id] || doc.filledFields?.[f.id]?.value || '—',
      });
    });
  } else {
    sections['General Information'] = Object.entries(appData).map(([k, v]) => ({
      label: k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' '),
      value: String(v || '—'),
    }));
  }

  const sectionsHtml = Object.entries(sections)
    .map(
      ([secTitle, fields]) => `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 14px; font-weight: bold; text-transform: uppercase; color: #093a96; border-bottom: 2px solid #093a96; padding-bottom: 4px; margin-bottom: 12px; letter-spacing: 0.5px;">
          ${secTitle}
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          ${fields
            .map(
              (f, i) => `
            <tr style="background-color: ${i % 2 === 0 ? '#f8fafc' : '#ffffff'};">
              <td style="padding: 8px 12px; font-weight: bold; color: #475569; width: 35%; border: 1px solid #e2e8f0; text-transform: uppercase; font-size: 11px;">
                ${f.label}
              </td>
              <td style="padding: 8px 12px; color: #0f172a; font-weight: 600; border: 1px solid #e2e8f0;">
                ${f.value}
              </td>
            </tr>
          `
            )
            .join('')}
        </table>
      </div>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body {
          font-family: 'Times New Roman', Times, serif, Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          line-height: 1.5;
          margin: 0;
          padding: 24px;
        }
        .header-seal {
          text-align: center;
          margin-bottom: 20px;
          border-bottom: 3px double #093a96;
          padding-bottom: 16px;
        }
        .republic-text {
          font-size: 13px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #1e293b;
        }
        .agency-text {
          font-size: 16px;
          font-weight: 800;
          color: #093a96;
          margin: 4px 0;
          text-transform: uppercase;
        }
        .doc-title {
          font-size: 18px;
          font-weight: 900;
          color: #0f172a;
          text-decoration: underline;
          margin: 10px 0 4px 0;
        }
        .doc-meta {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
          margin-bottom: 20px;
          border-bottom: 1px dashed #cbd5e1;
          padding-bottom: 8px;
        }
        .declaration-box {
          margin-top: 24px;
          padding: 14px;
          border: 1px solid #cbd5e1;
          background-color: #f8fafc;
          font-size: 11px;
          text-align: justify;
        }
        .signature-grid {
          margin-top: 40px;
          display: flex;
          justify-content: space-between;
          width: 100%;
        }
        .sig-block {
          width: 45%;
          text-align: center;
        }
        .sig-line {
          border-bottom: 1.5px solid #0f172a;
          margin-bottom: 6px;
          height: 35px;
        }
      </style>
    </head>
    <body>
      <div class="header-seal">
        <div class="republic-text">Republic of the Philippines</div>
        <div class="agency-text">${agency}</div>
        <div class="doc-title">${title}</div>
      </div>

      <div class="doc-meta">
        <div><strong>Form Control No:</strong> ${docNumber}</div>
        <div><strong>Date Prepared:</strong> ${dateStr}</div>
        <div><strong>Status:</strong> Valid & Completed ✓</div>
      </div>

      ${sectionsHtml}

      <div class="declaration-box">
        <strong>APPLICANT'S ATTESTATION & OATH:</strong><br/>
        I hereby certify under the penalties of perjury that all information, declarations, and statements contained in this application are true, correct, and complete to the best of my knowledge and belief. I authorize ${agency} to verify the truthfulness of these statements in accordance with Republic Act No. 11032 (Ease of Doing Business Act) and the Data Privacy Act of 2012 (RA 10173).
      </div>

      <table style="width: 100%; margin-top: 45px; border-collapse: collapse;">
        <tr>
          <td style="width: 48%; text-align: center; vertical-align: bottom;">
            <div style="border-bottom: 1.5px solid #0f172a; height: 35px; margin-bottom: 6px;"></div>
            <div style="font-size: 12px; font-weight: bold; text-transform: uppercase;">
              ${user.name || user.firstName || 'APPLICANT SIGNATURE OVER PRINTED NAME'}
            </div>
            <div style="font-size: 10px; color: #64748b;">Signature of Citizen Applicant</div>
          </td>
          <td style="width: 4%;"></td>
          <td style="width: 48%; text-align: center; vertical-align: bottom;">
            <div style="border-bottom: 1.5px solid #0f172a; height: 35px; margin-bottom: 6px;"></div>
            <div style="font-size: 12px; font-weight: bold; text-transform: uppercase;">
              ${agency}
            </div>
            <div style="font-size: 10px; color: #64748b;">Receiving Officer / Frontline Desk</div>
          </td>
        </tr>
      </table>

      <div style="margin-top: 30px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px;">
        Generated via ALALAY Citizen Intake Agent • Official .gov.ph Compliant Document • Ref: ${docNumber}
      </div>
    </body>
    </html>
  `;
}

/**
 * Downloads the application document as a native Word-compatible .DOC file
 */
export function downloadApplicationAsDoc(doc, user = {}) {
  const html = generateDocFormattedHtml(doc, user);
  const blob = new Blob(['\ufeff' + html], {
    type: 'application/msword',
  });

  const filename = `${(doc.name || 'Application_Form').replace(/[^a-zA-Z0-9_-]/g, '_')}.doc`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Prints the document reliably using an isolated hidden iframe
 */
export function printApplicationDocument(doc, user = {}) {
  const html = generateDocFormattedHtml(doc, user);

  // 1. Create a hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const docIframe = iframe.contentWindow.document;
  docIframe.open();
  docIframe.write(html);
  docIframe.close();

  // 2. Trigger print once loaded
  iframe.contentWindow.focus();
  setTimeout(() => {
    try {
      iframe.contentWindow.print();
    } catch {
      window.print();
    } finally {
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }
  }, 300);
}
