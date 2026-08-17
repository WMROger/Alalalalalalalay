import React from 'react';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Check,
  ChevronRight,
  Send,
  Award,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { IOSCard } from '../common/IOSCard';
import { IOSButton } from '../common/IOSButton';
import { IOSBadge } from '../common/IOSBadge';

export const NotificationsView = () => {
  const {
    notifications,
    markAllNotificationsRead,
    setSelectedOpportunity,
    opportunities,
    setActiveTab,
  } = useApp();

  const iconMap = {
    AlertTriangle,
    Sparkles,
    RefreshCw,
    ShieldCheck,
    Send,
    Award,
  };

  const handleNotificationAction = (notif) => {
    if (notif.type === 'expiring_document') {
      setActiveTab('documents');
    } else if (notif.type === 'matched_opportunity') {
      setSelectedOpportunity(opportunities[0]);
    } else if (notif.type === 'source_updated') {
      setActiveTab('explore');
    } else if (notif.type === 'application_submitted' || notif.type === 'application_approved') {
      setActiveTab('benefits');
    }
  };

  return (
    <div className="space-y-6 select-none max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1C1C1E] tracking-tight">
            Notifications & Alerts
          </h1>
          <p className="text-xs sm:text-sm text-[#8E8E93] mt-1">
            Stay updated on document expirations, new matched opportunities, and government circular changes
          </p>
        </div>

        <IOSButton
          variant="tertiary"
          size="sm"
          icon={Check}
          onClick={markAllNotificationsRead}
        >
          Mark All Read
        </IOSButton>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.map((notif) => {
          const Icon = iconMap[notif.icon] || Bell;
          const isUnread = !notif.read;

          return (
            <IOSCard
              key={notif.id}
              className={`flex items-start justify-between gap-4 p-4 sm:p-5 bg-white border ${
                isUnread ? 'border-blue-200 ring-1 ring-blue-500/20 bg-blue-50/20' : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm"
                  style={{ backgroundColor: notif.badgeColor }}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#1C1C1E]">{notif.title}</h3>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-[#007AFF] flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed max-w-xl">
                    {notif.message}
                  </p>
                  <span className="text-[10px] text-[#8E8E93] block pt-1">
                    {notif.time}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleNotificationAction(notif)}
                  className="text-xs font-bold text-[#007AFF] hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>{notif.actionText}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </IOSCard>
          );
        })}
      </div>
    </div>
  );
};
