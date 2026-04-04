import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SystemStatusBar } from './SystemStatusBar'
import { VoiceCommandPanel } from './VoiceCommandPanel'
import { LanguageSuggestion } from './LanguageSuggestion'

export function Root({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar onLogout={onLogout} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <SystemStatusBar />
        <main className="flex-1 overflow-y-auto pt-0 lg:pt-0">
          <Outlet />
        </main>
      </div>
      <VoiceCommandPanel />
      <LanguageSuggestion />
    </div>
  )
}
