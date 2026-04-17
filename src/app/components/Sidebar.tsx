import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, AlertCircle, History, User, LogOut, X, Menu, HelpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher'
import { useAppContext } from '../context/AppContext'

export function Sidebar({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation()
  const { unreadClaims, clearUnreadClaims } = useAppContext()
  const [mobileOpen, setMobileOpen] = useState(false)

  const menuItems = [
    { path: '/',        label: t('dashboard'), icon: LayoutDashboard, badge: 0 },
    { path: '/policy',  label: t('policy'),    icon: FileText,        badge: 0 },
    { path: '/claims',  label: t('claims'),    icon: AlertCircle,     badge: unreadClaims },
    { path: '/history', label: t('history'),   icon: History,         badge: 0 },
    { path: '/profile', label: t('profile'),   icon: User,            badge: 0 },
    { path: '/help',    label: 'Help',         icon: HelpCircle,      badge: 0 },
  ]

  const SidebarContent = () => (
    <>
      <div className="py-4 border-b border-gray-200 flex items-center justify-between px-4">
        <img src="/logo.jpeg" alt="EarnIQ" className="w-12 h-auto drop-shadow-sm" />
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 text-gray-500 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.map(item => {
            const Icon = item.icon
            return (
              <li key={item.path}>
                <NavLink to={item.path} end={item.path === '/'}
                  onClick={() => { if (item.path === '/claims') clearUnreadClaims(); setMobileOpen(false) }}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive ? 'bg-[#E6FAF1] text-[#06C167] font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`
                  }>
                  <Icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{t('language')}</span>
          <LanguageSwitcher />
        </div>
        <button onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
          <LogOut className="w-4 h-4" /><span>{t('sign_out')}</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
        <Menu className="w-5 h-5 text-gray-700" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 bg-white flex flex-col shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  )
}
