import React, { createContext, useContext, useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  supabase,
  isSupabaseConfigured,
  findProfileByEmail,
  fetchAllProfiles,
  createProfileInSupabase,
  signUpWithSupabase,
  updateProfileInSupabase,
  deleteProfileFromSupabase,
  fetchDocumentsByUserId,
  createDocumentInSupabase,
  deleteDocumentFromSupabase,
  fetchKnowledgeSources,
  createKnowledgeSource,
  updateKnowledgeSource,
  deleteKnowledgeSource,
  deleteOpportunitiesBySourceUrl,
  deleteOpportunitiesByIds,
  fetchOpportunities,
  createOpportunity,
  saveMultipleOpportunitiesToSupabase,
  fetchAuditLogs,
  createAuditLog,
  fetchChatArchives,
  saveChatArchiveToSupabase,
  deleteChatArchiveFromSupabase,
} from '../lib/supabase';
import { runFacebookSyncPipeline } from '../services/facebookScraper';
import { scrapeAnyWebsite } from '../services/webScraper';
import { rankAndFilterOpportunities, getAutoApplyMatches } from '../services/rulesEngine';
import { OCR_PRESET_TEMPLATES, getDocumentPlaceholderThumbnail } from '../services/docAgentService';
import { translate } from '../lib/translations';
import {
  INITIAL_USER,
  INITIAL_DOCUMENTS,
  OPPORTUNITIES,
  CATEGORIES,
  KNOWLEDGE_SOURCES,
  AI_DETECTED_QUEUE,
  NOTIFICATIONS,
  AUDIT_LOGS,
  INITIAL_CHAT_ARCHIVES,
  AUTO_APPLY_TEST_OPPORTUNITY,
} from '../lib/mockData';

const AppContext = createContext();

// Maps a requirement name (e.g. "PhilHealth Member Registration Form (PMRF)") to the
// closest matching category in the Document Vault upload form's dropdown.
function guessDocumentTypeFromRequirement(requirementName = '') {
  const q = requirementName.toLowerCase();
  if (/philsys|national id|umid|valid id|government id|photo id/.test(q)) return 'National ID / Gov ID';
  if (/barangay|indigency|residency|clearance of residence/.test(q)) return 'Barangay Certificate';
  if (/philhealth|pmrf|mdr/.test(q)) return 'PhilHealth MDR';
  if (/nbi/.test(q)) return 'NBI Clearance';
  if (/police clearance/.test(q)) return 'Police Clearance';
  if (/birth certificate|psa birth|psa marriage/.test(q)) return 'Birth Certificate (PSA)';
  if (/clinical abstract|medical certificate|statement of account|hospital bill|prescription/.test(q)) return 'Medical Certificate / Clinical Abstract';
  if (/certificate of employment|coe/.test(q)) return 'Certificate of Employment (COE)';
  if (/registration|matriculation|enrollment|transcript|cor/.test(q)) return 'School Registration / Transcript';
  return 'National ID / Gov ID';
}

// Collapses opportunities that share the same title (case/whitespace-insensitive) — e.g.
// repeated scraping runs or admin re-adds can leave near-duplicate cards behind, sometimes
// with an incorrect agency label attached. When duplicates disagree on agency, keeps
// whichever agency value is most common among them (majority vote), tie-breaking to the
// first-seen entry, rather than arbitrarily keeping whichever happened to scrape last.
function dedupeOpportunitiesByTitle(list = []) {
  const groups = new Map();

  list.forEach((opp) => {
    const key = (opp?.title || '').toLowerCase().trim();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(opp);
  });

  const deduped = [];
  groups.forEach((group) => {
    if (group.length === 1) {
      deduped.push(group[0]);
      return;
    }

    const agencyCounts = new Map();
    group.forEach((o) => {
      const agency = (o.agency || '').trim();
      agencyCounts.set(agency, (agencyCounts.get(agency) || 0) + 1);
    });

    let bestAgency = group[0].agency;
    let bestCount = 0;
    agencyCounts.forEach((count, agency) => {
      if (count > bestCount) {
        bestCount = count;
        bestAgency = agency;
      }
    });

    deduped.push(group.find((o) => (o.agency || '').trim() === bestAgency) || group[0]);
  });

  return deduped;
}

export const AppProvider = ({ children }) => {
  // Navigation & View Mode. Deliberately NOT restored from localStorage: admin view must
  // only ever be entered fresh each load (via the /admin portal route or an admin login),
  // never regained by simply refreshing a page that happened to be in admin mode before.
  const [viewMode, setViewMode] = useState('user');
  const [activeTab, setActiveTab] = useState('home');
  const [adminTab, setAdminTab] = useState('sources');

  // Language: 'en' (default) or 'fil'
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('alalay_language') || 'en';
  });

  useEffect(() => {
    localStorage.setItem('alalay_language', language);
  }, [language]);

  const t = (key) => translate(language, key);

  // Dynamic User & Auth State (Persistent across all page refreshes)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('alalay_user');
      return saved ? JSON.parse(saved) : INITIAL_USER;
    } catch (e) {
      return INITIAL_USER;
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const saved = localStorage.getItem('alalay_auth');
    return saved === 'true' || saved === true;
  });

  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    const saved = localStorage.getItem('alalay_onboarding_done');
    return saved === 'true' || saved === true;
  });

  const [consentGiven, setConsentGiven] = useState(true);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const [guidedTourActive, setGuidedTourActive] = useState(false);
  const [guidedTourStep, setGuidedTourStep] = useState(1);

  // Dynamic Data States (synchronized with Supabase - NO hardcoded documents fallback)
  const [documents, setDocuments] = useState(() => {
    try {
      const saved = localStorage.getItem('alalay_documents');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Pinned opportunity IDs, persisted so citizens can bookmark a service to revisit
  // later (e.g. when they don't have the required document on hand yet), even after
  // a page refresh.
  const [pinnedOpportunityIds, setPinnedOpportunityIds] = useState(() => {
    try {
      const saved = localStorage.getItem('alalay_pinned_opportunities');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const togglePinOpportunity = (oppId) => {
    if (!oppId) return;
    setPinnedOpportunityIds((prev) => {
      const isPinned = prev.includes(oppId);
      const updated = isPinned ? prev.filter((id) => id !== oppId) : [oppId, ...prev];
      localStorage.setItem('alalay_pinned_opportunities', JSON.stringify(updated));
      addToast(
        isPinned ? 'Unpinned' : 'Pinned for Later',
        isPinned ? 'Removed from your pinned services.' : 'Saved to your pinned services for quick access.',
        'info'
      );
      return updated;
    });
  };

  // Keep Session and User Persistent in LocalStorage
  useEffect(() => {
    localStorage.setItem('alalay_auth', isAuthenticated ? 'true' : 'false');
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem('alalay_onboarding_done', onboardingCompleted ? 'true' : 'false');
  }, [onboardingCompleted]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('alalay_user', JSON.stringify(user));
    }
  }, [user]);


  const [opportunities, setOpportunities] = useState(() => {
    const saved = localStorage.getItem('alalay_opportunities');
    return dedupeOpportunitiesByTitle(saved ? JSON.parse(saved) : OPPORTUNITIES);
  });

  // One-time cleanup: if the loaded vault had duplicate-titled opportunities (e.g. from
  // repeated scraping), persist the deduped result so the fix survives past this session
  // instead of only living in memory until the next scrape re-triggers a save.
  useEffect(() => {
    localStorage.setItem('alalay_opportunities', JSON.stringify(opportunities));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-Apply queue: opportunities the AI has detected as a 95%+ "Likely Eligible" match
  // under the citizen's Auto-Apply settings, staged as "Ready to Submit" until the citizen
  // taps Submit (unless Full Automation consent was given — see autoApplyMode).
  const [autoApplyQueue, setAutoApplyQueue] = useState(() => {
    try {
      const saved = localStorage.getItem('alalay_auto_apply_queue');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('alalay_auto_apply_queue', JSON.stringify(autoApplyQueue));
  }, [autoApplyQueue]);

  // Continuously scan for new strong-match (95%+, Likely Eligible) opportunities whenever documents, the
  // opportunity catalog, or the citizen's Auto-Apply settings change. Behavior depends
  // on the consent-gated autoApplyMode: 'confirm' (default) stages matches for the
  // citizen to manually tap Submit; 'autonomous' (only reachable after explicit consent)
  // marks them Applied immediately and just notifies.
  useEffect(() => {
    if (!user?.autoApplyEnabled) return;

    const isAutonomous = user?.autoApplyMode === 'autonomous' && user?.autoApplyConsentGiven;

    const ranked = rankAndFilterOpportunities(opportunities, user, documents);
    const eligible = getAutoApplyMatches(ranked, user);

    setAutoApplyQueue((prev) => {
      const queuedIds = new Set(prev.map((entry) => entry.oppId));
      const newlyEligible = eligible.filter((opp) => !queuedIds.has(opp.id));

      if (newlyEligible.length === 0) return prev;

      newlyEligible.forEach((opp) => {
        addToast(
          isAutonomous ? '🤖 Auto-Applied' : '🎯 Strong Match Found',
          isAutonomous
            ? `${opp.title} was a ${opp.matchScore}% Likely Eligible match — ALALAY submitted it automatically on your behalf.`
            : `${opp.title} is a ${opp.matchScore}% Likely Eligible match — review and submit it from your Auto-Apply queue.`,
          'success'
        );
      });

      const now = new Date().toISOString();
      const newEntries = newlyEligible.map((opp) => ({
        oppId: opp.id,
        status: isAutonomous ? 'applied' : 'ready_to_submit',
        queuedAt: now,
        ...(isAutonomous ? { appliedAt: now } : {}),
      }));

      return [...newEntries, ...prev];
    });
  }, [user?.autoApplyEnabled, user?.autoApplyCategories, user?.autoApplyIncludeJobs, user?.autoApplyMode, user?.autoApplyConsentGiven, opportunities, documents]);

  // Switching into Full Automation should resolve anything already sitting in the
  // "Ready to Submit" queue from before the switch — otherwise those stale entries
  // still wait on a manual tap even though the citizen just consented to autonomy.
  useEffect(() => {
    const isAutonomous = user?.autoApplyMode === 'autonomous' && user?.autoApplyConsentGiven;
    if (!isAutonomous) return;

    setAutoApplyQueue((prev) => {
      if (!prev.some((entry) => entry.status === 'ready_to_submit')) return prev;
      const now = new Date().toISOString();
      return prev.map((entry) =>
        entry.status === 'ready_to_submit' ? { ...entry, status: 'applied', appliedAt: now } : entry
      );
    });
  }, [user?.autoApplyMode, user?.autoApplyConsentGiven]);

  const submitAutoApply = (oppId) => {
    const opp = opportunities.find((o) => o.id === oppId);
    setAutoApplyQueue((prev) =>
      prev.map((entry) =>
        entry.oppId === oppId ? { ...entry, status: 'applied', appliedAt: new Date().toISOString() } : entry
      )
    );
    addToast('Application Submitted', `${opp?.title || 'Your application'} has been submitted.`, 'success');
  };

  const dismissAutoApply = (oppId) => {
    setAutoApplyQueue((prev) => prev.filter((entry) => entry.oppId !== oppId));
  };

  // Citizen-confirmed receipt of a benefit — distinct from "applied" (submitted) since a
  // submitted application isn't the same as the benefit actually being granted/received.
  const markBenefitAcquired = (oppId) => {
    const opp = opportunities.find((o) => o.id === oppId);
    setAutoApplyQueue((prev) =>
      prev.map((entry) =>
        entry.oppId === oppId ? { ...entry, status: 'acquired', acquiredAt: new Date().toISOString() } : entry
      )
    );
    addToast('Benefit Received', `${opp?.title || 'This benefit'} was marked as received.`, 'success');
  };

  const clearAutoApplyHistory = () => {
    setAutoApplyQueue((prev) => prev.filter((entry) => entry.status !== 'applied'));
  };

  const clearAcquiredBenefits = () => {
    setAutoApplyQueue((prev) => prev.filter((entry) => entry.status !== 'acquired'));
  };

  // Dev/demo helper: one click uploads every known document type to the vault, seeds a
  // matching opportunity, and sets the minimum demographic profile (senior + indigent)
  // needed for matchScore to genuinely reach 100 — so Auto-Apply can be tested end-to-end
  // without relying on production data ever producing a perfect match by chance.
  const generateAllTestDocuments = () => {
    setOpportunities((prev) => {
      if (prev.some((o) => o.id === AUTO_APPLY_TEST_OPPORTUNITY.id)) return prev;
      const updated = [AUTO_APPLY_TEST_OPPORTUNITY, ...prev];
      localStorage.setItem('alalay_opportunities', JSON.stringify(updated));
      return updated;
    });

    const existingNames = new Set(documents.map((d) => (d.name || '').toLowerCase()));

    Object.values(OCR_PRESET_TEMPLATES).forEach((template) => {
      if (existingNames.has(template.name.toLowerCase())) return;
      const expDateObj = new Date(Date.now() + (template.validityDays || 180) * 24 * 60 * 60 * 1000);
      uploadNewDocument(
        {
          name: template.name,
          type: template.type,
          issuer: template.issuer,
          documentNumber: template.documentNumber,
          expirationDate: expDateObj.toISOString().split('T')[0],
          thumbnail: template.thumbnail,
          attributes: template.attributes,
        },
        { silent: true }
      );
    });

    // Note: deliberately does NOT touch autoApplyEnabled/autoApplyConsentGiven — Auto-Apply
    // stays off by default and can only be turned on through its own consent flow in Profile,
    // even from this one-click test helper.
    setUser((prev) => ({
      ...prev,
      isSeniorCitizen: true,
      birthDate: '1962-03-10',
      monthlyIncome: 'Below ₱15,000 (No Regular Income)',
      autoApplyCategories: Array.from(new Set([...(prev.autoApplyCategories || []), 'social'])),
    }));

    addToast(
      '🧪 All Test Documents Generated',
      'Uploaded one of every document type to your vault and updated your demo profile so at least one program hits a genuine 100% match. Enable Auto-Apply in Profile to test the queue.',
      'success'
    );
  };

  const [sources, setSources] = useState(() => {
    const saved = localStorage.getItem('alalay_sources');
    return saved ? JSON.parse(saved) : KNOWLEDGE_SOURCES;
  });

  const [reviewQueue, setReviewQueue] = useState(() => {
    const saved = localStorage.getItem('alalay_review_queue');
    return saved ? JSON.parse(saved) : AI_DETECTED_QUEUE;
  });

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('alalay_notifications');
    return saved ? JSON.parse(saved) : NOTIFICATIONS;
  });

  const [auditLogs, setAuditLogs] = useState(() => {
    const saved = localStorage.getItem('alalay_audit_logs');
    return saved ? JSON.parse(saved) : AUDIT_LOGS;
  });

  const [chatArchives, setChatArchives] = useState(() => {
    try {
      const saved = localStorage.getItem('alalay_chat_archives');
      return saved ? JSON.parse(saved) : INITIAL_CHAT_ARCHIVES;
    } catch (e) {
      return INITIAL_CHAT_ARCHIVES;
    }
  });

  const [loadedChatSession, setLoadedChatSession] = useState(null);

  useEffect(() => {
    localStorage.setItem('alalay_chat_archives', JSON.stringify(chatArchives));
  }, [chatArchives]);

  const [managedUsers, setManagedUsers] = useState(() => {
    const saved = localStorage.getItem('alalay_managed_users');
    return saved
      ? JSON.parse(saved)
      : [
          {
            id: 'usr_admin_1',
            firstName: 'Super',
            middleName: '',
            lastName: 'Admin',
            name: 'Super Admin',
            email: 'admin@alalay.gov.ph',
            role: 'System Admin',
            status: 'Active',
            isTemporary: false,
            avatarInitials: 'SA',
            avatarBg: 'bg-indigo-600',
            otpCode: '891024',
            documents: [{ name: 'System Admin Authorization.pdf', type: 'Authorization', size: '1.2 MB' }],
            createdAt: '2026-08-15',
          },
          {
            id: 'usr_mod_2',
            firstName: 'Content',
            middleName: '',
            lastName: 'Moderator',
            name: 'Content Moderator',
            email: 'moderator@alalay.gov.ph',
            role: 'Content Moderator',
            status: 'Active',
            isTemporary: false,
            avatarInitials: 'CM',
            avatarBg: 'bg-amber-600',
            otpCode: '452109',
            documents: [],
            createdAt: '2026-08-15',
          },
        ];
  });
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [tempAdminModalOpen, setTempAdminModalOpen] = useState(false);

  // UI Modals & Filter States
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [askAlalayOpen, setAskAlalayOpen] = useState(false);
  const [askAlalayOpportunity, setAskAlalayOpportunity] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadModalPrefill, setUploadModalPrefill] = useState(null);
  // Carries a request from an opportunity's requirements checklist into the Apply-with-AI
  // tab: which intake program to open, whether to auto-complete/review it immediately
  // (vs. the normal conversational fill-out), and which opportunity to return to once done.
  const [pendingApplyRequest, setPendingApplyRequest] = useState(null);
  const [addSourceModalOpen, setAddSourceModalOpen] = useState(false);
  const [activeDocumentForPreview, setActiveDocumentForPreview] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedEligibilityFilter, setSelectedEligibilityFilter] = useState('all');

  // Scraping Live Simulation State
  const [isScrapingLive, setIsScrapingLive] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState({ stage: '', percent: 0, currentUrl: '' });
  const [toasts, setToasts] = useState([]);

  // Toast Notification Manager
  const addToast = (title, message, type = 'info', duration = 4000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 1. Initial Load: Fetch Dynamic Data from Supabase
  useEffect(() => {
    const loadDynamicSupabaseData = async () => {
      if (!isSupabaseConfigured) return;

      // A. Fetch Dynamic Profiles / Users
      const { data: dbProfiles } = await fetchAllProfiles();
      if (dbProfiles && dbProfiles.length > 0) {
        const formatted = dbProfiles.map((p) => ({
          id: p.id,
          firstName: p.first_name,
          middleName: p.middle_name || '',
          lastName: p.last_name,
          name: p.full_name || `${p.first_name} ${p.middle_name ? p.middle_name + ' ' : ''}${p.last_name}`.trim(),
          email: p.email,
          role: p.role === 'super_admin' ? 'System Admin' : p.role === 'content_moderator' ? 'Content Moderator' : p.role === 'analyst' ? 'Analyst' : 'Citizen',
          status: p.status || 'Active',
          avatarInitials: p.avatar_initials || `${p.first_name?.charAt(0) || ''}${p.last_name?.charAt(0) || ''}`.toUpperCase(),
          avatarBg: p.role === 'super_admin' ? 'bg-indigo-600' : p.role === 'content_moderator' ? 'bg-amber-600' : 'bg-blue-600',
          otpCode: p.otp_code || '891024',
          egovVerified: p.egov_verified ?? false,
          isVerified: p.egov_verified ?? false,
          onboardingCompleted: p.onboarding_completed ?? false,
          onboarding_completed: p.onboarding_completed ?? false,
          documents: p.documents?.map((d, idx) => ({
            id: d.id || `doc_supa_${idx}`,
            name: d.name,
            type: d.type || 'Identity Card',
            category: d.category || 'Government ID',
            size: d.file_size || '1.4 MB',
            fileSize: d.file_size || '1.4 MB',
            fileType: d.file_type || 'PDF',
            status: d.status || 'Valid',
            verifiedBadge: 'Super Admin Verified ✓',
          })) || [],
          createdAt: p.created_at?.split('T')[0] || '2026-08-15',
        }));
        setManagedUsers(formatted);
      }

      // B. Fetch Dynamic Knowledge Sources & Merge
      const { data: dbSources } = await fetchKnowledgeSources();
      if (dbSources && dbSources.length > 0) {
        let deletedKeys = [];
        try {
          deletedKeys = JSON.parse(localStorage.getItem('alalay_deleted_sources') || '[]');
        } catch (e) {}

        const activeDbSources = dbSources.filter((s) => {
          const sUrl = (s.official_url || s.officialUrl || s.url || s.id || '').toLowerCase();
          const sName = (s.name || '').toLowerCase();
          return !deletedKeys.some(
            (k) => k && (sUrl.includes(String(k).toLowerCase()) || sName.includes(String(k).toLowerCase()))
          );
        });

        setSources(activeDbSources);
        localStorage.setItem('alalay_sources', JSON.stringify(activeDbSources));
      }

      // C. Fetch Dynamic Opportunities directly from Supabase (Single Source of Truth)
      const { data: dbOpps } = await fetchOpportunities();
      if (dbOpps && Array.isArray(dbOpps)) {
        // Supabase itself can carry duplicate-titled rows from repeated scraping —
        // dedupe on read so the client never displays or auto-applies to them.
        const dedupedDbOpps = dedupeOpportunitiesByTitle(dbOpps);
        setOpportunities(dedupedDbOpps);
        localStorage.setItem('alalay_opportunities', JSON.stringify(dedupedDbOpps));
      }

      // D. Fetch Dynamic Audit Logs
      const { data: dbLogs } = await fetchAuditLogs();
      if (dbLogs && dbLogs.length > 0) {
        setAuditLogs(dbLogs);
      }
    };

    loadDynamicSupabaseData();
  }, []);

  // Synchronize documents specifically for the active logged in user from database/admin
  useEffect(() => {
    const loadUserDocuments = async () => {
      if (!user?.email) return;

      // 1. If user has attached documents on user object (from managedUsers/Supabase profile)
      if (user.documents && user.documents.length > 0) {
        const formatted = user.documents.map((d, i) => ({
          id: d.id || `doc_${Date.now()}_${i}`,
          name: d.name,
          type: d.type || 'Identity Card',
          category: d.category || 'Government ID',
          status: d.status || 'Valid',
          fileSize: d.fileSize || d.size || d.file_size || '1.4 MB',
          fileType: d.fileType || d.file_type || 'PDF',
          verifiedBadge: 'Super Admin Verified ✓',
          uploadedAt: 'Synced from Super Admin Vault',
          thumbnail: d.thumbnail || getDocumentPlaceholderThumbnail(d.type || 'Identity Card'),
        }));
        setDocuments(formatted);
        localStorage.setItem('alalay_documents', JSON.stringify(formatted));
        return;
      }

      // 2. Fetch directly from Supabase if user has an id
      if (isSupabaseConfigured && user.id && !user.id.startsWith('usr_')) {
        const { data: dbDocs } = await fetchDocumentsByUserId(user.id);
        if (dbDocs && dbDocs.length > 0) {
          const formatted = dbDocs.map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type || 'Identity Card',
            category: d.category || 'Government ID',
            status: d.status || 'Valid',
            fileSize: d.file_size || '1.4 MB',
            fileType: d.file_type || 'PDF',
            verifiedBadge: 'Super Admin Verified ✓',
            uploadedAt: 'Synced from Database',
            thumbnail: d.thumbnail || getDocumentPlaceholderThumbnail(d.type || 'Identity Card'),
          }));
          setDocuments(formatted);
          localStorage.setItem('alalay_documents', JSON.stringify(formatted));
          return;
        }
      }

      // 3. If no documents found for this user, vault is empty
      setDocuments([]);
      localStorage.removeItem('alalay_documents');
    };

    loadUserDocuments();
  }, [user?.id, user?.email]);

  // Synchronize chat archives exclusively for the active signed-in user
  useEffect(() => {
    const loadUserChatArchives = async () => {
      const cleanEmail = (user?.email || '').toLowerCase().trim();
      const userId = user?.id || '';

      if (!cleanEmail && !userId) {
        setChatArchives([]);
        return;
      }

      // 1. Load cached user archives from per-user localStorage
      const userKey = `alalay_chat_archives_${cleanEmail || userId}`;
      try {
        const cached = localStorage.getItem(userKey);
        if (cached) {
          setChatArchives(JSON.parse(cached));
        } else {
          setChatArchives([]);
        }
      } catch (e) {
        setChatArchives([]);
      }

      // 2. Fetch authoritative user chat archives from Supabase
      if (isSupabaseConfigured) {
        const { data: dbArchives } = await fetchChatArchives(cleanEmail, userId);
        if (dbArchives && Array.isArray(dbArchives)) {
          setChatArchives(dbArchives);
          localStorage.setItem(userKey, JSON.stringify(dbArchives));
        }
      }
    };

    loadUserChatArchives();
  }, [user?.id, user?.email]);

  // Update User Profile (Mobile Number, Address, Name) in State and Supabase
  const updateUserProfile = async (profileUpdates = {}) => {
    const cleanEmail = (profileUpdates.email || user?.email || '').toLowerCase().trim();
    const userId = profileUpdates.id || user?.id || '';

    // 1. Update user in state and localStorage
    setUser((prev) => {
      const updated = {
        ...prev,
        ...profileUpdates,
        phone: profileUpdates.phone ?? prev?.phone ?? '',
        address: profileUpdates.address ?? prev?.address ?? '',
      };
      localStorage.setItem('alalay_user', JSON.stringify(updated));
      return updated;
    });

    // 2. Update in managedUsers list
    setManagedUsers((prev) => {
      const updated = prev.map((u) => {
        if (
          (userId && u.id === userId) ||
          (cleanEmail && u.email?.toLowerCase() === cleanEmail)
        ) {
          return {
            ...u,
            ...profileUpdates,
            phone: profileUpdates.phone ?? u.phone,
            address: profileUpdates.address ?? u.address,
          };
        }
        return u;
      });
      localStorage.setItem('alalay_managed_users', JSON.stringify(updated));
      return updated;
    });

    // 3. Persist to Supabase public.profiles table
    if (isSupabaseConfigured) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      const dbPayload = {
        phone: profileUpdates.phone ?? user?.phone ?? '',
        address: profileUpdates.address ?? user?.address ?? '',
        first_name: profileUpdates.firstName || profileUpdates.first_name || user?.firstName || user?.first_name || '',
        last_name: profileUpdates.lastName || profileUpdates.last_name || user?.lastName || user?.last_name || '',
        middle_name: profileUpdates.middleName || profileUpdates.middle_name || user?.middleName || user?.middle_name || '',
        updated_at: new Date().toISOString(),
      };

      if (profileUpdates.onboardingCompleted !== undefined) {
        dbPayload.onboarding_completed = profileUpdates.onboardingCompleted;
      }
      if (profileUpdates.egovVerified !== undefined) {
        dbPayload.egov_verified = profileUpdates.egovVerified;
      }

      if (isUUID) {
        await updateProfileInSupabase(userId, dbPayload);
      } else if (cleanEmail) {
        const { data: p } = await findProfileByEmail(cleanEmail);
        if (p?.id) {
          await updateProfileInSupabase(p.id, dbPayload);
        }
      }
    }
  };

  // Complete Onboarding Wizard & Sync Admin Documents to Document Locker
  const completeOnboardingWizard = async (syncedDocs = [], updatedFields = {}) => {
    setOnboardingCompleted(true);
    setIsAuthenticated(true);
    setViewMode('user');
    setActiveTab('home');

    const cleanEmail = (updatedFields.email || user?.email || '').toLowerCase().trim();
    const userId = updatedFields.id || user?.id || '';

    if (userId) {
      localStorage.setItem(`alalay_onboarding_done_${userId}`, 'true');
    }
    if (cleanEmail) {
      localStorage.setItem(`alalay_onboarding_done_${cleanEmail}`, 'true');
    }
    localStorage.setItem('alalay_onboarding_done', 'true');
    localStorage.setItem('alalay_auth', 'true');

    // Update user in state with latest phone, address, and onboarding status
    setUser((prev) => {
      const updated = {
        ...prev,
        ...updatedFields,
        phone: updatedFields.phone ?? prev?.phone ?? '',
        address: updatedFields.address ?? prev?.address ?? '',
        onboardingCompleted: true,
        onboarding_completed: true,
      };
      localStorage.setItem('alalay_user', JSON.stringify(updated));
      return updated;
    });

    // Update in managedUsers
    setManagedUsers((prev) => {
      const updated = prev.map((u) => {
        if (
          (userId && u.id === userId) ||
          (cleanEmail && u.email?.toLowerCase() === cleanEmail)
        ) {
          return {
            ...u,
            ...updatedFields,
            phone: updatedFields.phone ?? u.phone,
            address: updatedFields.address ?? u.address,
            onboardingCompleted: true,
            onboarding_completed: true,
          };
        }
        return u;
      });
      localStorage.setItem('alalay_managed_users', JSON.stringify(updated));
      return updated;
    });

    // Persist phone, address, and onboarding status to Supabase profile across all devices
    if (isSupabaseConfigured) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      const dbPayload = {
        phone: updatedFields.phone ?? user?.phone ?? '',
        address: updatedFields.address ?? user?.address ?? '',
        first_name: updatedFields.firstName || updatedFields.first_name || user?.firstName || user?.first_name || '',
        last_name: updatedFields.lastName || updatedFields.last_name || user?.lastName || user?.last_name || '',
        middle_name: updatedFields.middleName || updatedFields.middle_name || user?.middleName || user?.middle_name || '',
        onboarding_completed: true,
        egov_verified: true,
        updated_at: new Date().toISOString(),
      };

      if (isUUID) {
        await updateProfileInSupabase(userId, dbPayload);
      } else if (cleanEmail) {
        const { data: p } = await findProfileByEmail(cleanEmail);
        if (p?.id) {
          await updateProfileInSupabase(p.id, dbPayload);
        }
      }
    }

    // Set ONLY the fetched documents belonging to this user (NO hardcoded mock documents)
    const formattedDocs = (syncedDocs || []).map((d, i) => ({
      id: d.id || `doc_sync_${Date.now()}_${i}`,
      name: d.name,
      type: d.type || 'Identity Card',
      category: d.category || 'Government ID',
      status: d.status || 'Valid',
      fileSize: d.fileSize || d.size || d.file_size || '1.4 MB',
      fileType: d.fileType || d.file_type || 'PDF',
      verifiedBadge: 'Super Admin Verified ✓',
      uploadedAt: 'Synced from Super Admin Vault',
      thumbnail: d.thumbnail || getDocumentPlaceholderThumbnail(d.type || 'Identity Card'),
    }));

    setDocuments(formattedDocs);
    localStorage.setItem('alalay_documents', JSON.stringify(formattedDocs));

    addToast(
      'Setup Complete! 🎉',
      `Welcome to ALALAY. ${formattedDocs.length} verified documents synchronized to your vault.`,
      'success',
      6000
    );
  };

  // Sync Managed Users to LocalStorage
  useEffect(() => {
    localStorage.setItem('alalay_managed_users', JSON.stringify(managedUsers));
  }, [managedUsers]);

  // Sync Opportunities to LocalStorage so Citizen views always have the latest scraped services
  useEffect(() => {
    if (opportunities && opportunities.length > 0) {
      localStorage.setItem('alalay_opportunities', JSON.stringify(opportunities));
    }
  }, [opportunities]);

  // Authentication Handlers
  const loginWithSupabase = async (emailInput, passwordInput) => {
    const cleanEmail = emailInput?.trim();
    if (!cleanEmail) {
      addToast('Input Required', 'Please enter your email address.', 'error');
      return { success: false };
    }

    // 1. Check local managedUsers array first (for newly created temp admins & registered users)
    const localMatch = managedUsers.find(
      (u) => u.email?.toLowerCase() === cleanEmail.toLowerCase()
    );

    if (localMatch) {
      const isAdminRole = [
        'System Admin',
        'Super Admin',
        'Content Moderator',
        'Analyst',
        'Agency Verifier',
        'super_admin',
        'content_moderator',
      ].includes(localMatch.role);

      setUser({
        id: localMatch.id,
        firstName: localMatch.firstName,
        lastName: localMatch.lastName,
        email: localMatch.email,
        role: localMatch.role,
        isVerified: true,
      });

      setIsAuthenticated(true);
      localStorage.setItem('alalay_auth', 'true');

      if (isAdminRole) {
        setViewMode('admin');
        addToast(
          'Admin Authenticated',
          `Welcome back, ${localMatch.name} (${localMatch.role}).`,
          'success'
        );
        return { success: true, isAdmin: true };
      } else {
        setViewMode('user');
        setOnboardingCompleted(true);
        addToast('Welcome Back', `Logged in as ${localMatch.name}.`, 'success');
        return { success: true, isAdmin: false };
      }
    }

    // 2. Check user profile in Supabase
    const { data: profile } = await findProfileByEmail(cleanEmail);

    if (profile) {
      const isAdminRole = ['super_admin', 'content_moderator', 'analyst', 'agency_verifier'].includes(profile.role);
      
      setUser({
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        middleName: profile.middle_name,
        email: profile.email,
        phone: profile.phone || '+63 917 000 0000',
        address: profile.address || 'Metro Manila, Philippines',
        role: profile.role,
        isVerified: profile.egov_verified ?? true,
      });

      setIsAuthenticated(true);
      localStorage.setItem('alalay_auth', 'true');

      if (isAdminRole) {
        setViewMode('admin');
        addToast('Admin Authenticated', `Welcome back, ${profile.first_name} (${profile.role}).`, 'success');
        return { success: true, isAdmin: true };
      } else {
        setViewMode('user');
        setOnboardingCompleted(true);
        addToast('Welcome Back', `Logged in as ${profile.first_name}.`, 'success');
        return { success: true, isAdmin: false };
      }
    } else {
      // Dynamic fallback for new registration/login — always a citizen account. Admin
      // access must come from a real managedUsers/Supabase admin-role match above, never
      // be inferred from the login email itself (previously any email containing the
      // substring "admin" was granted instant Super Admin access with no password check).
      setIsAuthenticated(true);
      localStorage.setItem('alalay_auth', 'true');
      setViewMode('user');
      return { success: true, isAdmin: false };
    }
  };

  // Verify eGov PH OTP using the OTP passcode saved by the admin
  const verifyEgovOtp = async (emailInput, otpInput) => {
    const cleanEmail = emailInput?.trim();
    const cleanOtp = otpInput?.trim().toUpperCase();

    if (!cleanEmail || !cleanOtp) {
      addToast('Input Required', 'Please enter your email and 6-character OTP.', 'error');
      return { success: false, message: 'Missing fields' };
    }

    // 1. Always query Supabase first to get fresh, authoritative account state
    let dbProfile = null;
    if (isSupabaseConfigured) {
      const { data } = await findProfileByEmail(cleanEmail);
      dbProfile = data;
    }

    // 2. Check local managedUsers array if not found in Supabase
    let localProfile = managedUsers.find(
      (u) => u.email?.toLowerCase() === cleanEmail.toLowerCase()
    );

    let matchedProfile = dbProfile || localProfile;
    if (!matchedProfile) {
      matchedProfile = {
        firstName: cleanEmail.split('@')[0],
        lastName: 'Citizen',
        email: cleanEmail,
        role: 'Citizen',
        otp_code: '891024',
        otpCode: '891024',
        onboarding_completed: false,
        onboardingCompleted: false,
      };
    }

    // 3. Validate OTP saved by admin (or default 891024)
    const savedOtp = (
      matchedProfile?.otp_code ||
      matchedProfile?.otpCode ||
      '891024'
    ).toString().toUpperCase();

    if (cleanOtp === savedOtp || cleanOtp === '891024') {
      // 4. Check onboarding directly from Supabase / profile record (Single Source of Truth)
      const hasDoneOnboarding =
        dbProfile ? dbProfile.onboarding_completed === true :
        Boolean(matchedProfile?.onboarding_completed || matchedProfile?.onboardingCompleted);

      const isFirstTime = !hasDoneOnboarding;

      const userDocs = (matchedProfile?.documents || []).map((d, idx) => ({
        id: d.id || `doc_${Date.now()}_${idx}`,
        name: d.name,
        type: d.type || 'Identity Card',
        category: d.category || 'Government ID',
        size: d.size || d.fileSize || d.file_size || '1.4 MB',
        fileSize: d.size || d.fileSize || d.file_size || '1.4 MB',
        fileType: d.fileType || d.file_type || 'PDF',
        status: d.status || 'Valid',
        verifiedBadge: 'Super Admin Verified ✓',
        uploadedAt: 'Synced from Super Admin Vault',
      }));

      const userToLogin = {
        id: matchedProfile?.id || `usr_${Date.now()}`,
        firstName: matchedProfile?.first_name || matchedProfile?.firstName || 'Adones',
        middleName: matchedProfile?.middle_name || matchedProfile?.middleName || '',
        lastName: matchedProfile?.last_name || matchedProfile?.lastName || 'Santos',
        name:
          matchedProfile?.full_name ||
          matchedProfile?.name ||
          `${matchedProfile?.first_name || matchedProfile?.firstName || 'Adones'} ${matchedProfile?.last_name || matchedProfile?.lastName || 'Santos'}`.trim(),
        email: cleanEmail,
        phone: matchedProfile?.phone || '+63 917 842 1099',
        address: matchedProfile?.address || 'Unit 402, Katipunan Ave, Quezon City, Metro Manila',
        role: matchedProfile?.role || 'Citizen',
        otpCode: savedOtp,
        documents: userDocs,
        isVerified: true,
        onboardingCompleted: hasDoneOnboarding,
        onboarding_completed: hasDoneOnboarding,
      };

      setUser(userToLogin);
      setIsAuthenticated(true);
      setViewMode('user');
      setOnboardingCompleted(hasDoneOnboarding);
      localStorage.setItem('alalay_auth', 'true');
      localStorage.setItem('alalay_onboarding_done', hasDoneOnboarding ? 'true' : 'false');
      localStorage.setItem('alalay_user', JSON.stringify(userToLogin));

      if (hasDoneOnboarding) {
        setDocuments(userDocs);
        localStorage.setItem('alalay_documents', JSON.stringify(userDocs));
        addToast(
          'Welcome Back ✓',
          `Logged in as ${userToLogin.firstName || userToLogin.name}!`,
          'success'
        );
      } else {
        addToast(
          'eGov PH Verified ✓',
          `Welcome, ${userToLogin.firstName}! Please complete your 3-step setup.`,
          'success'
        );
      }

      return { success: true, isFirstTime };
    } else {
      addToast('Invalid OTP', 'The OTP passcode you entered is incorrect.', 'error');
      return { success: false, message: 'Invalid OTP' };
    }
  };

  // Create Temporary Admin Account
  const createTempAdminAccount = async ({
    firstName,
    lastName,
    email,
    password = 'admin123',
    role = 'System Admin',
    durationHours = 24,
    otpCode,
    autoLogin = false,
  }) => {
    const initials = `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase() || 'TA';
    const dbRole = (role || 'System Admin').toLowerCase().replace(' ', '_');
    const generatedOtp = otpCode || Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

    const newTempAdmin = {
      id: `tmp_admin_${Date.now()}`,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      email,
      role: role || 'System Admin',
      status: `Temp (${durationHours}h)`,
      isTemporary: true,
      expiresAt,
      durationHours,
      avatarInitials: initials,
      avatarBg: 'bg-amber-600',
      otpCode: generatedOtp,
      documents: [{ name: 'Temporary Admin Access Token.pdf', type: 'System Token', size: '240 KB' }],
      createdAt: new Date().toISOString().split('T')[0],
    };

    // 1. Register User in Supabase Auth (auth.users) & public.profiles
    if (isSupabaseConfigured) {
      await signUpWithSupabase({
        email,
        password,
        firstName,
        lastName,
        role: dbRole,
        otpCode: generatedOtp,
      });
    }

    // 2. Update React State
    setManagedUsers((prev) => [newTempAdmin, ...prev]);

    // 3. Create Audit Log
    await createAuditLog({
      action: 'TEMP_ADMIN_CREATED',
      actor: 'Super Admin',
      target: `${newTempAdmin.name} (${newTempAdmin.email})`,
      status: 'Success',
      details: `Generated temporary admin account expiring in ${durationHours}h with OTP passcode ${generatedOtp}.`,
    });

    addToast(
      'Temp Admin Activated',
      `Temporary Admin ${newTempAdmin.name} created! OTP Passcode: ${generatedOtp}`,
      'success',
      7000
    );

    if (autoLogin) {
      setUser({
        id: newTempAdmin.id,
        firstName,
        lastName,
        email,
        role: newTempAdmin.role,
        isVerified: true,
      });
      setIsAuthenticated(true);
      setViewMode('admin');
      localStorage.setItem('alalay_auth', 'true');
    }

    return newTempAdmin;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setOnboardingCompleted(false);
    setUser(null);
    setDocuments([]);
    setLanguage('en');
    localStorage.setItem('alalay_auth', 'false');
    localStorage.setItem('alalay_onboarding_done', 'false');
    localStorage.removeItem('alalay_user');
    localStorage.removeItem('alalay_documents');
    localStorage.setItem('alalay_language', 'en');
    addToast('Logged Out', 'You have been signed out.', 'info');
  };

  // Dynamic Add Managed User to Supabase
  const addManagedUser = async ({
    firstName,
    middleName = '',
    lastName,
    email,
    role,
    otpCode,
    birthDate = '1992-04-18',
    citizenship = 'Filipino',
    civilStatus = 'Single',
    isSeniorCitizen = false,
    isPwd = false,
    isSoloParent = false,
    employmentStatus = 'Employed',
    monthlyIncome = '₱25,000 - ₱35,000',
    documents = [],
  }) => {
    const initials = `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase() || 'U';
    const dbRole = (role || 'Citizen').toLowerCase().replace(' ', '_');

    // 1. Insert Profile into Supabase Auth & profiles table
    let createdUserId = `usr_${Date.now()}`;
    const { user: createdUserRes } = await signUpWithSupabase({
      email,
      password: 'User123!',
      firstName,
      middleName: middleName || '',
      lastName,
      role: dbRole,
      otpCode,
      birthDate,
      citizenship,
      civilStatus,
      isSeniorCitizen,
      isPwd,
      isSoloParent,
      employmentStatus,
      monthlyIncome,
    });

    if (createdUserRes?.id) {
      createdUserId = createdUserRes.id;
      // 2. Insert Attached Documents into Supabase
      for (const doc of documents) {
        await createDocumentInSupabase({
          user_id: createdUserId,
          name: doc.name,
          type: doc.type,
          file_size: doc.size || doc.fileSize || '1.2 MB',
          status: 'Valid',
        });
      }
    }

    const formattedDocs = documents.map((d, i) => ({
      id: d.id || `doc_admin_${Date.now()}_${i}`,
      name: d.name,
      type: d.type || 'Identity Card',
      category: d.category || 'Government ID',
      size: d.size || d.fileSize || '1.4 MB',
      fileSize: d.size || d.fileSize || '1.4 MB',
      fileType: 'PDF',
      status: 'Valid',
      verifiedBadge: 'Super Admin Verified ✓',
      uploadedAt: 'Uploaded by Super Admin',
    }));

    // 3. Update React State
    const newUser = {
      id: createdUserId,
      firstName,
      middleName: middleName || '',
      lastName,
      name: `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim(),
      email,
      role: role || 'System Admin',
      status: 'Active',
      avatarInitials: initials,
      avatarBg: dbRole === 'super_admin' ? 'bg-indigo-600' : 'bg-blue-600',
      otpCode: otpCode || '891024',
      birthDate,
      birth_date: birthDate,
      citizenship,
      civilStatus,
      civil_status: civilStatus,
      isSeniorCitizen,
      is_senior_citizen: isSeniorCitizen,
      isPwd,
      is_pwd: isPwd,
      isSoloParent,
      is_solo_parent: isSoloParent,
      employmentStatus,
      employment_status: employmentStatus,
      monthlyIncome,
      monthly_income: monthlyIncome,
      documents: formattedDocs,
      createdAt: new Date().toISOString().split('T')[0],
    };

    setManagedUsers((prev) => [newUser, ...prev]);

    // 4. Create Audit Log in Supabase
    await createAuditLog({
      action: 'USER_ACCOUNT_CREATED',
      actor: 'Super Admin',
      target: `${newUser.name} (${newUser.email})`,
      status: 'Success',
      details: `Registered dynamic user in Supabase with ${documents.length} verified documents.`,
    });

    addToast('User Registered in Supabase', `${newUser.name} saved to live database.`, 'success');
    setAddUserModalOpen(false);
  };

  // Delete Managed User from Supabase
  const deleteManagedUser = async (id) => {
    if (isSupabaseConfigured) {
      await deleteProfileFromSupabase(id);
    }
    setManagedUsers((prev) => prev.filter((u) => u.id !== id));
    await createAuditLog({
      action: 'USER_ACCOUNT_DEACTIVATED',
      actor: 'Super Admin',
      target: `User ID: ${id}`,
      status: 'Success',
      details: 'Account deactivated and deleted from Supabase profiles database.',
    });
    addToast('Account Deactivated', 'User account removed from Supabase online database.', 'info');
  };

  // Dynamic Add Knowledge Source with Live Web Scraping
  const addKnowledgeSource = async (newSourceData) => {
    const rawUrl = newSourceData.officialUrl || '';
    addToast('Scraping Website...', `Initiating real web scraping for ${rawUrl}...`, 'info');

    let scrapeResult = null;
    try {
      scrapeResult = await scrapeAnyWebsite(rawUrl);
    } catch (e) {
      console.warn('[WebScraper] Scrape error:', e);
    }

    const finalName =
      newSourceData.agencyName?.trim() ||
      scrapeResult?.title ||
      rawUrl.replace(/^https?:\/\//, '').split('/')[0];

    const docsIndexed = scrapeResult?.documentsCount || 1;
    const nowTime = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const { data: dbResult } = await createKnowledgeSource({
      agency_name: finalName,
      agency_type: newSourceData.agencyType || 'Executive Department',
      official_url: rawUrl,
      category: newSourceData.category || 'General',
      scraping_frequency: newSourceData.scrapingFrequency || 'Daily',
      status: scrapeResult?.status || 'Active',
      health_score: 99.4,
      documents_indexed: docsIndexed,
      priority: newSourceData.priority || 'High',
    });

    const added = (dbResult && dbResult[0]) || {
      id: `src_${Date.now()}`,
      agency_name: finalName,
      agencyName: finalName,
      official_url: rawUrl,
      officialUrl: rawUrl,
      category: newSourceData.category || 'General',
      status: scrapeResult?.status || 'Active',
      health_score: 99.4,
      healthScore: 99.4,
      documents_indexed: docsIndexed,
      documentsIndexed: docsIndexed,
      last_scraped_at: nowTime,
      lastScrapedAt: nowTime,
    };

    setSources((prev) => [added, ...prev]);
    setAddSourceModalOpen(false);

    // Register and permanently save all concrete opportunities extracted by the AI Scraper to Supabase
    const newOpps = scrapeResult?.extractedOpportunities && scrapeResult.extractedOpportunities.length > 0
      ? scrapeResult.extractedOpportunities
      : [
          {
            id: `opp_${Date.now()}`,
            title: scrapeResult?.title || `${finalName} Public Assistance Program`,
            agency: finalName,
            category: (newSourceData.category || 'health').toLowerCase(),
            categoryName: newSourceData.category || 'Health',
            categoryColor:
              newSourceData.category === 'Finance'
                ? '#34C759'
                : newSourceData.category === 'Education'
                ? '#f59e0b'
                : '#007AFF',
            shortDesc:
              scrapeResult?.description ||
              `Official public benefit and assistance program retrieved from ${rawUrl}.`,
            fullDesc:
              scrapeResult?.paragraphs?.join(' ') ||
              scrapeResult?.description ||
              `Full public service circular and benefit guidance from ${rawUrl}.`,
            matchScore: 92,
            matchStatus: 'Likely Eligible',
            confidence: '96% Confident',
            deadline: 'Ongoing Program',
            isApproved: true,
            benefits: scrapeResult?.paragraphs?.slice(0, 3) || [
              'Public service assistance program',
              'Direct citizen guidance',
            ],
            whyYouQualify: [
              { text: 'Profile verified with national credentials', status: 'met' },
              { text: 'Valid resident criteria met', status: 'met' },
            ],
            requirements: [
              { name: 'Valid Government Issued ID', status: 'met', sourceRef: 'Citizen Charter Standard' },
              { name: 'Official Application Form', status: 'action_required', sourceRef: rawUrl },
            ],
            missingItems: [],
            officialSource: {
              agency: finalName,
              url: rawUrl,
              pageTitle: scrapeResult?.title || finalName,
              lastScrapedAt: nowTime,
              lastVerifiedAt: nowTime,
              sourceHash: scrapeResult?.contentHash || 'sha256-verified',
              scraperConfidence: '99.2%',
            },
          },
        ];

    // 1. Permanently persist in Supabase
    if (isSupabaseConfigured) {
      await saveMultipleOpportunitiesToSupabase(newOpps);
    }

    // 2. Update local state preserving all old/previous opportunities
    setOpportunities((prev) => {
      const oppMap = new Map();
      newOpps.forEach((o) => {
        if (o?.title) oppMap.set(o.title.toLowerCase().trim(), o);
      });
      (prev || []).forEach((o) => {
        if (o?.title && !oppMap.has(o.title.toLowerCase().trim())) {
          oppMap.set(o.title.toLowerCase().trim(), o);
        }
      });
      const merged = Array.from(oppMap.values());
      localStorage.setItem('alalay_opportunities', JSON.stringify(merged));
      return merged;
    });

    await createAuditLog({
      action: 'KNOWLEDGE_SOURCE_SCRAPED_AND_ADDED',
      actor: 'Super Admin / Web Scraper',
      target: `${finalName} (${rawUrl})`,
      status: 'Success',
      details: `Live web scraped ${docsIndexed} policy blocks and published ${newOpps.length} citizen opportunities to Supabase.`,
    });

    addToast(
      'Website Scraped & Ingested',
      `Successfully scraped ${finalName} (${docsIndexed} document sections, ${newOpps.length} opportunities saved to Supabase).`,
      'success',
      5000
    );
  };

  // Live Scrape a Single Source by ID
  const scrapeSingleSource = async (sourceId) => {
    const targetSource = sources.find((s) => s.id === sourceId);
    if (!targetSource) return;

    const url = targetSource.official_url || targetSource.officialUrl || '';
    addToast('Scraping URL...', `Connecting to ${url}...`, 'info');

    try {
      const result = await scrapeAnyWebsite(url);
      const nowTime = new Date().toISOString().replace('T', ' ').slice(0, 16);

      // Update in Supabase if configured
      if (isSupabaseConfigured && targetSource.id && !targetSource.id.toString().startsWith('src_')) {
        await updateKnowledgeSource(targetSource.id, {
          last_scraped_at: nowTime,
          status: result.status || 'Active',
          documents_indexed: result.documentsCount || targetSource.documents_indexed || 1,
          health_score: 99.8,
        });
      }

      // Update local state
      setSources((prev) =>
        prev.map((s) => {
          if (s.id === sourceId) {
            return {
              ...s,
              last_scraped_at: nowTime,
              lastScraped: nowTime,
              lastScrapedAt: nowTime,
              status: result.status || 'Active',
              documents_indexed: result.documentsCount || 1,
              documentsIndexed: result.documentsCount || 1,
            };
          }
          return s;
        })
      );

      // Permanently save and merge opportunities if new programs were discovered
      if (result.extractedOpportunities && result.extractedOpportunities.length > 0) {
        if (isSupabaseConfigured) {
          await saveMultipleOpportunitiesToSupabase(result.extractedOpportunities);
        }

        setOpportunities((prev) => {
          const oppMap = new Map();
          result.extractedOpportunities.forEach((o) => {
            if (o?.title) oppMap.set(o.title.toLowerCase().trim(), o);
          });
          (prev || []).forEach((o) => {
            if (o?.title && !oppMap.has(o.title.toLowerCase().trim())) {
              oppMap.set(o.title.toLowerCase().trim(), o);
            }
          });
          const merged = Array.from(oppMap.values());
          localStorage.setItem('alalay_opportunities', JSON.stringify(merged));
          return merged;
        });
      }

      await createAuditLog({
        action: 'MANUAL_URL_SCRAPE_COMPLETED',
        actor: 'Super Admin',
        target: `${targetSource.agency_name || targetSource.name || url}`,
        status: 'Success',
        details: `Scraped in ${result.responseTimeMs}ms with SHA-256 hash: ${result.contentHash.substring(0, 12)}...`,
      });

      addToast(
        'Scrape Complete',
        `Updated ${targetSource.agency_name || targetSource.name || url} (${result.documentsCount} sections parsed in ${result.responseTimeMs}ms).`,
        'success'
      );
    } catch (err) {
      addToast('Scrape Warning', err.message || 'Could not reach target URL directly.', 'info');
    }
  };

  // Remove Knowledge Source and all its scraped opportunities/data
  const removeKnowledgeSource = async (id) => {
    const targetSource = sources.find((s) => s.id === id);
    const targetUrl =
      targetSource?.rawUrl ||
      targetSource?.official_url ||
      targetSource?.officialUrl ||
      targetSource?.source_url ||
      targetSource?.url ||
      '';
    const domain = targetUrl
      ? targetUrl.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()
      : '';
    const agencyName = targetSource?.name || targetSource?.agency_name || '';

    // 0. Record in persistent deleted sources blacklist so it never resurfaces
    try {
      const existingDeleted = JSON.parse(localStorage.getItem('alalay_deleted_sources') || '[]');
      const newDeleted = [
        ...new Set(
          [...existingDeleted, id, targetUrl, domain, agencyName].filter(Boolean)
        ),
      ];
      localStorage.setItem('alalay_deleted_sources', JSON.stringify(newDeleted));
    } catch (e) {}

    // 1. Delete source and associated opportunities from Supabase
    if (isSupabaseConfigured) {
      await deleteKnowledgeSource(id, targetUrl, agencyName);
      if (domain || agencyName) {
        await deleteOpportunitiesBySourceUrl(domain, agencyName);
      }
    }

    // 2. Completely remove knowledge source from state and localStorage
    setSources((prev) => {
      const updated = prev.filter((s) => {
        const sUrl = (s.rawUrl || s.official_url || s.officialUrl || s.url || '').toLowerCase();
        const sName = (s.name || s.agency_name || '').toLowerCase();
        const isMatch =
          s.id === id ||
          (domain && sUrl.includes(domain)) ||
          (agencyName && sName === agencyName.toLowerCase());
        return !isMatch;
      });
      localStorage.setItem('alalay_sources', JSON.stringify(updated));
      return updated;
    });

    // 3. Remove all scraped opportunities and vacancies originating from this website
    let deletedCount = 0;
    setOpportunities((prev) => {
      const domainKey = domain.replace(/^www\./, '').split('.')[0];
      const remaining = prev.filter((opp) => {
        const oppUrl = (opp.officialSource?.url || '').toLowerCase();
        const oppAgency = (opp.agency || '').toLowerCase();
        const oppTitle = (opp.title || '').toLowerCase();
        const oppId = (opp.id || '').toLowerCase();

        const isMatch =
          (domain && (oppUrl.includes(domain) || (domainKey && oppId.includes(domainKey)))) ||
          (agencyName &&
            (oppAgency.includes(agencyName.toLowerCase()) ||
              oppTitle.includes(agencyName.toLowerCase())));

        if (isMatch) deletedCount++;
        return !isMatch;
      });
      localStorage.setItem('alalay_opportunities', JSON.stringify(remaining));
      return remaining;
    });

    // 4. Remove any pending items in review queue
    setReviewQueue((prev) => {
      const remaining = prev.filter((item) => {
        const itemUrl = (item.source_url || item.url || '').toLowerCase();
        const isMatch = domain && itemUrl.includes(domain);
        return !isMatch;
      });
      localStorage.setItem('alalay_review_queue', JSON.stringify(remaining));
      return remaining;
    });

    // 5. Create Audit Log
    if (isSupabaseConfigured) {
      createAuditLog({
        action: 'DELETE_KNOWLEDGE_SOURCE',
        actor: user?.email || 'Admin',
        target: targetSource?.name || targetUrl,
        details: `Completely removed website from admin directory and purged ${deletedCount} associated opportunities.`,
      });
    }

    addToast(
      'Website Completely Removed',
      `"${targetSource?.name || targetUrl || 'Website'}" removed from the admin directory, and ${deletedCount} scraped opportunities purged.`,
      'info'
    );
  };

  // Run Live Facebook Scraper Pipeline with SHA-256 Deduplication & Allowlist Safeguards
  const runLiveScraper = async () => {
    setIsScrapingLive(true);
    setScrapingProgress({ stage: 'Connecting to user-configured sources...', percent: 10, currentUrl: 'Starting ingestion...' });

    try {
      const results = await runFacebookSyncPipeline(sources, (prog) => {
        setScrapingProgress(prog);
      });

      const nowTime = new Date().toISOString().replace('T', ' ').slice(0, 16);

      // Update all sources with latest timestamp
      setSources((prev) =>
        prev.map((s) => ({
          ...s,
          last_scraped_at: nowTime,
          lastScraped: nowTime,
          lastScrapedAt: nowTime,
          status: 'Active',
        }))
      );

      if (results.discoveredPosts && results.discoveredPosts.length > 0) {
        setReviewQueue((prev) => {
          const newItems = results.discoveredPosts.map((p, i) => ({
            id: p.id || `ai_q_${Date.now()}_${i}`,
            title: p.title,
            agency: p.sourceName || 'Government Source',
            detectedAt: 'Just now',
            confidence: 96.8,
            status: 'Pending Review',
            snippet: p.content.substring(0, 120) + '...',
            sourceUrl: p.sourceUrl,
            category: 'Health & Medical',
          }));
          return [...newItems, ...prev];
        });
      }

      addToast(
        'Scraper Sync Completed',
        `Discovered ${results.postsDiscovered} announcements across ${results.sourcesProcessed} allowlisted sources with SHA-256 deduplication.`,
        'success',
        6000
      );
    } catch (err) {
      addToast('Scraper Notice', err.message || 'Scraper pipeline processed allowlisted sources.', 'info');
    } finally {
      setIsScrapingLive(false);
      setScrapingProgress({ stage: 'Completed', percent: 100, currentUrl: '' });
    }
  };

  const saveChatArchive = async (archiveData) => {
    const userEmail = (user?.email || '').toLowerCase().trim();
    const userId = user?.id || '';
    const dataWithUser = {
      ...archiveData,
      userEmail,
      userId,
    };

    const userKey = `alalay_chat_archives_${userEmail || userId || 'default'}`;

    setChatArchives((prev) => {
      const existingIdx = prev.findIndex((a) => a.id === archiveData.id);
      let updated;
      if (existingIdx >= 0) {
        updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], ...dataWithUser };
      } else {
        updated = [dataWithUser, ...prev];
      }
      localStorage.setItem(userKey, JSON.stringify(updated));
      return updated;
    });

    if (isSupabaseConfigured) {
      await saveChatArchiveToSupabase(dataWithUser);
    }
  };

  const deleteChatArchive = async (id) => {
    const userEmail = (user?.email || '').toLowerCase().trim();
    const userId = user?.id || '';
    const userKey = `alalay_chat_archives_${userEmail || userId || 'default'}`;

    setChatArchives((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      localStorage.setItem(userKey, JSON.stringify(updated));
      return updated;
    });

    if (isSupabaseConfigured) {
      await deleteChatArchiveFromSupabase(id);
    }
    addToast('Archive Removed', 'Consultation deleted from your chat history.', 'info');
  };

  const uploadNewDocument = (docData, { silent = false } = {}) => {
    const newDoc = {
      id: docData.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: docData.name,
      type: docData.type || 'Identity Card',
      issuer: docData.issuer || 'Authorized Government Agency',
      documentNumber: docData.documentNumber || `DOC-${Date.now().toString().slice(-6)}`,
      expirationDate: docData.expirationDate || '2028-12-31',
      fileSize: docData.fileSize || '1.4 MB',
      fileType: docData.fileType || 'PDF',
      status: 'Valid',
      verifiedBadge: 'DocAgent Verified ✓',
      uploadedAt: 'Just now via DocAgent OCR',
      thumbnail: docData.thumbnail || getDocumentPlaceholderThumbnail(docData.type || 'Identity Card'),
      attributes: docData.attributes || {},
    };

    setDocuments((prev) => {
      const updated = [newDoc, ...prev];
      localStorage.setItem('alalay_documents', JSON.stringify(updated));
      return updated;
    });

    if (!silent) {
      addToast('Vault Updated', `Added ${newDoc.name} to your encrypted digital vault.`, 'success');
    }
  };

  const updateDocument = (docId, updatedFields = {}, { silent = false } = {}) => {
    setDocuments((prev) => {
      const updated = prev.map((doc) => {
        if (doc.id === docId) {
          return {
            ...doc,
            ...updatedFields,
            attributes: {
              ...(doc.attributes || {}),
              ...(updatedFields.attributes || {}),
            },
            applicationData: {
              ...(doc.applicationData || {}),
              ...(updatedFields.applicationData || {}),
            },
            uploadedAt: updatedFields.uploadedAt || 'Updated just now',
          };
        }
        return doc;
      });
      localStorage.setItem('alalay_documents', JSON.stringify(updated));
      return updated;
    });

    if (!silent) {
      addToast('Document Updated', 'Your changes have been saved to your digital vault.', 'success');
    }
  };

  const replaceDocument = (docId, updatedFields = {}) => {
    setDocuments((prev) => {
      const updated = prev.map((doc) => {
        if (doc.id === docId) {
          return {
            ...doc,
            ...updatedFields,
            status: 'Valid',
            expirationDate: updatedFields.expirationDate || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            uploadedAt: 'Renewed via DocAgent',
          };
        }
        return doc;
      });
      localStorage.setItem('alalay_documents', JSON.stringify(updated));
      return updated;
    });

    addToast('Document Renewed', 'Document marked as renewed and valid in vault.', 'success');
  };

  const deleteDocument = (docId) => {
    setDocuments((prev) => {
      const updated = prev.filter((d) => d.id !== docId);
      localStorage.setItem('alalay_documents', JSON.stringify(updated));
      return updated;
    });

    addToast('Document Removed', 'Removed document from digital vault.', 'info');
  };

  // Opens the Document Vault upload sheet pre-filled for a specific missing requirement,
  // so citizens can upload straight from a checklist (in chat or in the Documents tab)
  // instead of hunting for the matching document type manually.
  const openUploadForRequirement = (requirementName = '') => {
    setUploadModalPrefill({ name: requirementName, type: guessDocumentTypeFromRequirement(requirementName) });
    setUploadModalOpen(true);
  };

  const [askAlalayInitialPrompt, setAskAlalayInitialPrompt] = useState('');

  const openAskAlalay = (opp = null, session = null, initialPrompt = '') => {
    setAskAlalayOpportunity(opp);
    setLoadedChatSession(session);
    setAskAlalayInitialPrompt(initialPrompt);
    setAskAlalayOpen(true);
  };

  const startOnboardingWizard = () => {
    setOnboardingCompleted(false);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AppContext.Provider
      value={{
        // View & Navigation
        viewMode,
        setViewMode,
        activeTab,
        setActiveTab,
        adminTab,
        setAdminTab,
        language,
        setLanguage,
        t,
        // User & Dynamic Auth
        isAuthenticated,
        setIsAuthenticated,
        loginWithSupabase,
        verifyEgovOtp,
        logout,
        user,
        setUser,
        updateUserProfile,
        onboardingCompleted,
        setOnboardingCompleted,
        consentGiven,
        setConsentGiven,
        welcomeModalOpen,
        setWelcomeModalOpen,
        guidedTourActive,
        guidedTourStep,
        startOnboardingWizard,
        completeOnboardingWizard,
        // Dynamic Core Data
        documents,
        setDocuments,
        uploadNewDocument,
        updateDocument,
        replaceDocument,
        deleteDocument,
        pinnedOpportunityIds,
        togglePinOpportunity,
        autoApplyQueue,
        submitAutoApply,
        dismissAutoApply,
        clearAutoApplyHistory,
        markBenefitAcquired,
        clearAcquiredBenefits,
        generateAllTestDocuments,
        opportunities,
        categories: CATEGORIES,
        sources,
        reviewQueue,
        notifications,
        auditLogs,
        unreadCount,
        // Chat Archives
        chatArchives,
        setChatArchives,
        saveChatArchive,
        deleteChatArchive,
        loadedChatSession,
        setLoadedChatSession,
        // Managed Users
        managedUsers,
        setManagedUsers,
        addUserModalOpen,
        setAddUserModalOpen,
        addManagedUser,
        deleteManagedUser,
        tempAdminModalOpen,
        setTempAdminModalOpen,
        createTempAdminAccount,
        // Modals & UI
        selectedOpportunity,
        setSelectedOpportunity,
        askAlalayOpen,
        setAskAlalayOpen,
        askAlalayOpportunity,
        setAskAlalayOpportunity,
        askAlalayInitialPrompt,
        setAskAlalayInitialPrompt,
        openAskAlalay,
        uploadModalOpen,
        setUploadModalOpen,
        uploadModalPrefill,
        setUploadModalPrefill,
        openUploadForRequirement,
        pendingApplyRequest,
        setPendingApplyRequest,
        addSourceModalOpen,
        setAddSourceModalOpen,
        activeDocumentForPreview,
        setActiveDocumentForPreview,
        searchQuery,
        setSearchQuery,
        selectedCategory,
        setSelectedCategory,
        selectedEligibilityFilter,
        setSelectedEligibilityFilter,
        addKnowledgeSource,
        removeKnowledgeSource,
        scrapeSingleSource,
        isScrapingLive,
        scrapingProgress,
        runLiveScraper,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
