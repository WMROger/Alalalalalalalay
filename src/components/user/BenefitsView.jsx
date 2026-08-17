import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Award,
  History,
  CheckCircle2,
  X,
  ChevronDown,
  Gift,
  Send,
  RefreshCw,
  Play,
  Clock,
  Building,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { rankAndFilterOpportunities } from '../../services/rulesEngine';

// ─────────────────────────────────────────────────────────────────────────────
// STEP CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TRACKER_STEPS = [
  {
    step: 1,
    label: 'Application Received',
    desc: 'Your application package was successfully received by the agency system.',
    icon: Send,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    activeBg: 'bg-[#093a96]',
    activeText: 'text-white',
  },
  {
    step: 2,
    label: 'Agency Review',
    desc: 'The assigned government officer is reviewing your submitted documents.',
    icon: RefreshCw,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    activeBg: 'bg-amber-500',
    activeText: 'text-white',
  },
  {
    step: 3,
    label: 'Approved ✓',
    desc: 'Your application has been approved. You are now part of this program!',
    icon: ShieldCheck,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    activeBg: 'bg-emerald-500',
    activeText: 'text-white',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TRACKER CARD
// ─────────────────────────────────────────────────────────────────────────────
const TrackerCard = ({ tracker, onAdvance }) => {
  const [simRunning, setSimRunning] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const isDone = tracker.currentStep >= 3;

  const startSimulation = () => {
    if (simRunning || isDone) return;
    setSimRunning(true);

    // Countdown display
    let secs = 3;
    setCountdown(secs);
    countdownRef.current = setInterval(() => {
      secs -= 1;
      setCountdown(secs);
      if (secs <= 0) {
        clearInterval(countdownRef.current);
        setCountdown(null);
      }
    }, 1000);

    // Advance step after 3s
    timerRef.current = setTimeout(() => {
      onAdvance(tracker.id);
      setSimRunning(false);
    }, 3000);
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      clearInterval(countdownRef.current);
    };
  }, []);

  // If step advances during simulation (step 2 → 3), auto-start next 10s
  const prevStep = useRef(tracker.currentStep);
  useEffect(() => {
    if (prevStep.current !== tracker.currentStep) {
      prevStep.current = tracker.currentStep;
      setSimRunning(false);
      clearTimeout(timerRef.current);
      clearInterval(countdownRef.current);
      setCountdown(null);

      // If step was just advanced to 2, auto-start next phase
      if (tracker.currentStep === 2 && !isDone) {
        setTimeout(() => startSimulation(), 600);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker.currentStep]);

  const submittedDate = tracker.submittedAt
    ? new Date(tracker.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'recently';

  return (
    <div className={`rounded-3xl border overflow-hidden shadow-sm transition-all ${isDone ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
      {/* Card Header */}
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isDone ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                <CheckCircle2 className="w-3 h-3" />
                Approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-[#093a96] text-[10px] font-bold">
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing
              </span>
            )}
            <span className="text-[10px] text-slate-400 font-medium">Submitted {submittedDate}</span>
          </div>
          <h3 className="text-sm font-extrabold text-slate-900 leading-snug">{tracker.oppTitle}</h3>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Building className="w-3 h-3" />
            <span>{tracker.agency}</span>
          </div>
        </div>

        {/* Start / Running state */}
        {!isDone && (
          <div className="flex-shrink-0">
            {simRunning ? (
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-full border-2 border-amber-400 flex items-center justify-center bg-amber-50">
                  <span className="text-xs font-black text-amber-600">{countdown ?? '…'}</span>
                </div>
                <span className="text-[9px] text-slate-400 font-medium">sec</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={startSimulation}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#093a96] hover:bg-[#072d75] text-white text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Progress Stepper */}
      <div className="px-5 sm:px-6 pb-5 sm:pb-6">
        <div className="relative">
          {/* Connector line */}
          <div className="absolute top-5 left-5 right-5 h-0.5 bg-slate-100 z-0" />
          <div
            className="absolute top-5 left-5 h-0.5 bg-gradient-to-r from-[#093a96] to-emerald-500 z-0 transition-all duration-700"
            style={{ width: `${((tracker.currentStep - 1) / 2) * 100}%` }}
          />

          {/* Steps */}
          <div className="relative z-10 grid grid-cols-3 gap-2">
            {TRACKER_STEPS.map((s) => {
              const isActive = tracker.currentStep === s.step;
              const isDoneStep = tracker.currentStep > s.step;
              const StepIcon = s.icon;

              return (
                <div key={s.step} className="flex flex-col items-center gap-2 text-center">
                  <div
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                      isDoneStep
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                        : isActive
                        ? `${s.activeBg} border-transparent ${s.activeText} shadow-lg ${tracker.currentStep < 3 ? 'ring-4 ring-offset-1 ring-blue-200 animate-pulse' : ''}`
                        : 'bg-white border-slate-200 text-slate-300'
                    }`}
                  >
                    {isDoneStep ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <StepIcon className={`w-4 h-4 ${isActive && simRunning && s.step === 2 ? 'animate-spin' : ''}`} />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className={`text-[10px] font-bold leading-tight ${isActive || isDoneStep ? 'text-slate-900' : 'text-slate-400'}`}>
                      {s.label}
                    </p>
                    {(isActive || isDoneStep) && (
                      <p className="text-[9px] text-slate-500 leading-snug hidden sm:block max-w-[90px] mx-auto">
                        {s.desc}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active step description on mobile */}
        {!isDone && (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 leading-relaxed sm:hidden">
            {TRACKER_STEPS.find((s) => s.step === tracker.currentStep)?.desc}
          </div>
        )}

        {isDone && (
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-emerald-800">🎉 Congratulations!</p>
              <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                You are now officially part of <strong>{tracker.oppTitle}</strong>. Check the Benefits Received section below to see your new benefit.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN VIEW
// ─────────────────────────────────────────────────────────────────────────────
export const BenefitsView = () => {
  const {
    opportunities,
    documents,
    user,
    autoApplyQueue,
    setSelectedOpportunity,
    setActiveTab,
    dismissAutoApply,
    markBenefitAcquired,
    clearAutoApplyHistory,
    clearAcquiredBenefits,
    applicationTrackers,
    advanceTrackerStep,
    t,
  } = useApp();

  const [showApplied, setShowApplied] = useState(true);

  const rankedOpportunities = useMemo(
    () => rankAndFilterOpportunities(opportunities, user, documents),
    [opportunities, user, documents]
  );

  const acquiredEntries = useMemo(() => {
    return (autoApplyQueue || [])
      .filter((entry) => entry.status === 'acquired')
      .map((entry) => ({ ...entry, opp: rankedOpportunities.find((o) => o.id === entry.oppId) }))
      .filter((entry) => entry.opp)
      .sort((a, b) => new Date(b.acquiredAt || 0) - new Date(a.acquiredAt || 0));
  }, [autoApplyQueue, rankedOpportunities]);

  const appliedEntries = useMemo(() => {
    return (autoApplyQueue || [])
      .filter((entry) => entry.status === 'applied')
      .map((entry) => ({ ...entry, opp: rankedOpportunities.find((o) => o.id === entry.oppId) }))
      .filter((entry) => entry.opp)
      .sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0));
  }, [autoApplyQueue, rankedOpportunities]);

  // Only show trackers that are not yet fully done (step 3) — or keep all so user can see approved ones too
  const activeTrackers = applicationTrackers || [];

  return (
    <div className="space-y-8 select-none max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {t('benefits.title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          {t('benefits.subtitle')}
        </p>
      </div>

      {/* ================================================================ */}
      {/* APPLICATION TRACKER */}
      {/* ================================================================ */}
      {activeTrackers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#093a96]/10 text-[#093a96] flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">
                Application Tracker ({activeTrackers.length})
              </h2>
              <p className="text-[11px] text-slate-500">Track the real-time processing status of your submitted applications.</p>
            </div>
          </div>

          <div className="space-y-4">
            {activeTrackers.map((tracker) => (
              <TrackerCard
                key={tracker.id}
                tracker={tracker}
                onAdvance={advanceTrackerStep}
              />
            ))}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* BENEFITS YOU HAVE (ACQUIRED) */}
      {/* ================================================================ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900">
              {t('home.acquiredBenefits.title')} ({acquiredEntries.length})
            </h2>
            <p className="text-[11px] text-slate-500">{t('home.acquiredBenefits.desc')}</p>
          </div>
        </div>

        {acquiredEntries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {acquiredEntries.map((entry) => (
              <div
                key={entry.oppId}
                onClick={() => setSelectedOpportunity(entry.opp)}
                className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 hover:border-amber-300 flex items-start justify-between gap-3 cursor-pointer transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-bold text-[#1C1C1E] truncate">{entry.opp.title}</p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {entry.opp.agency || 'Government Service'} • Received{' '}
                    {entry.acquiredAt
                      ? new Date(entry.acquiredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'recently'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold">
                    <Award className="w-3 h-3" />
                    <span>{t('home.acquiredBenefits.received')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissAutoApply(entry.oppId);
                    }}
                    aria-label="Remove from benefits received"
                    className="w-6 h-6 rounded-lg bg-white border border-amber-200 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyBenefitsState
            icon={Award}
            title={t('benefits.empty.receivedTitle')}
            desc={t('benefits.empty.receivedDesc')}
          />
        )}

        {acquiredEntries.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => clearAcquiredBenefits()}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-[10px] font-bold transition-colors cursor-pointer"
            >
              {t('home.autoApply.clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* APPLIED BENEFITS (submitted, awaiting confirmation) */}
      {/* ================================================================ */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="w-full p-4 sm:p-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowApplied((prev) => !prev)}
            className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#093a96] flex items-center justify-center flex-shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div className="text-left min-w-0">
              <h2 className="text-sm font-black text-[#0f172a]">
                {t('home.autoApply.historyTitle')} ({appliedEntries.length})
              </h2>
              <p className="text-[11px] text-slate-500">{t('home.autoApply.historyDesc')}</p>
            </div>
          </button>

          <div className="flex items-center gap-2 flex-shrink-0">
            {appliedEntries.length > 0 && (
              <button
                type="button"
                onClick={() => clearAutoApplyHistory()}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-[10px] font-bold transition-colors cursor-pointer"
              >
                {t('home.autoApply.clearAll')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowApplied((prev) => !prev)}
              aria-label={showApplied ? 'Collapse applied benefits' : 'Expand applied benefits'}
              className="cursor-pointer"
            >
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showApplied ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {showApplied && (
          <div className="px-4 sm:px-5 pb-4 sm:pb-5">
            {appliedEntries.length > 0 ? (
              <div className="space-y-2">
                {appliedEntries.map((entry) => (
                  <div
                    key={entry.oppId}
                    onClick={() => setSelectedOpportunity(entry.opp)}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-blue-300 flex items-center justify-between gap-3 flex-wrap cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1C1C1E] truncate">{entry.opp.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {entry.opp.agency || 'Government Service'} • Applied{' '}
                        {entry.appliedAt
                          ? new Date(entry.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'recently'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t('home.autoApply.applied')}</span>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markBenefitAcquired(entry.oppId);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        {t('home.autoApply.markReceived')}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissAutoApply(entry.oppId);
                        }}
                        aria-label="Remove from history"
                        className="w-6 h-6 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBenefitsState
                icon={History}
                title={t('benefits.empty.appliedTitle')}
                desc={t('benefits.empty.appliedDesc')}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setActiveTab('explore')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-[#093a96] text-sm font-bold border border-blue-200 hover:bg-blue-50 transition-all cursor-pointer"
        >
          <Gift className="w-4 h-4" />
          <span>{t('benefits.exploreCta')}</span>
        </button>
      </div>
    </div>
  );
};

const EmptyBenefitsState = ({ icon: Icon, title, desc }) => (
  <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200 space-y-2">
    <div className="w-11 h-11 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
      <Icon className="w-5 h-5" />
    </div>
    <h3 className="text-sm font-bold text-slate-700">{title}</h3>
    <p className="text-xs text-slate-500 max-w-sm mx-auto">{desc}</p>
  </div>
);
