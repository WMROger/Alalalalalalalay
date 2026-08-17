import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Check,
  Plus,
  Activity,
  CreditCard,
  Building,
  CheckCircle2,
  X,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Gift,
  FileText,
  HelpCircle,
  Clock,
  FolderCheck,
  BadgeCheck,
  Send,
  Bot,
  MessageSquare,
  ArrowRight,
  RotateCcw,
  Trash2,
  Maximize2,
  Award,
  AlertCircle,
  UploadCloud,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { IOSButton } from '../common/IOSButton';
import { askAlalayAI } from '../../services/geminiService';
import { matchOpportunityForCitizen, matchRequirementWithUserDoc } from '../../services/rulesEngine';
import { resolveIntakeProgramId, buildIntakeSession, getActiveGapFields } from '../../services/applyAiService';
import logoImg from '../../assets/AIlogos.png';

// A requirement counts as "the application form itself" (as opposed to a supporting ID
// or certificate) when its wording matches these patterns — that's the one item ALALAY
// can actually fill out on the citizen's behalf, rather than something they must upload.
const isApplicationFormRequirement = (name = '') =>
  /application form|filled out|official.*(government )?form|registration form/i.test(name);

import { AiMessageRenderer } from '../common/AiMessageRenderer';

/**
 * Message Formatter for Side AI Chat with Card-Based Stepper & Interactive Deck
 */
const SideAiMessageRenderer = ({ text, sourceUrl, onUploadDocument }) => {
  return <AiMessageRenderer text={text} sourceUrl={sourceUrl} onUploadDocument={onUploadDocument} size="sm" />;
};

export const OpportunityDetailModal = () => {
  const {
    selectedOpportunity,
    setSelectedOpportunity,
    documents,
    user,
    opportunities,
    sources,
    chatArchives = [],
    saveChatArchive,
    deleteChatArchive,
    setActiveTab,
    setLoadedChatSession,
    addToast,
    openUploadForRequirement,
    setPendingApplyRequest,
  } = useApp();

  // Side AI Chat State
  const [isSideChatOpen, setIsSideChatOpen] = useState(false);
  const [sideMessages, setSideMessages] = useState([]);
  const [sideInput, setSideInput] = useState('');
  const [isSideTyping, setIsSideTyping] = useState(false);
  const [sideSessionId, setSideSessionId] = useState('');
  const sideMessagesEndRef = useRef(null);

  // Which requirement's "check my form" note is currently expanded, and what it found.
  const [formCheckResult, setFormCheckResult] = useState(null);

  const opp = selectedOpportunity;
  const matchedOpp = useMemo(() => matchOpportunityForCitizen(opp, user, documents), [opp, user, documents]);
  const intakeProgramId = useMemo(() => resolveIntakeProgramId(opp), [opp]);

  const handleCheckApplicationForm = (requirementIdx) => {
    if (!intakeProgramId) return;
    const session = buildIntakeSession(intakeProgramId, user, documents);
    const gaps = getActiveGapFields(session);
    setFormCheckResult({ requirementIdx, programId: intakeProgramId, gapCount: gaps.length });
  };

  const handleGoToApplyTab = (action) => {
    setPendingApplyRequest({
      benefitId: intakeProgramId,
      action,
      returnOpportunity: opp,
    });
    setSelectedOpportunity(null);
    setActiveTab('apply');
  };

  // Reset the form-check note whenever a different opportunity is opened.
  useEffect(() => {
    setFormCheckResult(null);
  }, [opp?.id]);

  // Load previous archived chat for this specific opportunity if it exists, otherwise initialize greeting
  useEffect(() => {
    if (opp) {
      const oppTitleLower = (opp.title || '').toLowerCase();
      const oppIdLower = (opp.id || '').toLowerCase();

      const existingArchive = (chatArchives || []).find((arch) => {
        const titleLower = (arch.title || '').toLowerCase();
        const archIdLower = (arch.id || '').toLowerCase();
        return (
          arch.opportunityId === opp.id ||
          archIdLower === `chat_opp_${oppIdLower}` ||
          archIdLower.includes(oppIdLower) ||
          titleLower === `consultation: ${oppTitleLower}` ||
          titleLower.includes(oppTitleLower) ||
          (oppTitleLower.length > 10 && titleLower.includes(oppTitleLower.slice(0, 25)))
        );
      });

      if (existingArchive && existingArchive.messages && existingArchive.messages.length > 0) {
        setSideMessages(existingArchive.messages);
        setSideSessionId(existingArchive.id);
      } else {
        setSideSessionId(`chat_opp_${opp.id}`);
        setSideMessages([
          {
            id: 'init_side',
            sender: 'ai',
            text: `Hi ${user?.firstName || 'there'}! I have the official guidelines for **${opp.title}** (${opp.agency}). Ask me about eligibility, required documents, or step-by-step application instructions.`,
            time: 'Just now',
            sourceUrl: opp.officialSource?.url || 'https://www.gov.ph',
          },
        ]);
      }
    }
  }, [opp?.id, user?.firstName, chatArchives]);

  useEffect(() => {
    if (isSideChatOpen) {
      sideMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sideMessages, isSideTyping, isSideChatOpen]);

  if (!selectedOpportunity) return null;

  const rawUrl = opp.officialSource?.url || '';
  const domain = rawUrl ? rawUrl.replace(/^https?:\/\//, '').split('/')[0] : 'gov.ph';

  // Dynamic requirements list
  const requirementsList =
    opp.requirements && opp.requirements.length > 0
      ? opp.requirements.map((r) => (typeof r === 'string' ? { name: r, status: 'unknown' } : r))
      : [
          { name: 'Valid Government Issued Photo ID (e.g. PhilSys, OSCA, Driver’s License)', status: 'met' },
          { name: 'Filled out Official Government Application Form', status: 'action_required' },
          { name: 'Proof of Residence / Certificate of Indigency (if applicable)', status: 'action_required' },
        ];

  // Dynamic benefits list
  const benefitsList =
    opp.benefits && opp.benefits.length > 0
      ? opp.benefits
      : [
          'Subsidized public citizen assistance',
          'Official program entitlement',
          'Direct government agency support',
        ];

  const handleSendSideMessage = async (textToSend) => {
    const text = textToSend || sideInput.trim();
    if (!text) return;

    const userMsg = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedList = [...sideMessages, userMsg];
    setSideMessages(updatedList);
    setSideInput('');
    setIsSideTyping(true);

    try {
      const replyText = await askAlalayAI(text, {
        contextType: 'benefit',
        opp,
        user,
        opportunities,
        sources,
        userDocs: documents,
      });

      const aiMsg = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: replyText,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        sourceUrl: opp.officialSource?.url || 'https://www.gov.ph',
      };

      const finalMessages = [...updatedList, aiMsg];
      setSideMessages(finalMessages);

      // Auto-save consultation to Chat Archives with explicit opportunityId reference
      if (saveChatArchive) {
        saveChatArchive({
          id: sideSessionId || `chat_opp_${opp.id}`,
          opportunityId: opp.id,
          title: `Consultation: ${opp.title}`,
          category: opp.categoryName || 'Public Service',
          categoryColor: opp.categoryColor || '#093a96',
          timestamp: new Date().toISOString(),
          dateFormatted:
            new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }) +
            ' • ' +
            new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          preview: replyText.replace(/[#*•]/g, '').slice(0, 140) + '...',
          messageCount: finalMessages.length,
          sourceUrl: opp.officialSource?.url || 'https://www.gov.ph',
          messages: finalMessages,
        });
      }
    } catch (err) {
      const errMsg = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: 'ALALAY uses verified official guidelines. Please check with your nearest government agency branch or hospital Malasakit Center desk.',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setSideMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSideTyping(false);
    }
  };

  const handleClearSideChat = () => {
    if (
      window.confirm(
        `Clear conversation history for "${opp.title}"?\n\nThis will reset the chat session.`
      )
    ) {
      if (deleteChatArchive && sideSessionId) {
        deleteChatArchive(sideSessionId);
      }
      setSideSessionId(`chat_opp_${opp.id}_${Date.now()}`);
      setSideMessages([
        {
          id: 'init_side_reset',
          sender: 'ai',
          text: `Chat history cleared. Hi ${user?.firstName || 'there'}! How can I assist you with **${opp.title}**?`,
          time: 'Just now',
          sourceUrl: opp.officialSource?.url || 'https://www.gov.ph',
        },
      ]);
      addToast('Chat Cleared', 'Conversation history for this service was reset.', 'info');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none transition-opacity duration-300">
      {/* Dynamic 3 : 1 Container */}
      <div
        className={`w-full transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] my-auto flex flex-col lg:flex-row items-stretch gap-5 ${
          isSideChatOpen ? 'max-w-[1520px]' : 'max-w-4xl'
        }`}
      >
        {/* ========================================================================= */}
        {/* 1. MAIN OPPORTUNITY DETAIL CARD (Ratio: 3 Parts) */}
        {/* ========================================================================= */}
        <div
          className={`animate-modal-in bg-white rounded-3xl border border-slate-200 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden relative transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isSideChatOpen ? 'w-full lg:w-3/4 flex-[3]' : 'w-full'
          }`}
        >
          {/* ================= STICKY TOP HEADER ================= */}
          <div className="flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-100 p-6 sm:px-10 sm:pt-7 sm:pb-5 rounded-t-3xl space-y-3 z-20">
            {/* Top Bar: Breadcrumb + Action Controls + Close Button */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 flex-wrap">
                <Building className="w-3.5 h-3.5 text-[#093a96]" />
                <span>{opp.categoryName || opp.category || 'Public Service'}</span>
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <span>{opp.agency || 'Government Program'}</span>
              </div>

              <div className="flex items-center gap-2">
                {!isSideChatOpen && (
                  <button
                    type="button"
                    onClick={() => setIsSideChatOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 text-[#093a96] hover:bg-[#093a96] hover:text-white text-xs font-bold transition-all cursor-pointer border border-blue-200 shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ask AI Beside →</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedOpportunity(null)}
                  className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 shadow-xs border border-slate-200/80 cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
                  title="Close Service Details"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Heading & Source Pill */}
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-[#093a96] tracking-tight leading-snug">
                {opp.title}
              </h1>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Source Verified: </span>
                <a
                  href={rawUrl || 'https://www.philhealth.gov.ph'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#093a96] font-bold hover:underline inline-flex items-center gap-1"
                >
                  <span>{domain}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            </div>
          </div>

          {/* ================= SCROLLABLE CONTENT BODY ================= */}
          <div className="flex-1 overflow-y-auto p-6 sm:px-10 py-6 space-y-7">
            {/* Top Status Banner Card with Multi-Factor Match Score Gauge */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-slate-50 border border-blue-100/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xs">
              <div className="space-y-2 max-w-lg">
                {matchedOpp?.matchBadge && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100/90 text-[#093a96] text-xs font-extrabold border border-blue-200">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{matchedOpp.matchBadge}</span>
                  </div>
                )}

                <h2 className="text-xl sm:text-2xl font-bold text-[#0f172a]">
                  {matchedOpp.matchScore >= 90 ? 'You are Highly Qualified' : 'You May Be Eligible'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                  {matchedOpp.eligibilityReason}
                </p>

                {matchedOpp.nextActionStep && (
                  <div className="p-2.5 rounded-xl bg-white/90 border border-blue-100 text-[11px] font-semibold text-[#093a96] flex items-center gap-2 shadow-2xs">
                    <ArrowRight className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    <span><strong className="text-slate-900 font-bold">Next Action:</strong> {matchedOpp.nextActionStep}</span>
                  </div>
                )}
              </div>

              {/* Circular Match Gauge + Document Readiness */}
              <div className="flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center gap-3.5 bg-white px-5 py-3.5 rounded-2xl border border-blue-200/90 shadow-sm">
                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-slate-100"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-[#093a96]"
                        strokeDasharray={`${matchedOpp.matchScore || 92}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <span className="absolute text-xs font-black text-[#093a96]">
                      {matchedOpp.matchScore || 92}%
                    </span>
                  </div>
                  <div className="text-left">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Confidence
                    </div>
                    <div className="text-xs font-bold text-emerald-700">
                      {matchedOpp.confidence || '99% Verified'}
                    </div>
                  </div>
                </div>

                {matchedOpp.totalDocCount > 0 && (
                  <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[10px] font-bold text-slate-600 flex items-center justify-between shadow-2xs">
                    <span>Locker Docs:</span>
                    <span className={matchedOpp.docReadinessPercent === 100 ? 'text-emerald-700' : 'text-blue-700'}>
                      {matchedOpp.matchedDocCount}/{matchedOpp.totalDocCount} Ready ({matchedOpp.docReadinessPercent}%)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Calculated Match Score — full scoring methodology is published on the landing page */}
            <div className="p-4 sm:p-5 rounded-3xl bg-white border border-blue-100/90 shadow-sm flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-[#093a96] flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-[#0f172a] uppercase tracking-wider">
                    Calculated Match Score
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Based on your profile, documents, and this program's requirements.
                  </p>
                </div>
              </div>

              <span className="text-sm font-black text-[#093a96] bg-blue-50 px-4 py-1.5 rounded-full border border-blue-200 shadow-2xs">
                {matchedOpp.matchScore || 90}%
              </span>
            </div>

            {/* Program Overview & Scraped Citizen Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#093a96]" />
                <span>Program Overview</span>
              </h3>
              <div className="p-5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 text-xs sm:text-sm text-slate-700 leading-relaxed">
                {opp.fullDesc || opp.shortDesc}
              </div>
            </div>

            {/* Benefits & Entitlements */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-600" />
                <span>Key Benefits & Entitlements</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {benefitsList.map((benefit, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-white border border-slate-200/80 flex items-start gap-3 shadow-2xs"
                  >
                    <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-slate-700 leading-snug">
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* How to Avail / Step-by-Step Instructions */}
            {opp.howToAvail && opp.howToAvail.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#093a96]" />
                  <span>How to Avail & Application Steps</span>
                </h3>
                <div className="space-y-2">
                  {opp.howToAvail.map((step, sIdx) => (
                    <div
                      key={sIdx}
                      className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 flex items-start gap-3"
                    >
                      <div className="w-6 h-6 rounded-full bg-[#093a96] text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 shadow-2xs">
                        {sIdx + 1}
                      </div>
                      <div className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                        {step}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Requirements & Document Locker Matching */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <FolderCheck className="w-4 h-4 text-[#093a96]" />
                  <span>Document Locker & Requirements Checklist</span>
                </h3>
                <span className="text-xs font-semibold text-slate-500">
                  {requirementsList.filter((req) => {
                    const reqText = typeof req === 'string' ? req : req.name;
                    return !!matchRequirementWithUserDoc(reqText, documents, user);
                  }).length} of {requirementsList.length} Ready
                </span>
              </div>

              <div className="space-y-2.5">
                {requirementsList.map((req, idx) => {
                  const reqText = typeof req === 'string' ? req : req.name;
                  const matchedDoc = matchRequirementWithUserDoc(reqText, documents, user);
                  const isChecked = !!matchedDoc;

                  const isFormRequirement = isApplicationFormRequirement(reqText) && Boolean(intakeProgramId);
                  const checkResult = formCheckResult?.requirementIdx === idx ? formCheckResult : null;

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (!isChecked && !isFormRequirement && openUploadForRequirement) openUploadForRequirement(reqText);
                      }}
                      className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                        isChecked
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all mt-0.5 flex-shrink-0 ${
                            isChecked
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'border border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>

                        <div className="space-y-1 flex-1 min-w-0">
                          <span
                            className={`text-xs font-semibold leading-snug block ${
                              isChecked ? 'text-slate-900' : 'text-slate-700'
                            }`}
                          >
                            {reqText}
                          </span>

                          {matchedDoc ? (
                            matchedDoc.isApplicationForm ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                  <span>Saved in Vault via ALALAY: {matchedDoc.name}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGoToApplyTab('review');
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-bold transition-colors cursor-pointer"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>Review in Vault →</span>
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                                <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                <span>Auto-Verified in Locker: {matchedDoc.name}</span>
                              </div>
                            )
                          ) : isFormRequirement ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-slate-400 font-medium">
                                  ALALAY can fill this out for you.
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCheckApplicationForm(idx);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-[10px] font-bold transition-colors cursor-pointer"
                                >
                                  <Bot className="w-3 h-3" />
                                  <span>Check / Fill Out Form</span>
                                </button>
                              </div>

                              {checkResult && (
                                <div onClick={(e) => e.stopPropagation()}>
                                  {checkResult.gapCount === 0 ? (
                                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                                      <p className="text-[11px] font-bold text-emerald-800 flex items-start gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                        <span>Good news — this form is already answerable with your saved profile and vault details!</span>
                                      </p>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={() => handleGoToApplyTab('auto-complete')}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
                                        >
                                          <Sparkles className="w-3.5 h-3.5" />
                                          <span>Auto-Complete with ALALAY</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleGoToApplyTab('review')}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 text-[11px] font-bold hover:bg-emerald-100 transition-colors cursor-pointer"
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                          <span>Review &amp; Edit First</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                                      <p className="text-[11px] font-bold text-[#093a96] flex items-start gap-1.5">
                                        <HelpCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                        <span>
                                          Needs {checkResult.gapCount} more detail{checkResult.gapCount > 1 ? 's' : ''} from you
                                          — ALALAY already has the rest from your profile and vault.
                                        </span>
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => handleGoToApplyTab(null)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#093a96] hover:bg-blue-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
                                      >
                                        <Bot className="w-3.5 h-3.5" />
                                        <span>Fill Out with ALALAY</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] text-slate-400 font-medium">
                                Not found in Document Locker.
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (openUploadForRequirement) openUploadForRequirement(reqText);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#093a96] text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                <UploadCloud className="w-3 h-3" />
                                <span>Upload Document</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <span
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap mt-0.5 border"
                        style={{
                          backgroundColor: isChecked ? '#ecfdf5' : '#f8fafc',
                          color: isChecked ? '#047857' : '#64748b',
                          borderColor: isChecked ? '#a7f3d0' : '#e2e8f0',
                        }}
                      >
                        {isChecked ? 'Ready ✓' : 'Action Required'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ================= STICKY BOTTOM ACTION BAR ================= */}
          <div className="flex-shrink-0 bg-white/95 backdrop-blur-md border-t border-slate-100 p-4 sm:px-10 sm:py-5 rounded-b-3xl flex flex-col sm:flex-row gap-3 z-20">
            {rawUrl && (
              <a
                href={rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold text-center transition-colors inline-flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4 text-slate-400" />
                <span>Visit Official Agency Portal</span>
              </a>
            )}

            {/* Apply with AI Agent — maps opportunity to intake program */}
            {intakeProgramId && (
              <button
                type="button"
                onClick={() => {
                  handleGoToApplyTab(null);
                  addToast('AI Agent Ready', `Starting application for ${opp.title}`, 'success');
                }}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-violet-900/20 active:scale-[0.98]"
              >
                <Bot className="w-4 h-4" />
                <span>Apply with AI Agent</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSideChatOpen((prev) => !prev)}
              className={`flex-1 py-3.5 px-6 rounded-2xl text-xs font-bold text-center transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md ${
                isSideChatOpen
                  ? 'bg-blue-50 text-[#093a96] border border-blue-200 hover:bg-blue-100'
                  : 'bg-[#093a96] hover:bg-[#072d75] text-white shadow-blue-900/15'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isSideChatOpen
                  ? 'AI Consultation Active Beside (3:1 View)'
                  : 'Ask ALALAY About This Service'}
              </span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. SIDE AI CHAT CARD (Ratio: 1 Part - Opened Beside Main Card) */}
        {/* ========================================================================= */}
        {isSideChatOpen && (
          <div className="animate-side-in w-full lg:w-1/4 flex-[1.2] max-h-[90vh] bg-white rounded-3xl border border-blue-200 shadow-2xl flex flex-col overflow-hidden relative transition-all duration-300">
            {/* Side Card Header */}
            <div className="bg-[#093a96] text-white p-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white p-1 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <img
                    src={logoImg}
                    alt="ALALAY Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-xs font-bold leading-tight">ALALAY AI Chat</h3>
                  <p className="text-[10px] text-blue-200 truncate max-w-[150px]">
                    Grounded: {opp.agency || 'Citizen Charter'}
                  </p>
                </div>
              </div>

              {/* Side Header Controls: Open Full Page, Clear Chat History & Close Side Panel */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (setLoadedChatSession) {
                      setLoadedChatSession({
                        id: sideSessionId || `chat_opp_${opp.id}`,
                        title: `Consultation: ${opp.title}`,
                        opportunityId: opp.id,
                        messages: sideMessages,
                      });
                    }
                    setSelectedOpportunity(null);
                    setActiveTab('ai-chat');
                    addToast('Expanded to Full Page', `Consultation for ${opp.title} opened in full-page workspace.`, 'info');
                  }}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 cursor-pointer transition-colors"
                  title="Open in Dedicated Full-Page Workspace"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleClearSideChat}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 cursor-pointer transition-colors"
                  title="Clear Chat History for this service"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSideChatOpen(false)}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 cursor-pointer transition-colors"
                  title="Close Side Chat"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Quick Suggestion Pills */}
            <div className="p-3 bg-blue-50/70 border-b border-blue-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
              {[
                'What documents do I need?',
                'Am I eligible for this?',
                'How to apply?',
              ].map((pill, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => handleSendSideMessage(pill)}
                  className="px-2.5 py-1 rounded-full bg-white border border-blue-200 text-[#093a96] text-[10px] font-bold whitespace-nowrap hover:bg-blue-600 hover:text-white transition-all cursor-pointer shadow-2xs"
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* Message Stream (Scrolls beneath floating input) */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-[#f8fafd] text-xs pb-20">
              {sideMessages.map((msg) => {
                const isAi = msg.sender === 'ai';
                return (
                  <div
                    key={msg.id}
                    className={`animate-message-pop flex gap-2 ${isAi ? 'justify-start' : 'justify-end'}`}
                  >
                    {isAi && (
                      <div className="w-6 h-6 rounded-full bg-white border border-blue-200 p-0.5 flex items-center justify-center flex-shrink-0 mt-1 shadow-2xs">
                        <img src={logoImg} alt="ALALAY AI" className="w-full h-full object-contain" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] p-3.5 rounded-2xl ${
                        isAi
                          ? 'bg-white border border-slate-200/90 text-slate-800 shadow-2xs'
                          : 'bg-[#093a96] text-white shadow-xs font-medium'
                      }`}
                    >
                      {isAi ? (
                        <SideAiMessageRenderer text={msg.text} sourceUrl={msg.sourceUrl} onUploadDocument={openUploadForRequirement} />
                      ) : (
                        <p className="text-xs leading-relaxed">{msg.text}</p>
                      )}

                      <span
                        className={`text-[9px] mt-1.5 block text-right font-medium ${
                          isAi ? 'text-slate-400' : 'text-blue-200'
                        }`}
                      >
                        {msg.time || 'Just now'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isSideTyping && (
                <div className="flex gap-2 justify-start items-center">
                  <div className="w-6 h-6 rounded-full bg-white border border-blue-200 p-0.5 flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <img src={logoImg} alt="ALALAY AI" className="w-full h-full object-contain animate-bounce" />
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-500 shadow-2xs flex items-center gap-1.5 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#093a96] animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#093a96] animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#093a96] animate-bounce [animation-delay:0.4s]" />
                    <span className="text-[10px] text-slate-400 ml-1">Analyzing charter...</span>
                  </div>
                </div>
              )}

              <div ref={sideMessagesEndRef} />
            </div>

            {/* Floating Hovering Side Chat Input Island */}
            <div className="absolute bottom-3 left-3 right-3 z-30">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendSideMessage();
                }}
                className="bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-xl rounded-full p-1.5 pl-3 flex items-center gap-2 transition-all focus-within:border-[#093a96] focus-within:ring-2 focus-within:ring-blue-100"
              >
                <input
                  type="text"
                  value={sideInput}
                  onChange={(e) => setSideInput(e.target.value)}
                  placeholder="Ask about this service..."
                  className="flex-1 bg-transparent text-slate-800 text-xs outline-none font-medium placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={!sideInput.trim() || isSideTyping}
                  className="w-7 h-7 rounded-full bg-[#093a96] hover:bg-[#072d75] text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 flex-shrink-0 shadow-xs"
                >
                  <Send className="w-3 h-3" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
