import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderLock,
  Plus,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  RefreshCw,
  Eye,
  FileText,
  Lock,
  ExternalLink,
  Sparkles,
  Zap,
  ArrowRight,
  HelpCircle,
  Award,
  Layers,
  ChevronRight,
  FlaskConical,
  Edit,
  Save,
  Check,
  Printer,
  FileEdit,
  X,
  ClipboardList,
  Download,
  FileSpreadsheet,
  LayoutGrid,
  List,
  Table,
  Search,
  ArrowLeft,
  User,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { IOSCard } from '../common/IOSCard';
import { IOSButton } from '../common/IOSButton';
import { IOSBadge } from '../common/IOSBadge';
import { IOSSegmentedControl } from '../common/IOSSegmentedControl';
import { IOSSheet } from '../common/IOSSheet';
import { auditVaultDocuments, calculateOpportunityDocumentGaps, getDocumentPlaceholderThumbnail } from '../../services/docAgentService';
import {
  downloadApplicationAsPdf,
  downloadApplicationAsDoc,
  printApplicationDocument,
  generateDocFormattedHtml,
} from '../../services/applyAiService';
import { DocAgentRenewalModal } from './DocAgentRenewalModal';

export const DocumentsView = () => {
  const {
    documents,
    user,
    opportunities,
    setUploadModalOpen,
    updateDocument,
    replaceDocument,
    deleteDocument,
    activeDocumentForPreview,
    setActiveDocumentForPreview,
    openAskAlalay,
    addToast,
    generateAllTestDocuments,
    setActiveTab,
    t,
  } = useApp();

  // Sub-view toggle: 'all' (standard vault grid) | 'applied_forms' (DOCs table subpage)
  const [subView, setSubView] = useState('all');
  const [filterTab, setFilterTab] = useState('all');
  const [renewalModalDoc, setRenewalModalDoc] = useState(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [formSearchQuery, setFormSearchQuery] = useState('');

  // Edit State for Document / Application in Preview Sheet
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [editFormValues, setEditFormValues] = useState({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Run DocAgent Proactive Audit on Vault Documents
  const auditedDocs = useMemo(() => {
    return auditVaultDocuments(documents);
  }, [documents]);

  // Extract all Applied Application Forms
  const appliedForms = useMemo(() => {
    return auditedDocs.filter(
      (d) =>
        d.isApplicationForm ||
        d.type === 'Application Form' ||
        d.fileType === 'DOC Form' ||
        Boolean(d.applicationData)
    );
  }, [auditedDocs]);

  // Run DocAgent Dynamic Gap-Filling Analysis against all active opportunities
  const gapAnalysis = useMemo(() => {
    return calculateOpportunityDocumentGaps(opportunities, auditedDocs);
  }, [opportunities, auditedDocs]);

  // Sync edit form values when active document for preview changes
  useEffect(() => {
    if (activeDocumentForPreview) {
      const doc = activeDocumentForPreview;
      const initialValues = {
        name: doc.name || '',
        documentNumber: doc.documentNumber || '',
        issuer: doc.issuer || '',
        expirationDate: doc.expirationDate || '',
        ...(doc.attributes || {}),
        ...(doc.applicationData || {}),
      };
      setEditFormValues(initialValues);
      setIsEditingPreview(false);
    } else {
      setIsEditingPreview(false);
      setEditFormValues({});
    }
  }, [activeDocumentForPreview]);

  // Vault Statistics
  const validCount = auditedDocs.filter((d) => d.auditStatus === 'Valid').length;
  const expiringCount = auditedDocs.filter((d) => d.auditStatus === 'Expiring Soon').length;
  const expiredCount = auditedDocs.filter((d) => d.auditStatus === 'Expired').length;

  const readinessScore =
    documents.length > 0
      ? Math.min(100, Math.round((validCount / Math.max(documents.length, 1)) * 100))
      : 0;

  const filterOptions = [
    { id: 'all', label: t('documents.filter.all'), count: auditedDocs.length },
    {
      id: 'valid',
      label: t('documents.valid'),
      count: validCount,
    },
    {
      id: 'expiring',
      label: t('documents.expiringSoon'),
      count: expiringCount,
    },
    {
      id: 'expired',
      label: t('documents.expired'),
      count: expiredCount,
    },
  ];

  const filteredDocs = auditedDocs.filter((doc) => {
    if (filterTab === 'valid') return doc.auditStatus === 'Valid';
    if (filterTab === 'expiring') return doc.auditStatus === 'Expiring Soon';
    if (filterTab === 'expired') return doc.auditStatus === 'Expired';
    return true;
  });

  const filteredAppliedForms = appliedForms.filter((f) => {
    if (!formSearchQuery) return true;
    const q = formSearchQuery.toLowerCase();
    return (
      f.name?.toLowerCase().includes(q) ||
      f.issuer?.toLowerCase().includes(q) ||
      f.documentNumber?.toLowerCase().includes(q)
    );
  });

  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      setIsAuditing(false);
      addToast(
        'DocAgent Audit Complete',
        `Evaluated ${auditedDocs.length} vault documents against 2026 Citizen Charters. Readiness: ${readinessScore}%.`,
        'success'
      );
    }, 600);
  };

  const handleRenewSuccess = (docId) => {
    replaceDocument(docId);
  };

  const handleStartEdit = (doc) => {
    setActiveDocumentForPreview(doc);
    const initialValues = {
      name: doc.name || '',
      documentNumber: doc.documentNumber || '',
      issuer: doc.issuer || '',
      expirationDate: doc.expirationDate || '',
      ...(doc.attributes || {}),
      ...(doc.applicationData || {}),
    };
    setEditFormValues(initialValues);
    setIsEditingPreview(true);
  };

  const handleSaveEdit = async () => {
    if (!activeDocumentForPreview) return;
    setIsSavingEdit(true);

    try {
      const doc = activeDocumentForPreview;
      const { name, documentNumber, issuer, expirationDate, ...fieldValues } = editFormValues;

      const updatedPayload = {
        name: name || doc.name,
        documentNumber: documentNumber || doc.documentNumber,
        issuer: issuer || doc.issuer,
        expirationDate: expirationDate || doc.expirationDate,
        applicationData: {
          ...(doc.applicationData || {}),
          ...fieldValues,
        },
        attributes: {
          ...(doc.attributes || {}),
          ...fieldValues,
        },
        uploadedAt: 'Updated just now',
      };

      if (doc.template?.fields) {
        updatedPayload.filledFields = Object.fromEntries(
          doc.template.fields.map((f) => [
            f.id,
            {
              value: fieldValues[f.id] || doc.filledFields?.[f.id]?.value || '',
              source: doc.filledFields?.[f.id]?.source || 'conversation',
            },
          ])
        );
      }

      // Regenerate DOC formatted html
      updatedPayload.docContent = generateDocFormattedHtml(
        { ...doc, ...updatedPayload },
        user
      );

      if (updateDocument) {
        updateDocument(doc.id, updatedPayload, { silent: true });
      }

      setActiveDocumentForPreview((prev) => (prev ? { ...prev, ...updatedPayload } : null));
      setIsEditingPreview(false);

      addToast(
        'Document Updated',
        `Changes saved successfully in DOC format for "${name || doc.name}".`,
        'success'
      );
    } catch {
      addToast('Error', 'Could not save changes. Please try again.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6 select-none max-w-6xl mx-auto">
      {/* ========================================================================= */}
      {/* 1. SUB-PAGE: APPLIED FORMS HUB (DOCS TABLE FORMAT)                       */}
      {/* ========================================================================= */}
      {subView === 'applied_forms' ? (
        <div className="space-y-6">
          {/* Sub-page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/90 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSubView('all')}
                className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Vault</span>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Applied Forms Hub
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[11px] font-black border border-violet-200">
                    DOC Format • {appliedForms.length} Saved
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete official government application packets stored with full structured field data
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('apply')}
                className="px-4 py-2.5 rounded-2xl bg-[#093a96] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-900/20 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Apply with AI</span>
              </button>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search applied forms by title, agency, or form number..."
                value={formSearchQuery}
                onChange={(e) => setFormSearchQuery(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none w-full"
              />
              {formSearchQuery && (
                <button
                  type="button"
                  onClick={() => setFormSearchQuery('')}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="text-xs text-slate-500 font-semibold hidden sm:flex items-center gap-1.5">
              <Table className="w-4 h-4 text-violet-600" />
              <span>Document Table View</span>
            </div>
          </div>

          {/* Docs Table Format */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Application Form / Program</th>
                    <th className="py-3.5 px-4">Agency</th>
                    <th className="py-3.5 px-4">Form Ref #</th>
                    <th className="py-3.5 px-4">Fields Filled</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredAppliedForms.map((form) => {
                    const fieldsCount =
                      Object.keys(form.applicationData || form.attributes || {}).length ||
                      form.template?.fields?.length ||
                      8;

                    return (
                      <tr
                        key={form.id}
                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        onClick={() => setActiveDocumentForPreview(form)}
                      >
                        {/* Form Title */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-violet-50 text-violet-700 flex items-center justify-center flex-shrink-0 border border-violet-200 font-bold">
                              <FileText className="w-5 h-5 text-violet-600" />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-[#093a96] transition-colors flex items-center gap-1.5">
                                <span>{form.name}</span>
                                <span className="text-[10px] bg-violet-100 text-violet-800 font-black px-1.5 py-0.2 rounded border border-violet-200">
                                  .DOC
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {form.uploadedAt || 'Ready for official submission'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Agency */}
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {form.issuer || form.programAgency || 'Government Office'}
                        </td>

                        {/* Form Ref */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 text-[11px]">
                            {form.documentNumber || 'APP-GEN-001'}
                          </span>
                        </td>

                        {/* Fields Filled */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{fieldsCount} Fields Complete</span>
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-[#093a96] font-bold text-[11px] border border-blue-200">
                            Valid / Ready
                          </span>
                        </td>

                        {/* Actions */}
                        <td
                          className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveDocumentForPreview(form)}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold"
                            title="View Official DOC Form"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#093a96]" />
                            <span className="hidden md:inline">View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEdit(form)}
                            className="p-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-800 transition-all cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold border border-violet-200"
                            title="Edit Form Fields"
                          >
                            <Edit className="w-3.5 h-3.5 text-violet-600" />
                            <span className="hidden md:inline">Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadApplicationAsPdf(form, user)}
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold"
                            title="Download official PDF document"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-600" />
                            <span className="hidden lg:inline">PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => printApplicationDocument(form, user)}
                            className="p-1.5 rounded-xl bg-[#093a96] hover:bg-blue-700 text-white transition-all cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold shadow-2xs"
                            title="Print Official Form"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">Print</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteDocument(form.id)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer inline-flex items-center"
                            title="Delete Form"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Empty State in Applied Forms */}
            {filteredAppliedForms.length === 0 && (
              <div className="p-12 text-center space-y-4">
                <div className="w-14 h-14 rounded-3xl bg-violet-50 text-violet-600 flex items-center justify-center mx-auto shadow-inner">
                  <ClipboardList className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-slate-800">
                    No Applied Forms Saved Yet
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Use ALALAY Apply with AI to complete government applications automatically with your profile and documents.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('apply')}
                  className="px-4 py-2 rounded-2xl bg-[#093a96] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-900/20 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Start an Application with AI</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 2. MAIN VAULT VIEW: GRID & INTELLIGENCE                                   */
        /* ========================================================================= */
        <>
          {/* Header and Upload Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {t('documents.title')}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-[#093a96] text-[11px] font-black border border-blue-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>{t('documents.sentinelActive')}</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {t('documents.subtitle')}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleRunAudit}
                disabled={isAuditing}
                className="px-3.5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin text-[#093a96]' : ''}`} />
                <span>{isAuditing ? t('documents.auditing') : t('documents.runAudit')}</span>
              </button>

              <button
                type="button"
                onClick={generateAllTestDocuments}
                title="Uploads test credentials so at least one program reaches 100% match."
                className="px-3.5 py-2.5 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <FlaskConical className="w-3.5 h-3.5" />
              </button>

              <IOSButton
                variant="primary"
                size="md"
                icon={Plus}
                onClick={() => setUploadModalOpen(true)}
                className="shadow-md shadow-blue-900/20"
              >
                {t('documents.uploadWithOcr')}
              </IOSButton>
            </div>
          </div>

          {/* DocAgent Sentinel Intelligence Overview Bar */}
          <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-950 via-[#093a96] to-indigo-950 text-white shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm sm:text-base font-extrabold tracking-tight">
                    {t('documents.vaultHealth')}
                  </h2>
                </div>
                <p className="text-xs text-blue-200">
                  {validCount} of {auditedDocs.length} {t('documents.compliant')}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="px-3 py-1.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold">{validCount} {t('documents.valid')}</span>
                </div>

                {expiringCount > 0 && (
                  <div className="px-3 py-1.5 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">{expiringCount} {t('documents.expiringSoon')}</span>
                  </div>
                )}

                {expiredCount > 0 && (
                  <div className="px-3 py-1.5 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">{expiredCount} {t('documents.expired')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Readiness Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-blue-200">
                <span>{t('documents.complianceScore')}</span>
                <span className="text-emerald-400 font-extrabold">{readinessScore}% {t('documents.ready')}</span>
              </div>
              <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-500"
                  style={{ width: `${readinessScore}%` }}
                />
              </div>
            </div>
          </div>


          {/* Proactive Expiration & Renewal Action Alert */}
          {(expiringCount > 0 || expiredCount > 0) && (
            <div className="p-4 rounded-3xl bg-amber-50/90 border border-amber-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs sm:text-sm font-extrabold text-amber-950">
                    Proactive DocAgent Expiration Notice
                  </h4>
                  <p className="text-xs text-amber-900 font-medium">
                    {expiringCount > 0 && `${expiringCount} document is expiring within 30 days. `}
                    {expiredCount > 0 && `${expiredCount} document is already expired. `}
                    Generate a ready-to-print renewal packet to avoid disqualification from public benefits.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const targetDoc = auditedDocs.find((d) => d.isExpiringSoon || d.isExpired) || auditedDocs[0];
                  if (targetDoc) setRenewalModalDoc(targetDoc);
                }}
                className="px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5 flex-shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Generate Renewal Packet</span>
              </button>
            </div>
          )}

          {/* Dynamic Gap-Filling & Opportunity Unlocker Cards */}
          {gapAnalysis.oneDocAwayPrograms.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">
                    DocAgent Opportunity Unlocker (1 Document Away)
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  Upload missing credentials to reach 100% eligibility
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {gapAnalysis.oneDocAwayPrograms.slice(0, 2).map((gapItem) => (
                  <div
                    key={gapItem.opportunityId}
                    className="p-4 rounded-3xl bg-white border border-blue-200/90 shadow-sm flex flex-col justify-between space-y-3 hover:border-[#093a96] transition-all"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#093a96] border border-blue-200">
                          {gapItem.agency}
                        </span>
                        <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          {gapItem.readinessPercentage}% Ready
                        </span>
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {gapItem.title}
                      </h4>

                      <div className="p-2.5 rounded-2xl bg-amber-50/70 border border-amber-100 text-[11px] text-amber-950 space-y-1">
                        <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider block">
                          Missing Document Required:
                        </span>
                        <span className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <span>{gapItem.missingRequirements[0] || 'Official Document'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setUploadModalOpen(true)}
                        className="text-xs font-bold text-[#093a96] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Upload Missing Item</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const matchedOpp = opportunities.find((o) => o.id === gapItem.opportunityId) || {
                            title: gapItem.title,
                            agency: gapItem.agency,
                            requirements: gapItem.missingRequirements,
                          };
                          const missingReq = gapItem.missingRequirements?.[0] || 'required credentials';
                          const query = `How to get ${missingReq} and complete application for ${gapItem.title}?`;
                          openAskAlalay(matchedOpp, null, query);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#093a96] text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-blue-600" />
                        <span>How to Get (15m guide)</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <IOSSegmentedControl
              options={filterOptions}
              value={filterTab}
              onChange={setFilterTab}
            />

            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t('documents.encryption')}</span>
            </div>
          </div>

          {/* Document Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map((doc) => {
              const isExpiring = doc.auditStatus === 'Expiring Soon';
              const isExpired = doc.auditStatus === 'Expired';
              const isAppForm = doc.isApplicationForm || doc.type === 'Application Form' || Boolean(doc.applicationData);

              return (
                <IOSCard
                  key={doc.id}
                  className={`flex flex-col justify-between space-y-4 bg-white border group hover:shadow-md transition-all rounded-3xl ${
                    isAppForm ? 'border-violet-200/90 hover:border-violet-400' : 'border-slate-200/80 hover:border-[#093a96]/40'
                  }`}
                >
                  {/* Card Header */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          isAppForm ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {isAppForm ? 'Application Form' : doc.type}
                        </span>
                        {isAppForm && (
                          <span className="text-[10px] bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-extrabold px-1.5 py-0.5 rounded-full">
                            DOC
                          </span>
                        )}
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border flex items-center gap-1 ${
                          isExpired
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : isExpiring
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : isAppForm
                            ? 'bg-violet-50 text-violet-800 border-violet-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {isExpired ? (
                          <Clock className="w-3 h-3 text-rose-600" />
                        ) : isExpiring ? (
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                        ) : (
                          <CheckCircle2 className={`w-3 h-3 ${isAppForm ? 'text-violet-600' : 'text-emerald-600'}`} />
                        )}
                        <span>{doc.urgencyLabel || doc.status || 'Valid'}</span>
                      </span>
                    </div>

                    {/* Thumbnail / Document Representation */}
                    <div
                      onClick={() => setActiveDocumentForPreview(doc)}
                      className={`h-28 rounded-2xl border overflow-hidden relative group/thumb cursor-pointer flex items-center justify-center ${
                        isAppForm ? 'bg-gradient-to-br from-violet-900/10 to-indigo-900/10 border-violet-200' : 'bg-slate-100 border-slate-200/80'
                      }`}
                    >
                      <img
                        src={doc.thumbnail || getDocumentPlaceholderThumbnail(doc.type)}
                        alt={doc.name}
                        onError={(e) => { e.currentTarget.src = getDocumentPlaceholderThumbnail(doc.type); }}
                        className="w-full h-full object-cover group-hover/thumb:scale-105 transition-all"
                      />
                      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] opacity-0 group-hover/thumb:opacity-100 transition-all flex items-center justify-center text-white gap-1.5 text-xs font-bold">
                        <Eye className="w-4 h-4" />
                        <span>View DOC Form</span>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1 group-hover:text-[#093a96] transition-colors">
                        {doc.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate mt-0.5 font-medium">{doc.issuer}</p>
                    </div>
                  </div>

                  {/* Extracted Attributes Detail Box */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] space-y-1.5 text-slate-600 font-medium">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Doc Number:</span>
                      <span className="font-mono font-bold text-slate-800 truncate max-w-[150px]">
                        {doc.documentNumber || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Status:</span>
                      <span className={`font-bold ${isExpired ? 'text-rose-700' : isExpiring ? 'text-amber-700' : 'text-slate-800'}`}>
                        {doc.expirationDate || 'Permanent / Lifetime Validity'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{isAppForm ? 'Intake Form:' : 'DocAgent OCR:'}</span>
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>{isAppForm ? 'Form Ready ✓' : 'Verified ✓'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveDocumentForPreview(doc)}
                        className="text-xs font-bold text-[#093a96] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t('documents.preview')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(doc)}
                        className="text-xs font-bold text-violet-700 hover:text-violet-900 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isAppForm && (
                        <button
                          type="button"
                          onClick={() => printApplicationDocument(doc, user)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
                          title="Print Application"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {(isExpiring || isExpired) && !isAppForm && (
                        <button
                          type="button"
                          onClick={() => setRenewalModalDoc(doc)}
                          className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Prepare Renewal Packet"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{t('documents.renew')}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteDocument(doc.id)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </IOSCard>
              );
            })}
          </div>

          {/* Empty State when no documents */}
          {filteredDocs.length === 0 && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center space-y-4 max-w-md mx-auto shadow-sm">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 text-[#093a96] flex items-center justify-center mx-auto shadow-inner">
                <FolderLock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-800">{t('documents.noDocsTitle')}</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  {t('documents.noDocsDesc')}
                </p>
              </div>
              <IOSButton
                variant="primary"
                size="md"
                icon={Plus}
                onClick={() => setUploadModalOpen(true)}
                className="mx-auto shadow-md shadow-blue-900/20"
              >
                {t('documents.uploadWithOcr')}
              </IOSButton>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* 3. DOCUMENT DETAIL PREVIEW & EDIT SHEET (DOC FORMAT CANVAS)               */}
      {/* ========================================================================= */}
      {activeDocumentForPreview && (
        <IOSSheet
          isOpen={Boolean(activeDocumentForPreview)}
          onClose={() => {
            setActiveDocumentForPreview(null);
            setIsEditingPreview(false);
          }}
          title={isEditingPreview ? `Edit: ${activeDocumentForPreview.name}` : activeDocumentForPreview.name}
          subtitle={
            isEditingPreview
              ? 'Update your document form fields and metadata'
              : `Verified Official Record • ${activeDocumentForPreview.issuer}`
          }
          maxWidth="max-w-3xl"
        >
          <div className="space-y-5 select-none pb-2">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-100 border border-slate-200 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-700">Document Type:</span>
                <span className="text-xs font-extrabold text-[#093a96]">
                  {activeDocumentForPreview.fileType || activeDocumentForPreview.type || 'Official Record'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!isEditingPreview ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditingPreview(true)}
                      className="px-3 py-1.5 rounded-xl bg-violet-100 hover:bg-violet-200 text-violet-800 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit Fields</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadApplicationAsPdf(activeDocumentForPreview, user)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                      title="Download official PDF document"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => printApplicationDocument(activeDocumentForPreview, user)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#093a96] hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-violet-700 font-bold flex items-center gap-1">
                    <FileEdit className="w-3.5 h-3.5" />
                    <span>Editing Mode</span>
                  </span>
                )}
              </div>
            </div>

            {/* If In Edit Mode: Interactive Form Field Editor */}
            {isEditingPreview ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    General Document Metadata
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Document Title:</label>
                      <input
                        type="text"
                        value={editFormValues.name || ''}
                        onChange={(e) => setEditFormValues((p) => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#093a96]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Document Control Number:</label>
                      <input
                        type="text"
                        value={editFormValues.documentNumber || ''}
                        onChange={(e) => setEditFormValues((p) => ({ ...p, documentNumber: e.target.value }))}
                        className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#093a96]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Issuing Agency:</label>
                      <input
                        type="text"
                        value={editFormValues.issuer || ''}
                        onChange={(e) => setEditFormValues((p) => ({ ...p, issuer: e.target.value }))}
                        className="w-full px-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#093a96]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Expiration Date:</label>
                      <input
                        type="text"
                        value={editFormValues.expirationDate || ''}
                        onChange={(e) => setEditFormValues((p) => ({ ...p, expirationDate: e.target.value }))}
                        placeholder="YYYY-MM-DD or Permanent"
                        className="w-full px-3 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-1 focus:ring-[#093a96]"
                      />
                    </div>
                  </div>
                </div>

                {/* Editable Form Fields */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-violet-600" />
                    <span>Application Form Fields</span>
                  </h4>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {activeDocumentForPreview.template?.fields ? (
                      activeDocumentForPreview.template.fields.map((field) => (
                        <div key={field.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <div className="flex justify-between">
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                              {field.label}
                            </label>
                            {field.section && (
                              <span className="text-[10px] text-slate-400 font-semibold">{field.section}</span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={editFormValues[field.id] ?? ''}
                            onChange={(e) =>
                              setEditFormValues((prev) => ({
                                ...prev,
                                [field.id]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-600 transition-all"
                            placeholder={`Enter ${field.label}...`}
                          />
                        </div>
                      ))
                    ) : (
                      Object.entries(activeDocumentForPreview.applicationData || activeDocumentForPreview.attributes || {}).map(
                        ([key, val]) => (
                          <div key={key} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                            <label className="block text-[11px] font-bold text-slate-700 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                            </label>
                            <input
                              type="text"
                              value={editFormValues[key] ?? String(val || '')}
                              onChange={(e) =>
                                setEditFormValues((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-600 transition-all"
                            />
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* ========================================================================= */
              /* OFFICIAL DOC-FORMAT PREVIEW CANVAS (A4 PAPER LOOK)                        */
              /* ========================================================================= */
              <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-6 sm:p-8 space-y-6 text-slate-900 max-h-[600px] overflow-y-auto font-serif">
                {/* Official Republic Header */}
                <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-700 font-sans">
                    Republic of the Philippines
                  </div>
                  <div className="text-base sm:text-lg font-black uppercase text-[#093a96] font-sans">
                    {activeDocumentForPreview.issuer || 'Department of Public Services'}
                  </div>
                  <div className="text-sm sm:text-base font-extrabold underline mt-1">
                    {activeDocumentForPreview.name}
                  </div>
                </div>

                {/* Form Control Metadata Bar */}
                <div className="flex justify-between items-center text-[11px] text-slate-600 font-sans border-b border-dashed border-slate-300 pb-2">
                  <div>
                    <strong>Control No:</strong> {activeDocumentForPreview.documentNumber || 'APP-DOC-001'}
                  </div>
                  <div>
                    <strong>Prepared Date:</strong>{' '}
                    {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-emerald-700 font-bold">
                    Status: Valid ✓
                  </div>
                </div>

                {/* Form Sections and Field Table */}
                <div className="space-y-4 font-sans text-xs">
                  {activeDocumentForPreview.template?.fields ? (
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-[#093a96] border-b border-[#093a96] pb-1 mb-2">
                        Official Application Data Entries
                      </h4>
                      <table className="w-full border-collapse border border-slate-300 text-xs">
                        <tbody>
                          {activeDocumentForPreview.template.fields.map((field, idx) => {
                            const val =
                              activeDocumentForPreview.applicationData?.[field.id] ||
                              activeDocumentForPreview.filledFields?.[field.id]?.value ||
                              activeDocumentForPreview.attributes?.[field.id] ||
                              '—';
                            return (
                              <tr key={field.id} className={idx % 2 === 0 ? 'bg-slate-50/70' : 'bg-white'}>
                                <td className="p-2.5 font-bold text-slate-600 w-1/3 border border-slate-300 uppercase text-[10px]">
                                  {field.label}
                                </td>
                                <td className="p-2.5 font-semibold text-slate-900 border border-slate-300">
                                  {val}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-[#093a96] border-b border-[#093a96] pb-1 mb-2">
                        Recorded Attributes & Data
                      </h4>
                      <table className="w-full border-collapse border border-slate-300 text-xs">
                        <tbody>
                          {Object.entries(
                            activeDocumentForPreview.applicationData || activeDocumentForPreview.attributes || {}
                          ).map(([k, v], idx) => (
                            <tr key={k} className={idx % 2 === 0 ? 'bg-slate-50/70' : 'bg-white'}>
                              <td className="p-2.5 font-bold text-slate-600 w-1/3 border border-slate-300 uppercase text-[10px]">
                                {k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                              </td>
                              <td className="p-2.5 font-semibold text-slate-900 border border-slate-300">
                                {String(v || '—')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Attestation Clause */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 text-[11px] text-justify font-sans leading-relaxed text-slate-700">
                  <strong>APPLICANT'S ATTESTATION & OATH:</strong> I hereby certify under the penalties of perjury that all information, declarations, and statements contained in this application are true, correct, and complete to the best of my knowledge and belief in accordance with RA 11032 (Ease of Doing Business Act) and RA 10173 (Data Privacy Act).
                </div>

                {/* Official Signatures Line */}
                <div className="pt-8 grid grid-cols-2 gap-8 text-center font-sans">
                  <div>
                    <div className="border-b border-slate-900 h-8 mb-1"></div>
                    <div className="text-xs font-bold uppercase text-slate-900">
                      {user.name || user.firstName || 'Adones Santos'}
                    </div>
                    <div className="text-[10px] text-slate-500">Applicant Signature</div>
                  </div>
                  <div>
                    <div className="border-b border-slate-900 h-8 mb-1"></div>
                    <div className="text-xs font-bold uppercase text-slate-900">
                      {activeDocumentForPreview.issuer || 'Frontline Officer'}
                    </div>
                    <div className="text-[10px] text-slate-500">Receiving Desk / Agency Officer</div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Actions Bar */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
              {isEditingPreview ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditingPreview(false)}
                    disabled={isSavingEdit}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit}
                    className="px-5 py-2.5 rounded-xl bg-[#093a96] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-900/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{isSavingEdit ? 'Saving...' : 'Save Changes (.DOC)'}</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeDocumentForPreview.isApplicationForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDocumentForPreview(null);
                          if (setActiveTab) setActiveTab('apply');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#093a96] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-blue-200"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Open in Apply with AI</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => printApplicationDocument(activeDocumentForPreview, user)}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Document</span>
                    </button>
                  </div>

                  <IOSButton
                    variant="secondary"
                    size="md"
                    onClick={() => setActiveDocumentForPreview(null)}
                  >
                    Close Record
                  </IOSButton>
                </>
              )}
            </div>
          </div>
        </IOSSheet>
      )}

      {/* DocAgent Autonomous Renewal Modal */}
      {renewalModalDoc && (
        <DocAgentRenewalModal
          isOpen={Boolean(renewalModalDoc)}
          onClose={() => setRenewalModalDoc(null)}
          document={renewalModalDoc}
          user={user}
          onRenewSuccess={handleRenewSuccess}
        />
      )}
    </div>
  );
};

export default DocumentsView;
