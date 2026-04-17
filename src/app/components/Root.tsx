import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SystemStatusBar } from './SystemStatusBar'
import { VoiceCommandPanel } from './VoiceCommandPanel'
import { LanguageSuggestion } from './LanguageSuggestion'
import { WorkerNotifProvider } from './dashboard/WorkerNotificationCenter'
import { Smartphone, Monitor } from 'lucide-react'

export function Root({ onLogout }: { onLogout: () => void }) {
  const [phoneView, setPhoneView] = useState(false)

  return (
    <WorkerNotifProvider>
      <div className="flex h-screen bg-gray-50">
        <Sidebar onLogout={onLogout} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <SystemStatusBar />
          <main className="flex-1 overflow-y-auto relative">
            <button
              onClick={() => setPhoneView(v => !v)}
              title={phoneView ? 'Switch to desktop view' : 'Switch to phone view'}
              className="fixed bottom-24 left-4 z-50 w-9 h-9 bg-white border border-gray-200 rounded-lg shadow-md flex items-center justify-center hover:bg-gray-50 transition-all lg:left-[272px]"
            >
              {phoneView
                ? <Monitor className="w-4 h-4 text-gray-600" />
                : <Smartphone className="w-4 h-4 text-gray-600" />
              }
            </button>
            {phoneView ? (
              <div className="flex items-start justify-center py-6 px-4 min-h-full bg-gray-200">
                <div className="w-[390px] min-h-[844px] bg-white rounded-[40px] shadow-2xl overflow-hidden border-4 border-gray-800 relative flex flex-col">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-gray-800 rounded-b-2xl z-10" />
                  <div className="flex-1 overflow-y-auto mt-6">
                    <Outlet />
                  </div>
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
        <VoiceCommandPanel />
        <LanguageSuggestion />
      </div>
    </WorkerNotifProvider>
  )
}
