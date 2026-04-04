import { FileText, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import type { ActiveClaim } from '../../types/dashboard'

export function ActiveClaimCard({ claim }: { claim: ActiveClaim }) {
  const { claim_id, trigger_type, income_loss, payout_amount, fraud_score, status, created_at } = claim
  const statusColor = status === 'PAID' ? 'bg-green-50 border-green-200 text-green-700' :
    status === 'REJECTED' ? 'bg-red-50 border-red-200 text-red-700' :
    status === 'APPROVED' ? 'bg-[#E6FAF1] border-[#06C167]/30 text-[#06C167]' : 'bg-yellow-50 border-yellow-200 text-yellow-700'
  const StatusIcon = status === 'PAID' ? CheckCircle : status === 'REJECTED' ? XCircle : AlertCircle
  const iconColor = status === 'PAID' ? 'text-green-600' : status === 'REJECTED' ? 'text-red-600' : 'text-[#06C167]'
  const triggerLabel = ({ rain: 'Heavy Rainfall', heat: 'Extreme Heat', aqi: 'Air Quality', curfew: 'Zone Lockdown', platform: 'Platform Outage' } as Record<string,string>)[trigger_type] || trigger_type

  return (
    <div className={`border-2 rounded-xl p-6 ${statusColor}`}>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6" />
          <div><h3 className="font-semibold text-gray-900">Active Claim</h3><p className="text-xs text-gray-600 mt-1">{claim_id}</p></div>
        </div>
        <div className="flex items-center gap-2"><StatusIcon className={`w-5 h-5 ${iconColor}`} /><span className="font-bold">{status}</span></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div><p className="text-xs text-gray-600 mb-1">Trigger Type</p><p className="font-semibold text-gray-900">{triggerLabel}</p></div>
        <div><p className="text-xs text-gray-600 mb-1">Income Loss</p><p className="font-semibold text-gray-900">₹{income_loss.toLocaleString('en-IN')}</p></div>
        <div><p className="text-xs text-gray-600 mb-1">Payout Amount</p><p className="font-semibold text-gray-900">₹{payout_amount.toLocaleString('en-IN')}</p></div>
        <div>
          <p className="text-xs text-gray-600 mb-1">Fraud Score</p>
          <div className="flex items-center gap-2">
            <p className={`font-semibold ${fraud_score < 30 ? 'text-[#06C167]' : fraud_score < 70 ? 'text-yellow-600' : 'text-red-600'}`}>{fraud_score}/100</p>
            {fraud_score < 30 && <CheckCircle className="w-4 h-4 text-[#06C167]" />}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-4 border-t">
        <p className="text-xs text-gray-600">Created: {new Date(created_at).toLocaleString('en-IN')}</p>
        {status === 'PROCESSING' && <div className="flex items-center gap-2"><div className="w-2 h-2 bg-[#06C167] rounded-full animate-pulse" /><span className="text-xs font-medium">Processing...</span></div>}
        {status === 'PAID' && <span className="text-xs font-medium text-[#06C167]">✓ Payout completed</span>}
      </div>
    </div>
  )
}
