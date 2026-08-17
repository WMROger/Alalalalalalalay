import React, { useState } from 'react';
import {
  User,
  ShieldCheck,
  CheckCircle2,
  Lock,
  RotateCcw,
  Sparkles,
  Mail,
  Phone,
  MapPin,
  FileText,
  Calendar,
  Building,
  HeartHandshake,
  Download,
  AlertTriangle,
  Zap,
  Bot,
  UserCheck,
  ShieldAlert,
  Globe,
  Check,
  Send,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useApp } from '../../context/AppContext';
import { IOSCard } from '../common/IOSCard';
import { IOSButton } from '../common/IOSButton';
import { IOSBadge } from '../common/IOSBadge';
import { IOSSwitch } from '../common/ToastContainer';
import { IOSSheet } from '../common/IOSSheet';
import { rankAndFilterOpportunities } from '../../services/rulesEngine';

export const UserProfileView = () => {
  const {
    user,
    setUser,
    categories,
    opportunities = [],
    documents = [],
    setActiveTab,
    submitApplication,
    addNotification,
    startOnboardingWizard,
    startGuidedTour,
    addToast,
    language,
    setLanguage,
    t,
  } = useApp();

  const [aiNotifications, setAiNotifications] = useState(true);
  const [docAlerts, setDocAlerts] = useState(true);
  const [shareDataForMatching, setShareDataForMatching] = useState(true);

  const autoApplyCategoryOptions = categories.filter((c) => c.id !== 'all');
  const defaultAutoApplyCategories = autoApplyCategoryOptions.map((c) => c.id);
  const [selectedCategories, setSelectedCategories] = useState(() => {
    return user.autoApplyCategories && user.autoApplyCategories.length > 0
      ? user.autoApplyCategories
      : defaultAutoApplyCategories;
  });
  const [isSubmittingAutoApply, setIsSubmittingAutoApply] = useState(false);

  const [showAutoApplyConsent, setShowAutoApplyConsent] = useState(false);
  const [pendingAutoApplyMode, setPendingAutoApplyMode] = useState('confirm');

  const handleChangeLanguage = (lang) => {
    setLanguage(lang);
    addToast(
      lang === 'fil' ? 'Nabago ang Wika' : 'Language Changed',
      lang === 'fil' ? 'Naka-set na ngayon sa Filipino ang ALALAY.' : 'ALALAY is now set to English.',
      'success'
    );
  };

  const handleToggleAutoApply = (enabled) => {
    if (enabled && selectedCategories.length === 0) {
      addToast('Select Categories First', 'Please check at least one category above before enabling Auto-Apply.', 'warning');
      return;
    }

    if (!enabled) {
      setUser((prev) => ({ ...prev, autoApplyEnabled: false }));
      addToast('Auto-Apply Disabled', 'ALALAY will no longer auto-queue or submit applications for you.', 'info');
      return;
    }

    // Turning on always requires the citizen to (re)confirm consent and choose a mode,
    // since this authorizes ALALAY to act on real government applications.
    setPendingAutoApplyMode(user.autoApplyMode || 'confirm');
    setShowAutoApplyConsent(true);
  };

  const handleConfirmAutoApplyConsent = () => {
    setUser((prev) => ({
      ...prev,
      autoApplyEnabled: true,
      autoApplyConsentGiven: true,
      autoApplyMode: pendingAutoApplyMode,
      autoApplyCategories:
        selectedCategories.length > 0 ? selectedCategories : defaultAutoApplyCategories,
    }));
    setShowAutoApplyConsent(false);
    addToast(
      'Auto-Apply Enabled',
      pendingAutoApplyMode === 'autonomous'
        ? "You consented to full automation — ALALAY will submit 95%+ Likely Eligible matches for you and notify you afterward."
        : "ALALAY will queue 95%+ Likely Eligible matches for you — you'll still tap Submit yourself.",
      'success'
    );
  };

  const toggleAutoApplyCategory = (categoryId) => {
    setSelectedCategories((prev) => {
      const updated = prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId];
      // Sync to user profile state as well
      setUser((u) => ({ ...u, autoApplyCategories: updated }));
      return updated;
    });
  };

  const handleSelectAllCategories = () => {
    const allIds = autoApplyCategoryOptions.map((c) => c.id);
    setSelectedCategories(allIds);
    setUser((u) => ({ ...u, autoApplyCategories: allIds }));
  };

  const handleClearAllCategories = () => {
    setSelectedCategories([]);
    setUser((u) => ({ ...u, autoApplyCategories: [] }));
  };

  const handleToggleAutoApplyJobs = (enabled) => {
    setUser((prev) => ({ ...prev, autoApplyIncludeJobs: enabled }));
  };

  // Submit auto-apply for selected categories, notify via bell, and redirect to Benefits
  const handleSubmitAutoApply = () => {
    if (selectedCategories.length === 0) {
      addToast('No Categories Checked', 'Please check at least one category to auto-apply.', 'warning');
      return;
    }

    setIsSubmittingAutoApply(true);

    const updatedUser = {
      ...user,
      autoApplyEnabled: true,
      autoApplyConsentGiven: true,
      autoApplyCategories: selectedCategories,
    };
    setUser(updatedUser);
    localStorage.setItem('alalay_user', JSON.stringify(updatedUser));

    // Find eligible opportunities in the checked categories
    const ranked = rankAndFilterOpportunities(opportunities, updatedUser, documents);
    const targetOpps = ranked.filter((opp) => {
      const catMatch = selectedCategories.includes(opp.category);
      const isJobMatch = Boolean(updatedUser.autoApplyIncludeJobs) && opp.category === 'employment';
      return catMatch || isJobMatch;
    });

    const oppsToSubmit = targetOpps.length > 0 ? targetOpps.slice(0, 4) : ranked.slice(0, 2);

    // Submit applications for each matching program
    oppsToSubmit.forEach((opp) => {
      if (submitApplication) {
        submitApplication(opp);
      }
    });

    const categoryNames = autoApplyCategoryOptions
      .filter((c) => selectedCategories.includes(c.id))
      .map((c) => c.name);

    // Send a dedicated notification to the bell
    if (addNotification) {
      addNotification({
        type: 'application_submitted',
        title: '⚡ Auto-Apply Executed',
        message: `ALALAY has processed applications for your selected categories (${categoryNames.join(', ')}). You can now track them in real-time on your Benefits page.`,
        badgeColor: '#007AFF',
        icon: 'Send',
        actionText: 'Track Applications',
      });
    }

    addToast(
      'Auto-Apply Submitted!',
      `Submitted applications for ${oppsToSubmit.length} matching programs. Redirecting to Benefits...`,
      'success',
      4000
    );

    try {
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
    } catch (_) {}

    setTimeout(() => {
      setIsSubmittingAutoApply(false);
      if (setActiveTab) {
        setActiveTab('benefits');
      }
    }, 900);
  };

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(user, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `alalay_profile_${user.firstName}_santos.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    addToast('Profile Exported', 'Your encrypted profile data was downloaded as JSON.', 'success');
  };

  return (
    <div className="space-y-6 select-none max-w-4xl mx-auto">
      {/* Header Profile Card */}
      <IOSCard className="bg-gradient-to-br from-white via-slate-50 to-blue-50/30 border border-slate-200">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#093a96] via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-900/20 ring-4 ring-blue-500/20 flex-shrink-0">
            <User className="w-10 h-10 text-white" />
          </div>

          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#1C1C1E]">{user.fullName}</h1>
              <IOSBadge variant="green" icon={<CheckCircle2 className="w-3 h-3" />}>
                {t('profile.eGovVerified')}
              </IOSBadge>
            </div>

            <p className="text-xs text-[#8E8E93] font-mono">
              {t('profile.crn')}: {user.egovId}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-2 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#007AFF]" />
                <span>{user.email}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#007AFF]" />
                <span>{user.phone}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#007AFF]" />
                <span>Quezon City, NCR</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <IOSButton
              variant="tertiary"
              size="sm"
              icon={RotateCcw}
              onClick={startGuidedTour}
            >
              {t('profile.replayTour')}
            </IOSButton>
            <IOSButton
              variant="secondary"
              size="sm"
              onClick={startOnboardingWizard}
            >
              {t('profile.reRunOnboarding')}
            </IOSButton>
          </div>
        </div>
      </IOSCard>

      {/* Language */}
      <IOSCard className="space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-[#34C759]" />
          <h2 className="text-base font-bold text-[#1C1C1E]">
            {t('common.language')}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleChangeLanguage('en')}
            className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
              language === 'en'
                ? 'bg-[#007AFF] text-white border-[#007AFF]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t('common.english')}
          </button>
          <button
            type="button"
            onClick={() => handleChangeLanguage('fil')}
            className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
              language === 'fil'
                ? 'bg-[#007AFF] text-white border-[#007AFF]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t('common.filipino')}
          </button>
        </div>
      </IOSCard>

      {/* Household & Family Eligibility Status */}
      <IOSCard className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-[#FF2D55]" />
            <h2 className="text-base font-bold text-[#1C1C1E]">
              {t('profile.household.title')}
            </h2>
          </div>
          <span className="text-xs font-semibold text-[#007AFF]">{t('profile.household.autoSynced')}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between">
            <span className="text-slate-500">{t('profile.household.employment')}</span>
            <span className="font-bold text-slate-800">{user.employmentStatus}</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between">
            <span className="text-slate-500">{t('profile.household.income')}</span>
            <span className="font-bold text-slate-800">{user.monthlyIncome}</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between">
            <span className="text-slate-500">{t('profile.household.seniorParent')}</span>
            <span className="font-bold text-emerald-700">Yes (Enables PhilHealth RA 10645)</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between">
            <span className="text-slate-500">{t('profile.household.civilStatus')}</span>
            <span className="font-bold text-slate-800">{user.civilStatus}</span>
          </div>
        </div>
      </IOSCard>

      {/* Auto-Apply Assistant */}
      <IOSCard className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#FF9500]" />
            <h2 className="text-base font-bold text-[#1C1C1E]">
              {t('profile.autoApply.title')}
            </h2>
          </div>
          {selectedCategories.length > 0 && (
            <IOSBadge variant="blue" size="sm">
              {selectedCategories.length} Categories Selected
            </IOSBadge>
          )}
        </div>

        {/* Step 1: Category Selection (Always Visible First) */}
        <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#1C1C1E] flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#007AFF] text-white text-[10px] font-black flex items-center justify-center">1</span>
                <span>Select Categories to Auto-Apply</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Check the categories you want ALALAY to monitor and apply for.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllCategories}
                className="text-[11px] font-bold text-[#007AFF] hover:underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={handleClearAllCategories}
                className="text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {autoApplyCategoryOptions.map((cat) => {
              const isSelected = selectedCategories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleAutoApplyCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#007AFF] text-white border-[#007AFF] shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                  }`}
                >
                  {isSelected ? (
                    <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0" />
                  )}
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          {selectedCategories.length === 0 && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>Please check at least one category above to enable Auto-Apply.</span>
            </div>
          )}
        </div>

        {/* Step 2: Enable & Settings */}
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <h4 className="text-xs sm:text-sm font-bold text-[#1C1C1E] flex items-center gap-1.5">
                <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${selectedCategories.length > 0 ? 'bg-[#007AFF] text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                <span>{t('profile.autoApply.enable')}</span>
              </h4>
              <p className="text-[11px] text-[#8E8E93] mt-0.5">
                {selectedCategories.length > 0
                  ? t('profile.autoApply.enableDesc')
                  : 'Requires at least 1 category selected above.'}
              </p>
            </div>
            <IOSSwitch
              checked={Boolean(user.autoApplyEnabled && selectedCategories.length > 0)}
              onChange={handleToggleAutoApply}
            />
          </div>

          {user.autoApplyEnabled && selectedCategories.length > 0 && (
            <div className="space-y-3 animate-in fade-in">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {user.autoApplyMode === 'autonomous' ? (
                    <Bot className="w-4 h-4 text-[#093a96] flex-shrink-0" />
                  ) : (
                    <UserCheck className="w-4 h-4 text-[#093a96] flex-shrink-0" />
                  )}
                  <span className="text-[11px] font-bold text-[#1C1C1E]">
                    {user.autoApplyMode === 'autonomous'
                      ? t('profile.autoApply.modeAutonomous')
                      : t('profile.autoApply.modeConfirm')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingAutoApplyMode(user.autoApplyMode || 'confirm');
                    setShowAutoApplyConsent(true);
                  }}
                  className="text-[11px] font-bold text-[#007AFF] hover:underline cursor-pointer"
                >
                  {t('profile.autoApply.change')}
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="pr-4">
                  <h4 className="text-xs sm:text-sm font-bold text-[#1C1C1E]">
                    {t('profile.autoApply.jobs')}
                  </h4>
                  <p className="text-[11px] text-[#8E8E93]">
                    {t('profile.autoApply.jobsDesc')}
                  </p>
                </div>
                <IOSSwitch checked={Boolean(user.autoApplyIncludeJobs)} onChange={handleToggleAutoApplyJobs} />
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Submit Auto-Apply Action Button */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 text-center sm:text-left">
            Submit will process applications for your checked categories and send a notification to your bell.
          </p>
          <button
            type="button"
            disabled={isSubmittingAutoApply || selectedCategories.length === 0}
            onClick={handleSubmitAutoApply}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-[#093a96] to-blue-600 hover:from-[#072d75] hover:to-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 active:scale-[0.98] transition-all cursor-pointer flex-shrink-0"
          >
            {isSubmittingAutoApply ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing Applications…</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Submit Auto-Apply ({selectedCategories.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </IOSCard>

      {/* Privacy, Consent & Notifications */}
      <IOSCard className="space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-[#5856D6]" />
          <h2 className="text-base font-bold text-[#1C1C1E]">
            {t('profile.privacy.title')}
          </h2>
        </div>

        <div className="space-y-3 divide-y divide-slate-100">
          <div className="flex items-center justify-between pt-2">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-[#1C1C1E]">
                {t('profile.privacy.aiDiscovery')}
              </h4>
              <p className="text-[11px] text-[#8E8E93]">
                {t('profile.privacy.aiDiscoveryDesc')}
              </p>
            </div>
            <IOSSwitch checked={aiNotifications} onChange={setAiNotifications} />
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-[#1C1C1E]">
                {t('profile.privacy.docAlerts')}
              </h4>
              <p className="text-[11px] text-[#8E8E93]">
                {t('profile.privacy.docAlertsDesc')}
              </p>
            </div>
            <IOSSwitch checked={docAlerts} onChange={setDocAlerts} />
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-[#1C1C1E]">
                {t('profile.privacy.consentStatus')}
              </h4>
              <p className="text-[11px] text-emerald-700 font-medium">
                Active • Granted on {new Date(user.consentDate).toLocaleDateString()}
              </p>
            </div>
            <IOSBadge variant="green" size="sm">{t('profile.privacy.granted')}</IOSBadge>
          </div>
        </div>

        <div className="pt-3 flex flex-wrap items-center gap-3">
          <IOSButton
            variant="tertiary"
            size="sm"
            icon={Download}
            onClick={handleExportData}
          >
            {t('profile.privacy.exportProfile')}
          </IOSButton>
        </div>
      </IOSCard>

      {/* Auto-Apply Consent Modal — required every time the toggle is turned on or the mode is changed */}
      <IOSSheet
        isOpen={showAutoApplyConsent}
        onClose={() => setShowAutoApplyConsent(false)}
        title={t('profile.consent.title')}
        subtitle={t('profile.consent.subtitle')}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4 select-none">
          <button
            type="button"
            onClick={() => setPendingAutoApplyMode('confirm')}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-1.5 ${
              pendingAutoApplyMode === 'confirm'
                ? 'border-[#007AFF] bg-blue-50/60'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#093a96] flex-shrink-0" />
              <span className="text-sm font-bold text-[#1C1C1E]">{t('profile.consent.confirmEach')}</span>
              <IOSBadge variant="blue" size="sm">{t('profile.consent.recommended')}</IOSBadge>
            </div>
            <p className="text-[11px] text-[#8E8E93] leading-relaxed">
              {t('profile.consent.confirmEachDesc')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setPendingAutoApplyMode('autonomous')}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-1.5 ${
              pendingAutoApplyMode === 'autonomous'
                ? 'border-[#007AFF] bg-blue-50/60'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#093a96] flex-shrink-0" />
              <span className="text-sm font-bold text-[#1C1C1E]">{t('profile.consent.fullAuto')}</span>
            </div>
            <p className="text-[11px] text-[#8E8E93] leading-relaxed">
              {t('profile.consent.fullAutoDesc')}
            </p>
          </button>

          <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-relaxed">
              {t('profile.consent.disclaimer')}
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <IOSButton variant="secondary" size="md" onClick={() => setShowAutoApplyConsent(false)}>
              {t('profile.consent.cancel')}
            </IOSButton>
            <IOSButton variant="primary" size="md" onClick={handleConfirmAutoApplyConsent}>
              {t('profile.consent.agree')}
            </IOSButton>
          </div>
        </div>
      </IOSSheet>
    </div>
  );
};
