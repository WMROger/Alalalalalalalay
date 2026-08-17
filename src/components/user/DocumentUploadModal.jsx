import React, { useEffect, useState } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  Calendar,
  Building,
  Lock,
  X,
  Camera,
  Sparkles,
  ShieldCheck,
  Zap,
  RefreshCw,
  Eye,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { IOSSheet } from '../common/IOSSheet';
import { IOSButton } from '../common/IOSButton';
import { scanAndExtractDocumentMetadata, OCR_PRESET_TEMPLATES, getDocumentPlaceholderThumbnail, verifyDocumentUpload } from '../../services/docAgentService';

export const DocumentUploadModal = () => {
  const {
    uploadModalOpen,
    setUploadModalOpen,
    uploadModalPrefill,
    setUploadModalPrefill,
    uploadNewDocument,
    user,
    setUser,
    addToast,
  } = useApp();

  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('National ID / Gov ID');
  const [issuer, setIssuer] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [syncToProfile, setSyncToProfile] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // The specific document type this upload is meant to satisfy (e.g. opened from a
  // "Upload Missing Item" prompt for a required credential), kept around after the
  // prefill itself is consumed so verification can check the scan against it.
  const [requiredType, setRequiredType] = useState(null);
  const [verification, setVerification] = useState(null);
  const [mismatchAcknowledged, setMismatchAcknowledged] = useState(false);

  // Pre-fill the form when opened from a specific missing requirement (e.g. from a
  // checklist in chat or on the opportunity page), so the citizen doesn't have to
  // re-select the document type manually. Consumed immediately (cleared right after
  // applying) so it can never linger and overwrite a later OCR preset/scan result.
  useEffect(() => {
    if (uploadModalOpen && uploadModalPrefill) {
      setDocName(uploadModalPrefill.name || '');
      setDocType(uploadModalPrefill.type || 'National ID / Gov ID');
      setRequiredType(uploadModalPrefill.type || null);
      setUploadModalPrefill(null);
    }
  }, [uploadModalOpen, uploadModalPrefill, setUploadModalPrefill]);

  const documentTypes = [
    'National ID / Gov ID',
    'Barangay Certificate',
    'PhilHealth MDR',
    'NBI Clearance',
    'Police Clearance',
    'Birth Certificate (PSA)',
    'Medical Certificate / Clinical Abstract',
    'Certificate of Employment (COE)',
    'School Registration / Transcript',
  ];

  // Process Document with DocAgent OCR
  const handleProcessFileWithDocAgent = async (fileOrName) => {
    setIsScanningOcr(true);
    setMismatchAcknowledged(false);
    try {
      const extracted = await scanAndExtractDocumentMetadata(fileOrName);
      setOcrResult(extracted);
      setDocName(extracted.name);
      setDocType(extracted.type);
      setIssuer(extracted.issuer);
      setDocNumber(extracted.documentNumber);
      setExpirationDate(extracted.expirationDate);

      const verified = verifyDocumentUpload(extracted, requiredType);
      setVerification(verified);

      if (verified.status === 'mismatch') {
        addToast('DocAgent Verification Warning', verified.message, 'error');
      } else if (verified.status === 'review') {
        addToast('DocAgent OCR Complete', verified.message, 'info');
      } else {
        addToast(
          'DocAgent OCR Complete',
          `Extracted ${extracted.name} (${extracted.confidenceScore}% confidence score).`,
          'success'
        );
      }
    } catch (err) {
      console.warn('DocAgent OCR Error:', err);
    } finally {
      setIsScanningOcr(false);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      handleProcessFileWithDocAgent(file);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      handleProcessFileWithDocAgent(file);
    }
  };

  // Quick Preset Selector for Fast Testing
  const handleSelectPreset = (presetKey) => {
    const preset = OCR_PRESET_TEMPLATES[presetKey];
    if (preset) {
      handleProcessFileWithDocAgent(preset.name);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!docName) return;
    // A flagged type mismatch against a specific requirement must be explicitly
    // acknowledged before saving — this is the whole point of verifying the upload.
    if (verification?.status === 'mismatch' && !mismatchAcknowledged) return;

    setIsUploading(true);
    setUploadProgress(30);

    setTimeout(() => setUploadProgress(70), 300);
    setTimeout(() => setUploadProgress(100), 600);

    setTimeout(() => {
      // 1. Upload to Document Vault
      if (uploadNewDocument) {
        uploadNewDocument({
          name: docName,
          type: docType,
          issuer: issuer || 'Authorized Government Agency',
          documentNumber: docNumber || `DOC-${Math.floor(100000 + Math.random() * 900000)}`,
          expirationDate: expirationDate || '2028-12-31',
          thumbnail: ocrResult?.thumbnail || getDocumentPlaceholderThumbnail(docType),
          attributes: ocrResult?.attributes || {},
        });
      }

      // 2. Auto-sync extracted attributes to User Profile
      if (syncToProfile && ocrResult?.attributes && user && setUser) {
        const updatedUser = { ...user };
        const attrs = ocrResult.attributes;

        if (attrs.crn) updatedUser.egovId = attrs.crn;
        if (attrs.nbiId) updatedUser.nbiClearanceNo = attrs.nbiId;
        if (attrs.certificateNumber) updatedUser.barangayIndigencyNo = attrs.certificateNumber;

        setUser(updatedUser);
        localStorage.setItem('alalay_user', JSON.stringify(updatedUser));
        addToast('Profile Auto-Updated', 'Synced extracted government IDs to citizen profile.', 'info');
      }

      setIsUploading(false);
      setDocName('');
      setSelectedFile(null);
      setOcrResult(null);
      setVerification(null);
      setRequiredType(null);
      setMismatchAcknowledged(false);
      setUploadModalOpen(false);
      if (setUploadModalPrefill) setUploadModalPrefill(null);
    }, 900);
  };

  return (
    <IOSSheet
      isOpen={uploadModalOpen}
      onClose={() => {
        setUploadModalOpen(false);
        setOcrResult(null);
        setVerification(null);
        setRequiredType(null);
        setMismatchAcknowledged(false);
        if (setUploadModalPrefill) setUploadModalPrefill(null);
      }}
      title="DocAgent Document Vault"
      subtitle="Autonomous OCR, Attribute Extraction & Vault Sync"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 select-none">
        {/* Quick Simulation Presets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span className="flex items-center gap-1 text-[#093a96]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>DocAgent Quick OCR Presets:</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">Click to auto-scan</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {[
              { key: 'philsys', label: '🇵🇭 PhilSys ID', color: 'bg-blue-50 hover:bg-blue-100/80 border-blue-200 text-[#093a96]' },
              { key: 'pwd_id', label: '♿ PWD ID', color: 'bg-indigo-50 hover:bg-indigo-100/80 border-indigo-200 text-indigo-900' },
              { key: 'indigency', label: '📜 Brgy. Indigency', color: 'bg-amber-50 hover:bg-amber-100/80 border-amber-200 text-amber-900' },
              { key: 'philhealth_mdr', label: '💊 PhilHealth MDR', color: 'bg-rose-50 hover:bg-rose-100/80 border-rose-200 text-rose-900' },
            ].map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => handleSelectPreset(preset.key)}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all text-left truncate cursor-pointer shadow-2xs ${preset.color}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload Drop Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-blue-200 hover:border-[#093a96] rounded-3xl p-5 text-center bg-blue-50/30 hover:bg-blue-50/60 transition-all cursor-pointer relative"
        >
          <input
            type="file"
            onChange={handleFileSelect}
            accept=".pdf,.png,.jpg,.jpeg"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-white border border-blue-200 text-[#093a96] flex items-center justify-center shadow-xs">
              {isScanningOcr ? (
                <RefreshCw className="w-5 h-5 animate-spin text-[#093a96]" />
              ) : (
                <UploadCloud className="w-5 h-5" />
              )}
            </div>

            {isScanningOcr ? (
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-[#093a96] flex items-center gap-1.5 justify-center">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>DocAgent AI is analyzing document structure & OCR...</span>
                </p>
                <p className="text-[10px] text-slate-400">Extracting CRN, issuing seal, and validity period</p>
              </div>
            ) : selectedFile ? (
              <div className="text-center">
                <p className="text-xs font-bold text-[#093a96]">{selectedFile.name}</p>
                <p className="text-[10px] text-slate-500">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Ready for vault encryption
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs sm:text-sm font-bold text-slate-800">
                  Drop government PDF or image here, or browse
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  DocAgent automatically extracts ID numbers & statutory validity
                </p>
              </div>
            )}
          </div>
        </div>

        {/* OCR Result & Verification Preview Card */}
        {ocrResult && (
          <div
            className={`p-3.5 rounded-2xl border space-y-2 animate-in fade-in zoom-in-95 ${
              verification?.status === 'mismatch'
                ? 'bg-gradient-to-r from-rose-50/90 to-red-50/60 border-rose-200/80'
                : verification?.status === 'review'
                ? 'bg-gradient-to-r from-amber-50/90 to-yellow-50/60 border-amber-200/80'
                : 'bg-gradient-to-r from-blue-50/90 to-indigo-50/60 border-blue-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-1.5 text-xs font-bold ${
                  verification?.status === 'mismatch'
                    ? 'text-rose-700'
                    : verification?.status === 'review'
                    ? 'text-amber-800'
                    : 'text-[#093a96]'
                }`}
              >
                {verification?.status === 'mismatch' || verification?.status === 'review' ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                )}
                <span>
                  {verification?.status === 'mismatch'
                    ? 'Verification Warning'
                    : verification?.status === 'review'
                    ? 'Needs a Quick Double-Check'
                    : 'DocAgent Extraction Verified'}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                  verification?.status === 'mismatch'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : verification?.status === 'review'
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
              >
                {ocrResult.confidenceScore}% Confidence
              </span>
            </div>

            {verification?.message && (
              <p
                className={`text-[11px] leading-relaxed font-medium ${
                  verification.status === 'mismatch'
                    ? 'text-rose-800'
                    : verification.status === 'review'
                    ? 'text-amber-900'
                    : 'text-slate-700'
                }`}
              >
                {verification.message}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 font-medium">
              <div className="p-2 rounded-xl bg-white border border-blue-100">
                <span className="text-[10px] text-slate-400 block font-bold">Extracted ID No:</span>
                <span className="font-mono text-[#093a96] font-bold truncate block">
                  {ocrResult.documentNumber}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white border border-blue-100">
                <span className="text-[10px] text-slate-400 block font-bold">Statutory Expiration:</span>
                <span className="text-slate-800 font-bold block truncate">
                  {ocrResult.expirationDate}
                </span>
              </div>
            </div>

            {/* Mismatch acknowledgment gate — must be checked before saving */}
            {verification?.status === 'mismatch' && (
              <label className="flex items-center gap-2 pt-1 text-[11px] font-bold text-rose-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mismatchAcknowledged}
                  onChange={(e) => setMismatchAcknowledged(e.target.checked)}
                  className="w-3.5 h-3.5 text-rose-600 rounded accent-rose-600"
                />
                <span>I confirm this is the correct document despite the warning above</span>
              </label>
            )}

            {/* Profile Auto-Sync Checkbox */}
            <label className="flex items-center gap-2 pt-1 text-[11px] font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={syncToProfile}
                onChange={(e) => setSyncToProfile(e.target.checked)}
                className="w-3.5 h-3.5 text-[#093a96] rounded accent-[#093a96]"
              />
              <span>Auto-sync extracted credentials to Citizen Profile</span>
            </label>
          </div>
        )}

        {/* Progress Bar when uploading */}
        {isUploading && (
          <div className="space-y-1.5 p-3 rounded-2xl bg-blue-50 border border-blue-100">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
              <span>Encrypting & syncing to vault...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#093a96] transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Form Inputs */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Document Name
            </label>
            <input
              type="text"
              required
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Barangay Certificate of Indigency"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium focus:border-[#093a96] focus:bg-white outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Document Category
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium focus:border-[#093a96] focus:bg-white outline-none transition-all cursor-pointer"
              >
                {documentTypes.map((type, idx) => (
                  <option key={idx} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Issuing Agency / Office
              </label>
              <input
                type="text"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder="e.g. Barangay Hall / PSA / NBI"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium focus:border-[#093a96] focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Document / Registry Number
              </label>
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                placeholder="e.g. PH-CRN-9942-8810-7214"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-mono font-medium focus:border-[#093a96] focus:bg-white outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Expiration / Validity Date
              </label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium focus:border-[#093a96] focus:bg-white outline-none transition-all cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Security & Action Buttons */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>AES-256 Encrypted in Citizen Vault</span>
          </div>

          <div className="flex items-center gap-2">
            <IOSButton
              variant="secondary"
              size="md"
              type="button"
              onClick={() => setUploadModalOpen(false)}
            >
              Cancel
            </IOSButton>

            <IOSButton
              variant="primary"
              size="md"
              type="submit"
              disabled={isUploading || !docName || (verification?.status === 'mismatch' && !mismatchAcknowledged)}
            >
              Save to Vault
            </IOSButton>
          </div>
        </div>
      </form>
    </IOSSheet>
  );
};
