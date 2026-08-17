import {
  Home,
  Compass,
  FileText,
  MessageSquare,
  User,
  Settings,
  Shield,
  Activity,
  Building2,
  ListChecks,
  FileSpreadsheet,
  LogOut,
  Sparkles,
  Award,
  ClipboardList,
} from 'lucide-react';
import { AlalayLogo } from '../common/AlalayLogo';
import { useApp } from '../../context/AppContext';

export const Sidebar = () => {
  const {
    viewMode,
    activeTab,
    setActiveTab,
    adminTab,
    setAdminTab,
    reviewQueue,
    logout,
    t,
  } = useApp();

  const citizenNav = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'explore', label: t('nav.explore'), icon: Compass },
    { id: 'ai-chat', label: t('nav.aiChat'), icon: Sparkles },
    // { id: 'apply', label: t('nav.apply'), icon: ClipboardList},
    { id: 'documents', label: t('nav.documents'), icon: FileText },
    { id: 'benefits', label: t('nav.benefits'), icon: Award },
    { id: 'chat-history', label: t('nav.chatArchives'), icon: MessageSquare },
    { id: 'profile', label: t('nav.profile'), icon: User },
  ];

  const adminNav = [
    { id: 'dashboard', label: 'Overview', icon: Activity },
    { id: 'sources', label: 'Sources', icon: Building2 },
    { id: 'pipeline', label: 'Scraping Pipeline', icon: FileSpreadsheet },
    { id: 'review', label: 'AI Review Queue', icon: ListChecks, badge: reviewQueue.length },
    { id: 'audit', label: 'Audit Logs', icon: Shield },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 p-6 bg-white border-r border-slate-200/80 select-none justify-between z-20">
      {/* Top Branding & Navigation */}
      <div className="space-y-8">
        <AlalayLogo size="sm" showSubtitle />

        {/* Navigation items */}
        <nav className="space-y-1.5">
          {viewMode === 'user' ? (
            citizenNav.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${isActive
                    ? 'bg-[#093a96] text-white shadow-md shadow-blue-900/20 font-bold'
                    : 'text-slate-600 hover:text-[#093a96] hover:bg-slate-50'
                    }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.isNew && !isActive && (
                    <span className="text-[9px] font-extrabold bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-1.5 py-0.5 rounded-full">
                      NEW
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            adminNav.map((item) => {
              const isActive = adminTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAdminTab(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${isActive
                    ? 'bg-slate-900 text-white shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge > 0 && (
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-500 text-white font-bold">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </nav>
      </div>

      {/* Bottom Sidebar Controls */}
      <div className="space-y-2 pt-6 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>{t('nav.settings')}</span>
        </button>

        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-rose-500" />
          <span>{t('nav.logOut')}</span>
        </button>
      </div>
    </aside>
  );
};
