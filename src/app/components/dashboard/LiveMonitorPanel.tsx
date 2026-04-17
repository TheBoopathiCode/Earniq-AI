import { memo } from 'react'
import { motion } from 'framer-motion'
import type { PollingState } from '../../hooks/usePollingEngine'

interface Props {
  state: PollingState
  compact?: boolean
}

const WORKERS = [
  {
    key: 'disruption' as const,
    fn: 'disruption_monitor()',
    freq: '15s',
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    barColor: 'bg-blue-400',
    interval: 15,
    getCountdown: (s: PollingState) => s.disruptionCountdown,
    getLastRun:   (s: PollingState) => s.disruptionLastRun,
    getPollCount: (s: PollingState) => s.disruptionPollCount,
  },
  {
    key: 'income' as const,
    fn: 'income_tracker()',
    freq: '10s',
    color: 'bg-green-500',
    textColor: 'text-green-600',
    barColor: 'bg-green-400',
    interval: 10,
    getCountdown: (s: PollingState) => s.incomeCountdown,
    getLastRun:   (s: PollingState) => s.incomeLastRun,
    getPollCount: (s: PollingState) => s.incomePollCount,
  },
  {
    key: 'syndicate' as const,
    fn: 'syndicate_detector()',
    freq: '5s',
    color: 'bg-purple-500',
    textColor: 'text-purple-600',
    barColor: 'bg-purple-400',
    interval: 5,
    getCountdown: (s: PollingState) => s.syndicateCountdown,
    getLastRun:   (s: PollingState) => s.syndicateLastRun,
    getPollCount: (s: PollingState) => s.syndicatePollCount,
  },
]

const dcsColor = (dcs: number) =>
  dcs >= 70 ? 'text-red-600' : dcs >= 40 ? 'text-yellow-600' : 'text-green-600'
const dcsBarColor = (dcs: number) =>
  dcs >= 70 ? 'bg-red-500' : dcs >= 40 ? 'bg-yellow-500' : 'bg-green-500'
const statusLabel = (s: string) =>
  s === 'RED' ? '🔴 Disruption active' : s === 'YELLOW' ? '🟡 Elevated risk' : '🟢 All zones clear'

export const LiveMonitorPanel = memo(function LiveMonitorPanel({ state, compact = false }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <p className="text-[13px] font-semibold text-gray-800">Celery Workers — Live</p>
        </div>
        <span className={`text-[11px] font-medium ${dcsColor(state.dcs)}`}>
          {statusLabel(state.incomeStatus)}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* DCS live display */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-gray-500 font-medium">Live DCS — {state.dcsSource === 'live' ? '🟢 OpenWeatherMap + AQICN' : state.dcsSource === 'demo' ? '🟡 Demo override' : '⏳ Loading…'}</span>
            <motion.span
              key={state.dcs}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className={`text-[20px] font-bold ${dcsColor(state.dcs)}`}
            >
              {state.dcs}
            </motion.span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${dcsBarColor(state.dcs)}`}
              animate={{ width: `${state.dcs}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>0 — Safe</span><span>40 — Watch</span><span>70 — Trigger</span>
          </div>
        </div>

        {/* Worker rows */}
        {WORKERS.map(w => {
          const countdown  = w.getCountdown(state)
          const lastRun    = w.getLastRun(state)
          const pollCount  = w.getPollCount(state)
          const pct        = ((w.interval - countdown) / w.interval) * 100
          const isRunning  = countdown === w.interval // just fired

          return (
            <div key={w.key} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${w.color} opacity-60`} />
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${w.color}`} />
                  </span>
                  <span className="font-mono text-[12px] text-gray-700">{w.fn}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isRunning && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className={`text-[10px] font-semibold ${w.textColor} bg-opacity-10 px-1.5 py-0.5 rounded`}
                    >
                      ▶ running
                    </motion.span>
                  )}
                  <span className={`font-mono text-[13px] font-bold ${w.textColor}`}>
                    {countdown}s
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-2">
                <motion.div
                  className={`h-full ${w.barColor} rounded-full`}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.9, ease: 'linear' }}
                />
              </div>

              {!compact && (
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Next poll in {countdown}s · every {w.freq}</span>
                  <span>#{pollCount} · {lastRun}</span>
                </div>
              )}
            </div>
          )
        })}

        {/* Syndicate passive scan note */}
        <div className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
          <span className="text-[10px] text-purple-600 leading-snug">
            <span className="font-semibold">syndicate_detector</span> passively scans all zone claim patterns every 5s — no manual trigger required. Current score: <span className="font-semibold">{state.syndicateScore}</span> (CLEAR)
          </span>
        </div>
      </div>
    </div>
  )
})
