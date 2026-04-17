import { memo } from 'react'
import { Brain, Clock, TrendingUp, Droplets, Wind, Thermometer } from 'lucide-react'
import type { AIInsight } from '../../types/dashboard'

export const AIInsightCard = memo(function AIInsightCard({ insight }: { insight: AIInsight }) {
  const raw = (insight as any).raw_readings
  const sources = (insight as any).signals_live as Record<string, string> | undefined

  return (
    <div className="bg-gradient-to-br from-[#06C167] to-[#049150] text-white rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2"><Brain className="w-6 h-6" /><h3 className="font-semibold">AI Prediction Engine</h3></div>
        <div className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium">LIVE</div>
      </div>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 text-sm opacity-90 mb-1"><Clock className="w-4 h-4" /><span>Prediction Window</span></div>
          <p className="text-2xl font-bold">{insight.prediction_window}</p>
        </div>
        <div><p className="text-sm opacity-90 mb-1">Risk Assessment</p><p className="text-lg font-medium leading-snug">{insight.risk_reason}</p></div>
        <div>
          <div className="flex items-center justify-between text-sm opacity-90 mb-2">
            <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /><span>Confidence Score</span></div>
            <span className="font-bold">{insight.confidence}%</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all duration-500" style={{ width: `${insight.confidence}%` }} />
          </div>
        </div>

        {/* Live sensor readings */}
        {raw && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/20">
            {raw.rain_mm > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Droplets className="w-3 h-3 opacity-80" />
                <span>{raw.rain_mm.toFixed(1)}mm/hr</span>
              </div>
            )}
            {raw.feels_like > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Thermometer className="w-3 h-3 opacity-80" />
                <span>{raw.feels_like.toFixed(0)}°C</span>
              </div>
            )}
            {raw.aqi > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Wind className="w-3 h-3 opacity-80" />
                <span>AQI {raw.aqi}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-white/20">
        <p className="text-xs opacity-75">
          {sources
            ? `📡 Weather: ${sources.weather ?? '—'} · AQI: ${sources.aqi ?? '—'} · Platform: ${sources.platform ?? '—'}`
            : '🤖 AI is actively monitoring zone conditions and worker income patterns'
          }
        </p>
      </div>
    </div>
  )
})
