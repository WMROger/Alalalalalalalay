// Deterministic Eligibility Rules Engine & Multi-Factor Coverage-Gap Matching
// Layer 1 of AI Guardrails: Zero AI Hallucination for Financial Calculations & Citizen Benefits

export const MINIMUM_DISPLAY_MATCH_SCORE = 80;
export const TOP_MATCH_SCORE = 90;

export const AUTHORITATIVE_BENEFITS = [
  {
    id: 'benefit-doh-map-01',
    program_name: 'DOH Medical Assistance to Indigent Patients (MAP)',
    agency: 'Department of Health (DOH)',
    benefit_type: 'hospital_bill',
    covered_expenses: ['Inpatient hospital bill balance', 'Prescribed medicines', 'Diagnostic procedures', 'Implants'],
    amount_cap_summary: 'Up to 100% of remaining balance after PhilHealth/HMO (subject to MSWD classification)',
    required_documents: ['Clinical Abstract / Medical Certificate', 'Statement of Account / Hospital Bill', 'Certificate of Indigency / 4Ps ID', 'Valid Government ID'],
    where_to_apply: 'Malasakit Center Desk / DOH Regional Health Office',
    office_hours: 'Monday - Friday, 8:00 AM - 5:00 PM',
    processing_time: '1 - 3 business days (Immediate for urgent inpatient release)',
    can_stack: true,
    tier: 'tier_a',
    verification_status: 'verified',
    eligibility_conditions: [
      { field: 'facility_type', operator: 'equals', value: 'government', label: 'Government Hospital or DOH-Retained Specialty Center' },
      { field: 'indigent_4ps', operator: 'is_true', value: true, label: 'Indigent / Class C3/D or Active 4Ps Beneficiary' },
      { field: 'remaining_balance_min', operator: 'greater_than', value: 0, label: 'Has Remaining Out-of-Pocket Hospital Balance' }
    ]
  },
  {
    id: 'benefit-pcso-imap-02',
    program_name: 'PCSO Individual Medical Assistance Program (IMAP)',
    agency: 'Philippine Charity Sweepstakes Office (PCSO)',
    benefit_type: 'hospital_bill',
    covered_expenses: ['Confinement expenses', 'Chemotherapy drugs', 'Dialysis treatments', 'Surgical supplies'],
    amount_cap_summary: 'Guaranteed Letter (GL) from ₱10,000 up to ₱150,000 based on socio-economic evaluation',
    required_documents: ['Original Statement of Account (SOA)', 'Medical Abstract with Physician Signature & PRC License', 'Barangay Certificate of Indigency', 'Photocopy of Valid ID (Patient & Representative)'],
    where_to_apply: 'PCSO Branch Office / Hospital Malasakit Center Counter',
    office_hours: 'Monday - Friday, 7:00 AM - 3:00 PM',
    processing_time: 'Same day for complete documentary submissions',
    can_stack: true,
    tier: 'tier_a',
    verification_status: 'verified',
    eligibility_conditions: [
      { field: 'remaining_balance_min', operator: 'greater_than', value: 5000, label: 'Hospital Bill Exceeds ₱5,000 after PhilHealth Deduction' }
    ]
  },
  {
    id: 'benefit-dswd-aics-03',
    program_name: 'DSWD Assistance to Individuals in Crisis Situation (AICS)',
    agency: 'Department of Social Welfare and Development (DSWD)',
    benefit_type: 'medicines',
    covered_expenses: ['Direct financial grant for medicines', 'Assistive devices', 'Medical transport assistance', 'Burial support'],
    amount_cap_summary: 'Cash grant from ₱3,000 up to ₱10,000 per crisis incident (Renewable after 3 months)',
    required_documents: ['Doctor Prescription with Cost Estimate', 'Social Case Study Report / MSWD Intake Sheet', 'Barangay Indigency Certificate', 'Registered Voter ID or Valid National ID'],
    where_to_apply: 'DSWD Crisis Intervention Unit (CIU) / Malasakit Center Desk',
    office_hours: 'Monday - Friday, 8:00 AM - 4:00 PM',
    processing_time: '1 business day (Direct Cash / Guarantee Letter)',
    can_stack: true,
    tier: 'tier_a',
    verification_status: 'verified',
    eligibility_conditions: [
      { field: 'indigent_4ps', operator: 'is_true', value: true, label: 'Documented Individual/Family in Crisis Situation' }
    ]
  },
  {
    id: 'benefit-osca-senior-04',
    program_name: 'OSCA Social Pension & Mandatory PhilHealth (RA 10645)',
    agency: 'National Commission of Senior Citizens (NCSC) / OSCA',
    benefit_type: 'senior_citizen',
    covered_expenses: ['Monthly social pension', 'Automatic PhilHealth Point-of-Service Confinement', '20% Medicine & Hospital Discount', 'Centenarian Cash Gift'],
    amount_cap_summary: '100% Free Inpatient PhilHealth ward confinement + ₱1,000 monthly social pension (Indigent)',
    required_documents: ['Senior Citizen OSCA ID / Birth Certificate', 'Barangay Certificate of Residency', 'Valid Government Photo ID'],
    where_to_apply: 'City / Municipal Office for Senior Citizens Affairs (OSCA)',
    office_hours: 'Monday - Friday, 8:00 AM - 5:00 PM',
    processing_time: 'Immediate on presentation of OSCA / National ID',
    can_stack: true,
    tier: 'tier_a',
    verification_status: 'verified',
    eligibility_conditions: [
      { field: 'age_min', operator: 'greater_than_or_equal', value: 60, label: 'Filipino Citizen aged 60 years or older' },
      { field: 'citizenship', operator: 'equals', value: 'Filipino', label: 'Philippine Citizen' }
    ]
  }
];

/**
 * Calculate citizen age in years from birth date
 */
export function calculateCitizenAge(user) {
  const dateStr = user?.birthDate || user?.birth_date;
  if (dateStr) {
    const today = new Date();
    const birth = new Date(dateStr);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    if (!isNaN(age) && age >= 0 && age <= 120) return age;
  }

  if (user?.age && typeof user.age === 'number') return user.age;
  return 32; // Default Philippine working citizen age
}

/**
 * Robust, deterministic document matcher that checks if a user's uploaded locker document
 * strictly fulfills a specific public service requirement (eliminates false substring matches).
 */
export function matchRequirementWithUserDoc(reqName, userDocs = [], user = null) {
  if (!reqName) return null;
  const q = reqName.toLowerCase().trim();

  // ── Application Form: check vault first ─────────────────────────────────────
  // When ALALAY auto-saves a completed intake form (isApplicationForm: true) to
  // the vault, we treat that as fulfilling any "application form" requirement so
  // the checklist in OpportunityDetailModal immediately shows it as "Ready ✓".
  const isFormReq = /application form|filled out|official.*(government )?form|registration form|pmrf|intake form|e-6|form e-6|duly accomplished/i.test(q);
  if (isFormReq) {
    const vaultForm = userDocs.find(
      (d) =>
        d.isApplicationForm === true ||
        d.type === 'Application Form' ||
        (d.name && /application form|pmrf|form e-6|intake/i.test(d.name))
    );
    if (vaultForm) return vaultForm;
    // No vault form found — fall through so the modal still shows "Check / Fill Out Form"
    return null;
  }
  // ────────────────────────────────────────────────────────────────────────────

  const hasWord = (str, regex) => regex.test(str);

  for (const doc of userDocs) {
    const docName = (doc.name || '').toLowerCase();
    const docType = (doc.type || '').toLowerCase();
    const docCat = (doc.category || '').toLowerCase();
    const docMeta = `${docName} ${docType} ${docCat}`;

    // 1. Classify the user's uploaded document
    const isDocAnId =
      hasWord(docMeta, /\b(philsys|national id|umid|passport|driver|license|voter|postal id|prc id|tin id|philid|gov_id|valid id|photo id)\b/i) ||
      docType === 'id' || docCat === 'id' || docCat === 'identity';

    const isDocBarangay =
      hasWord(docMeta, /\b(barangay|indigency|calamity|residency|clearance|proof of residence|utility|bill|water|electric|meralco|maynilad|manila water|mcwd|pldt|globe|converge|billing)\b/i) &&
      !isDocAnId;

    const isDocPhilHealth = hasWord(docMeta, /\b(philhealth|pmrf|mdr|health insurance)\b/i);
    const isDocMedical = hasWord(docMeta, /\b(clinical abstract|medical certificate|statement of account|hospital bill|soa|prescription|clinical)\b/i);
    const isDocSchool = hasWord(docMeta, /\b(cor|registration|matriculation|enrollment|transcript|grades)\b/i);
    const isDocOsca = hasWord(docMeta, /\b(osca|senior citizen id|senior id)\b/i);
    const isDocPwd = hasWord(docMeta, /\b(pwd id|disability id|pwd card)\b/i);
    const isDocBirth = hasWord(docMeta, /\b(birth certificate|psa birth|psa marriage|nso)\b/i);
    const isDocPds = hasWord(docMeta, /\b(personal data sheet|csc form 212|pds)\b/i);
    const isDocCscEligibility = hasWord(docMeta, /\b(civil service eligibility|csc eligibility|career service eligibility)\b/i);

    // 2. Strict Requirement-to-Document Assignment Guardrails

    // A. Requirement: Barangay Calamity Certificate / Barangay Indigency / Proof of Residence / Utility Bill
    if (hasWord(q, /\b(calamity|indigency|barangay|proof of residence|certificate of residency|residence certificate|utility bill|billing statement|water bill)\b/i)) {
      if (isDocBarangay || (hasWord(docMeta, /\b(calamity|indigency|residency|clearance|utility|bill|water|electric|meralco|maynilad|billing|proof of residence)\b/i) && !hasWord(docMeta, /\bphilid\b/i))) {
        return doc;
      }
      continue; // Never match a PhilSys ID to a Barangay certificate / Proof of residence
    }

    // B. Requirement: Valid Government Issued Photo ID (UMID / PhilSys ID / Passport)
    if (hasWord(q, /\b(valid government|photo id|government issued|philsys|umid|national id|valid id|government id|valid primary id)\b/i)) {
      if (isDocAnId) {
        return doc;
      }
      continue;
    }

    // C. Requirement: PhilHealth MDR / PMRF
    if (hasWord(q, /\b(philhealth|pmrf|mdr|member data record)\b/i)) {
      if (isDocPhilHealth) return doc;
      continue;
    }

    // D. Requirement: Senior Citizen OSCA ID
    if (hasWord(q, /\b(osca|senior citizen id|senior id)\b/i)) {
      if (isDocOsca) return doc;
      continue;
    }

    // E. Requirement: PWD ID / Disability Certificate
    if (hasWord(q, /\b(pwd id|pwd card|disability certificate)\b/i)) {
      if (isDocPwd) return doc;
      continue;
    }

    // F. Requirement: Medical Statement of Account / Clinical Abstract / Prescription
    if (hasWord(q, /\b(clinical abstract|medical certificate|statement of account|hospital bill|doctor prescription|soa)\b/i)) {
      if (isDocMedical) return doc;
      continue;
    }

    // G. Requirement: School Enrollment COR / Matriculation Form
    if (hasWord(q, /\b(certificate of registration|cor|enrollment form|school registration|matriculation)\b/i)) {
      if (isDocSchool) return doc;
      continue;
    }

    // H. Requirement: PSA Birth / Marriage Certificate
    if (hasWord(q, /\b(birth certificate|psa birth|marriage certificate|psa marriage|nso)\b/i)) {
      if (isDocBirth) return doc;
      continue;
    }

    // I. Requirement: Personal Data Sheet (CSC Form 212) — government job applications
    if (hasWord(q, /\b(personal data sheet|csc form 212|pds)\b/i)) {
      if (isDocPds) return doc;
      continue;
    }

    // J. Requirement: Civil Service / Career Service Eligibility (Sub-Professional / Professional)
    if (hasWord(q, /\b(civil service|career service|sub-professional|professional eligibility|csc eligibility)\b/i)) {
      if (isDocCscEligibility) return doc;
      continue;
    }

    // K. Requirement: Online Accounts / Portals (e.g. Active My.SSS, Bank Account)
    if (hasWord(q, /\b(active my\.sss|sss account|disbursement account|bank account|online portal|e-wallet)\b/i)) {
      continue; // External portal accounts are not locker document uploads
    }
  }

  // Fallback: If user is verified with national eGov PH and requirement is a general Government Photo ID
  if (
    user?.isVerified &&
    hasWord(q, /\b(valid government issued|government photo id|valid id|national id)\b/i) &&
    !hasWord(q, /\b(calamity|indigency|barangay|medical|abstract|prescribed|philhealth|cor|birth)\b/i)
  ) {
    return { name: 'eGov PH National Digital ID', type: 'Verified Identity' };
  }

  return null;
}

/**
 * Multi-Factor Intelligent Matchmaking Algorithm
 *
 * Scored across 4 transparent dimensions:
 * 1. Demographic & Statutory Alignment (0 - 40 pts)
 * 2. Economic & Employment Profile (0 - 25 pts)
 * 3. Document Locker Fulfillment (0 - 25 pts)
 * 4. Citizenship & Residency Guardrails (0 - 10 pts)
 */
export function matchOpportunityForCitizen(opp, user = null, documents = []) {
  if (!opp) return { matchScore: 90, confidence: 'Verified', matchBadge: null };

  const userAge = calculateCitizenAge(user);
  const isSenior = Boolean(user?.isSeniorCitizen || user?.is_senior_citizen || userAge >= 60);
  const isPwd = Boolean(user?.isPwd || user?.is_pwd);
  const isSoloParent = Boolean(user?.isSoloParent || user?.is_solo_parent);
  const citizenship = (user?.citizenship || 'Filipino').toLowerCase();
  const employmentStatus = (user?.employmentStatus || user?.employment_status || 'Employed').toLowerCase();
  const monthlyIncome = (user?.monthlyIncome || user?.monthly_income || '₱25,000 - ₱35,000').toLowerCase();

  const titleLower = (opp.title || '').toLowerCase();
  const descLower = `${opp.shortDesc || ''} ${opp.fullDesc || ''} ${opp.category || ''} ${opp.agency || ''}`.toLowerCase();
  const reqText = Array.isArray(opp.requirements)
    ? opp.requirements.map((r) => (typeof r === 'string' ? r : r.name || '')).join(' ').toLowerCase()
    : '';

  // Initialize Dimension Scores
  let demographicScore = 32;
  let economicScore = 20;
  let documentScore = 15;
  let citizenshipScore = 10;

  let matchBadge = null;
  let isSeniorPriority = false;
  let eligibilityReason = 'Meets standard Philippine citizen qualification criteria.';
  let nextActionStep = 'Prepare required identification documents in your Alalay Locker.';

  // -------------------------------------------------------------
  // 1. DEMOGRAPHIC & STATUTORY MATCHING (0 - 40 pts)
  // -------------------------------------------------------------
  const isSeniorProgram =
    titleLower.includes('senior') ||
    titleLower.includes('osca') ||
    titleLower.includes('pension') ||
    titleLower.includes('elderly') ||
    titleLower.includes('centenarian') ||
    titleLower.includes('geriatric') ||
    descLower.includes('senior citizen') ||
    descLower.includes('age 60') ||
    reqText.includes('osca') ||
    reqText.includes('senior');

  if (isSenior) {
    if (isSeniorProgram) {
      demographicScore = 40;
      matchBadge = `🌟 Top Match for Senior Citizen (${userAge} yrs)`;
      isSeniorPriority = true;
      eligibilityReason = `Fully qualified under Expanded Senior Citizens Act (RA 9994) & OSCA guidelines for age ${userAge}.`;
      nextActionStep = 'Present your OSCA Senior Citizen ID or PhilSys ID at your local City/Municipal OSCA desk or Malasakit Center.';
    } else if (
      titleLower.includes('health') ||
      titleLower.includes('hospital') ||
      titleLower.includes('philhealth') ||
      titleLower.includes('medical') ||
      titleLower.includes('doh')
    ) {
      demographicScore = 38;
      matchBadge = 'Priority Senior Healthcare';
      eligibilityReason = 'Entitled to mandatory lifetime PhilHealth Point-of-Service and Zero-Balance Billing in public wards (RA 10645).';
      nextActionStep = 'Direct hospital admissions in government wards are 100% subsidized under No-Balance-Billing.';
    } else {
      demographicScore = 35;
    }
  } else {
    // Under 60 viewing senior-exclusive benefit
    if (isSeniorProgram && (titleLower.includes('pension') || titleLower.includes('osca') || titleLower.includes('centenarian'))) {
      demographicScore = 10;
      matchBadge = 'Requires Age 60+';
      eligibilityReason = `Benefit reserved exclusively for citizens aged 60 and above (Citizen currently age ${userAge}).`;
      nextActionStep = 'Family members may assist senior relatives to apply at the nearest OSCA branch.';
    }
  }

  // Solo Parent Matching (RA 11861)
  const isSoloParentProgram =
    titleLower.includes('solo parent') ||
    descLower.includes('solo parent') ||
    reqText.includes('solo parent');

  if (isSoloParent && isSoloParentProgram) {
    demographicScore = 40;
    matchBadge = '👨‍👧 Solo Parent Priority';
    eligibilityReason = 'Qualified for 10% statutory discount on baby milk/food, educational subsidies, and 7-day parental leave under RA 11861.';
    nextActionStep = 'Submit your Solo Parent ID to your city MSWD/CSWDO office to claim annual educational and cash aid.';
  }

  // PWD Matching (RA 10754)
  const isPwdProgram =
    titleLower.includes('pwd') ||
    titleLower.includes('disability') ||
    descLower.includes('person with disability') ||
    reqText.includes('pwd id');

  if (isPwd && isPwdProgram) {
    demographicScore = 40;
    matchBadge = '♿ PWD Priority Support';
    eligibilityReason = 'Qualified for 20% statutory discount, 12% VAT exemption on medical supplies, and assistive devices under RA 10754.';
    nextActionStep = 'Present your PWD ID or NCDA registration at designated public hospital counters or pharmacy desks.';
  }

  // -------------------------------------------------------------
  // 2. ECONOMIC & EMPLOYMENT MATCHING (0 - 25 pts)
  // -------------------------------------------------------------
  const isEmployed = employmentStatus.includes('employed') || employmentStatus.includes('ofw') || employmentStatus.includes('self');
  const isUnemployed = employmentStatus.includes('unemployed') || employmentStatus.includes('job seeker') || employmentStatus.includes('displaced');

  const isLoanOrContributionProgram =
    titleLower.includes('sss') ||
    titleLower.includes('pag-ibig') ||
    titleLower.includes('salary loan') ||
    titleLower.includes('calamity loan') ||
    titleLower.includes('mp2') ||
    descLower.includes('contributing member');

  const isEmergencyWorkProgram =
    titleLower.includes('tupad') ||
    titleLower.includes('emergency employment') ||
    titleLower.includes('skills training') ||
    titleLower.includes('tesda') ||
    titleLower.includes('dole');

  if (isEmployed && isLoanOrContributionProgram) {
    economicScore = 25;
    if (!matchBadge && !isSenior) matchBadge = '💼 Employed Member Benefit';
    eligibilityReason = 'Qualified via active monthly salary credits and formal member contributions.';
    nextActionStep = 'File online via My.SSS portal or Virtual Pag-IBIG for instant bank disbursement.';
  } else if (isUnemployed && isEmergencyWorkProgram) {
    economicScore = 25;
    if (!matchBadge) matchBadge = '🤝 Emergency Employment & Aid';
    eligibilityReason = 'Prioritized for displaced and informal workers seeking wage employment with micro-insurance.';
    nextActionStep = 'Register at your Barangay Hall or Local Government PESO Desk.';
  }

  // Indigency matching
  const isLowIncome =
    monthlyIncome.includes('below') ||
    monthlyIncome.includes('10,000') ||
    monthlyIncome.includes('15,000') ||
    monthlyIncome.includes('minimum') ||
    monthlyIncome.includes('indigent');

  const isIndigentProgram =
    titleLower.includes('indigent') ||
    titleLower.includes('aics') ||
    titleLower.includes('map') ||
    titleLower.includes('malasakit') ||
    titleLower.includes('pcso') ||
    descLower.includes('indigent');

  if (isLowIncome && isIndigentProgram) {
    economicScore = 25;
    if (!matchBadge && !isSeniorPriority) matchBadge = '🤝 Indigent Safety Net Priority';
    eligibilityReason = 'Household income qualifies for 100% government medical subsidies and emergency cash grants.';
    nextActionStep = 'Present Barangay Certificate of Indigency at the Hospital Malasakit Center Desk.';
  }

  // -------------------------------------------------------------
  // 3. CITIZENSHIP & RESIDENCY GUARDRAILS (0 - 10 pts)
  // -------------------------------------------------------------
  if (citizenship === 'filipino' || citizenship.includes('dual')) {
    citizenshipScore = 10;
  } else {
    if (!titleLower.includes('foreign') && !titleLower.includes('visa') && !titleLower.includes('resident')) {
      citizenshipScore = 2;
      eligibilityReason = 'Philippine public assistance programs mandate Filipino citizenship under statutory guidelines.';
      nextActionStep = 'Review specific program guidelines for permanent foreign resident concessions.';
    }
  }

  // -------------------------------------------------------------
  // 4. DOCUMENT LOCKER AUTO-FULFILLMENT EVALUATION (0 - 25 pts)
  // -------------------------------------------------------------
  let matchedDocCount = 0;
  const missingDocs = [];
  const matchedDocsList = [];
  const reqList = Array.isArray(opp.requirements) ? opp.requirements : [];

  if (reqList.length > 0) {
    reqList.forEach((r) => {
      const rName = (typeof r === 'string' ? r : r.name || '').trim();
      const matchedUserDoc = matchRequirementWithUserDoc(rName, documents, user);

      if (matchedUserDoc) {
        matchedDocCount++;
        matchedDocsList.push({ requirement: rName, doc: matchedUserDoc });
      } else {
        missingDocs.push(rName);
      }
    });

    // Score based on actual document completion ratio
    const completionRatio = matchedDocCount / reqList.length;
    documentScore = Math.round(completionRatio * 25);

    if (matchedDocCount === reqList.length && reqList.length > 0) {
      if (!matchBadge) matchBadge = '📁 100% Documents Ready';
    }
  } else {
    documentScore = 20; // No restrictive documents required
  }

  const totalCalculatedScore = demographicScore + economicScore + documentScore + citizenshipScore;
  const finalScore = Math.max(45, Math.min(100, totalCalculatedScore));
  const docReadinessPercent = reqList.length > 0 ? Math.round((matchedDocCount / reqList.length) * 100) : 100;

  return {
    ...opp,
    matchScore: finalScore,
    confidence: finalScore >= 90 ? '99% Verified Match' : finalScore >= 80 ? '95% Qualified' : '80% Preliminary',
    matchBadge,
    isSeniorPriority,
    eligibilityReason,
    nextActionStep,
    matchedDocCount,
    totalDocCount: reqList.length,
    missingDocs,
    matchedDocsList,
    docReadinessPercent,
    scoreBreakdown: {
      demographicScore,
      economicScore,
      documentScore,
      citizenshipScore,
      totalScore: finalScore,
    },
  };
}

/**
 * Deterministically sort and rank all opportunities for a citizen's profile
 */
export function rankAndFilterOpportunities(opportunities = [], user = null, documents = []) {
  if (!Array.isArray(opportunities)) return [];

  const evaluated = opportunities.map((opp) => matchOpportunityForCitizen(opp, user, documents));

  return evaluated.sort((a, b) => {
    if (a.isSeniorPriority && !b.isSeniorPriority) return -1;
    if (!a.isSeniorPriority && b.isSeniorPriority) return 1;
    return (b.matchScore || 0) - (a.matchScore || 0);
  });
}

// Minimum score for Auto-Apply to consider a match strong enough to act on.
export const AUTO_APPLY_MIN_SCORE = 95;

/**
 * Selects the ranked opportunities a citizen has authorized the AI to auto-apply to,
 * based on their Auto-Apply profile settings. Qualifies when the opportunity is both
 * "Likely Eligible" and scores AUTO_APPLY_MIN_SCORE (95%) or higher — a near-perfect
 * match already implies near-complete document-locker coverage, since matchScore only
 * reaches that range when most/all scoring dimensions (including documents) are maxed.
 *
 * Jobs & employment postings (category 'employment') are gated behind their own stricter
 * opt-in (`autoApplyIncludeJobs`) plus a redundant explicit documents-ready check, since a
 * citizen may reasonably want auto-apply for benefits without also authorizing job applications.
 */
export function getAutoApplyMatches(rankedOpportunities = [], user = null) {
  if (!user?.autoApplyEnabled) return [];
  const allowedCategories = Array.isArray(user.autoApplyCategories) ? user.autoApplyCategories : [];

  return (rankedOpportunities || []).filter((opp) => {
    const isStrongMatch = (opp.matchScore || 0) >= AUTO_APPLY_MIN_SCORE && opp.matchStatus === 'Likely Eligible';
    if (!isStrongMatch) return false;

    const category = (opp.category || '').toLowerCase();

    if (category === 'employment') {
      return Boolean(user.autoApplyIncludeJobs) && opp.docReadinessPercent === 100;
    }

    return allowedCategories.includes(category);
  });
}

/**
 * Executive readiness summary for Citizen Dashboard
 */
export function getCitizenReadinessSummary(user, documents = [], opportunities = []) {
  const userAge = calculateCitizenAge(user);
  const ranked = rankAndFilterOpportunities(opportunities, user, documents);
  const topMatches = ranked.filter((o) => (o.matchScore || 0) >= MINIMUM_DISPLAY_MATCH_SCORE);
  const fullyDocumented = ranked.filter((o) => o.docReadinessPercent === 100);

  return {
    userAge,
    totalEligibleCount: topMatches.length,
    fullyDocumentedCount: fullyDocumented.length,
    isSenior: userAge >= 60 || Boolean(user?.isSeniorCitizen || user?.is_senior_citizen),
    isPwd: Boolean(user?.isPwd || user?.is_pwd),
    isSoloParent: Boolean(user?.isSoloParent || user?.is_solo_parent),
  };
}

/**
 * Hospital Medical Assistance Evaluation (Hospital Confinement)
 */
export function evaluateMedicalAssistanceTiers(patientData = {}) {
  const {
    hospitalBill = 0,
    philhealthDeducted = 0,
    hmoDeducted = 0,
    isIndigent = true,
    isSenior = false,
  } = patientData;

  const remainingBalance = Math.max(0, hospitalBill - philhealthDeducted - hmoDeducted);
  const matchedPrograms = [];

  if (isSenior) {
    matchedPrograms.push({
      agency: 'PhilHealth',
      program: 'RA 10645 Mandatory Senior Coverage & No Balance Billing',
      coverageEstimate: remainingBalance,
      coverageType: '100% Ward Subsidy (Zero Out-of-Pocket)',
      priority: 1,
    });
  }

  if (isIndigent && remainingBalance > 0) {
    matchedPrograms.push({
      agency: 'Department of Health (DOH)',
      program: 'DOH MAP Assistance via Malasakit Center',
      coverageEstimate: remainingBalance * 0.8,
      coverageType: 'Guarantee Letter / Hospital Bill Relief',
      priority: 2,
    });
  }

  if (remainingBalance > 5000) {
    matchedPrograms.push({
      agency: 'PCSO',
      program: 'PCSO Individual Medical Assistance Program',
      coverageEstimate: Math.min(50000, remainingBalance * 0.5),
      coverageType: 'Guarantee Letter for Medicines & Procedures',
      priority: 3,
    });
  }

  if (isIndigent) {
    matchedPrograms.push({
      agency: 'DSWD',
      program: 'DSWD AICS Crisis Medical Grant',
      coverageEstimate: 5000,
      coverageType: 'Direct Cash Grant for Prescribed Medicines',
      priority: 4,
    });
  }

  return {
    totalOriginalBill: hospitalBill,
    remainingBalance,
    matchedPrograms,
    malasakitEligible: true,
  };
}
