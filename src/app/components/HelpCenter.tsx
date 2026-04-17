import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, User, Phone, MessageCircle, ChevronDown, ChevronUp, HelpCircle, Headphones, CheckCircle2, Clock, AlertTriangle, X } from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { PLATFORM_NAMES, CITY_NAMES } from '../lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id:      string
  role:    'user' | 'assistant' | 'system'
  text:    string
  time:    string
  typing?: boolean
}

interface SupportTicket {
  id:       string
  issue:    string
  status:   'open' | 'in_progress' | 'resolved'
  created:  string
  agent?:   string
}

// ── EarnIQ AI system prompt ───────────────────────────────────────────────────
function buildSystemPrompt(workerName: string, platform: string, zone: string, city: string, tier: string): string {
  return `You are EarnIQ Support AI — a helpful, empathetic assistant for gig delivery workers on the EarnIQ parametric income insurance platform.

Worker context:
- Name: ${workerName}
- Platform: ${platform}
- Zone: ${zone}, ${city}
- Policy tier: ${tier}

CRITICAL SCOPE RULE — you must enforce this in every response:
EarnIQ covers ONLY lost delivery income (wages/hours lost) caused by external disruptions.
STRICTLY EXCLUDED — never suggest these are covered:
  • Vehicle repairs, bike/scooter damage, maintenance
  • Medical bills, hospitalisation, accident injuries
  • Disability or personal accident cover
  • Family or personal emergencies
  • Voluntary income reduction
If a worker asks about any excluded item, clearly say it is not covered and explain what IS covered.

You help with:
1. How parametric insurance works (no claim forms — automatic payouts for income loss)
2. Why a claim was approved/rejected (DCS score, fraud checks)
3. Premium calculation and weekly deductions
4. Payout status and UPI issues
5. How to appeal a rejected claim
6. Zone risk scores and safe zone advisories

Rules:
- Be concise, warm, and use simple language
- Always mention the worker's name when relevant
- If the issue needs a human agent (fraud dispute, UPI failure, policy cancellation), say: "I'll connect you with a support executive now."
- Never make up claim amounts or policy details you don't know
- Keep responses under 4 sentences unless explaining a complex process`
}

// ── AI Chat via backend proxy (avoids exposing API key in frontend) ───────────
const BASE = import.meta.env.VITE_API_URL as string || 'http://localhost:8000/api'

async function callAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  try {
    const res = await fetch(`${BASE}/support/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('earniq_token')}`,
      },
      body: JSON.stringify({ messages }),
    })
    if (res.ok) {
      const data = await res.json()
      return data.reply || data.message || 'I understand. Let me help you with that.'
    }
  } catch {}

  // Fallback: rule-based responses when backend AI is unavailable
  const last = messages[messages.length - 1]?.content?.toLowerCase() ?? ''
  if (last.includes('payout') || last.includes('money') || last.includes('payment'))
    return 'Payouts are processed automatically within 90 seconds of claim approval via Razorpay UPI. If you haven\'t received it within 2 hours, I\'ll connect you with a support executive.'
  if (last.includes('claim') && last.includes('reject'))
    return 'Claims are rejected when the DCS score is below 70 or fraud signals are detected. You can appeal once per month by submitting delivery logs. Would you like me to start an appeal?'
  if (last.includes('premium') || last.includes('deduct'))
    return 'Your weekly premium is auto-debited every Monday at 6 AM. It\'s calculated as 3.5% of your estimated weekly income, adjusted for your zone risk score.'
  if (last.includes('appeal'))
    return 'To appeal a rejected claim, you need to submit your delivery app screenshot and GPS history for the disruption window. I can raise a ticket for you right now.'
  if (last.includes('coverage') || last.includes('cover') || last.includes('what') && last.includes('cover'))
    return 'EarnIQ covers ONLY lost delivery income from: heavy rain, extreme heat, severe AQI, zone lockdown, and platform outage. It does NOT cover vehicle repairs, medical bills, accident injuries, or personal emergencies. These will be auto-rejected.'
  if (last.includes('cancel') || last.includes('stop'))
    return 'You can cancel your policy anytime. The current week\'s premium is non-refundable. I\'ll connect you with a support executive to process the cancellation.'
  return 'I\'m here to help! Could you tell me more about your issue? For example: "My payout didn\'t arrive" or "Why was my claim rejected?"'
}

// ── FAQ items ─────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'How does automatic payout work?',         a: 'When a disruption is confirmed (DCS ≥ 70) and your income drops >40%, EarnIQ automatically creates a claim and sends money to your UPI within 90 seconds. No forms needed.' },
  { q: 'Why was my claim rejected?',               a: 'Claims are rejected if: (1) DCS was below 70 in your zone, (2) your GPS showed you weren\'t in the disruption zone, or (3) the fraud engine detected anomalies. You can appeal once per month.' },
  { q: 'When is my premium deducted?',             a: 'Every Monday at 6 AM via Razorpay auto-debit. You\'ll get a notification Sunday night with your next week\'s premium amount.' },
  { q: 'What is DCS score?',                       a: 'Disruption Confidence Score (0–100) measures how severe a disruption is in your zone using weather, AQI, traffic, government alerts, and worker activity data. Claims trigger at DCS ≥ 70.' },
  { q: 'What is NOT covered?', a: 'EarnIQ is strictly income loss insurance. It only pays for delivery wages you could not earn because of an external disruption. Vehicle repairs, medical bills, accident injuries, bike maintenance, and personal emergencies are completely excluded and will be auto-rejected.' },
  { q: 'How do I appeal a rejected claim?',        a: 'Go to Claims → select the rejected claim → tap Appeal. Submit your delivery app screenshot and GPS history. Human review within 24 hours.' },
]

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  'My payout didn\'t arrive',
  'Why was my claim rejected?',
  'How is my premium calculated?',
  'I want to appeal a claim',
  'What does my policy cover?',
  'Cancel my policy',
]

function nowStr() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// ── Main HelpCenter component ─────────────────────────────────────────────────
export function HelpCenter() {
  const { worker, policy } = useAppContext()
  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [escalated, setEscalated]       = useState(false)
  const [ticket, setTicket]             = useState<SupportTicket | null>(null)
  const [expandedFaq, setExpandedFaq]   = useState<number | null>(null)
  const [tab, setTab]                   = useState<'chat' | 'faq' | 'contact'>('chat')
  const bottomRef                       = useRef<HTMLDivElement>(null)
  const inputRef                        = useRef<HTMLInputElement>(null)

  const workerName = worker?.name || 'there'
  const platform   = worker ? PLATFORM_NAMES[worker.platform] : 'your platform'
  const zone       = worker?.zone?.name || 'your zone'
  const city       = worker ? CITY_NAMES[worker.city] : 'your city'
  const tier       = policy?.tier || 'standard'

  // Welcome message on mount
  useEffect(() => {
    setMessages([{
      id:   'welcome',
      role: 'assistant',
      text: `Hi ${workerName}! 👋 I'm EarnIQ Support AI. I can help you with claims, payouts, your policy, and more.\n\nWhat can I help you with today?`,
      time: nowStr(),
    }])
  }, [workerName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setInput('')

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: text.trim(), time: nowStr() }
    const typingMsg: Message = { id: 'typing', role: 'assistant', text: '', time: nowStr(), typing: true }

    setMessages(prev => [...prev, userMsg, typingMsg])
    setLoading(true)

    // Check if user wants human agent
    const wantsHuman = /human|agent|executive|person|real|speak|talk|call/i.test(text)

    if (wantsHuman) {
      await new Promise(r => setTimeout(r, 800))
      setMessages(prev => prev.filter(m => m.id !== 'typing').concat({
        id:   `a-${Date.now()}`,
        role: 'assistant',
        text: `I'll connect you with a support executive right away. Please hold for a moment while I create your support ticket.`,
        time: nowStr(),
      }))
      setLoading(false)
      setTimeout(() => handleEscalate(text), 1500)
      return
    }

    // Build conversation history for AI
    const history = messages
      .filter(m => !m.typing && m.id !== 'welcome')
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))

    const systemPrompt = buildSystemPrompt(workerName, platform, zone, city, tier)
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text.trim() },
    ]

    try {
      const reply = await callAI(apiMessages)
      setMessages(prev => prev.filter(m => m.id !== 'typing').concat({
        id:   `a-${Date.now()}`,
        role: 'assistant',
        text: reply,
        time: nowStr(),
      }))

      // Auto-suggest escalation if AI says so
      if (/connect you with a support executive/i.test(reply)) {
        setTimeout(() => setEscalated(true), 500)
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== 'typing').concat({
        id:   `a-${Date.now()}`,
        role: 'assistant',
        text: 'Sorry, I\'m having trouble connecting right now. Please try again or contact our support team directly.',
        time: nowStr(),
      }))
    } finally {
      setLoading(false)
    }
  }, [loading, messages, workerName, platform, zone, city, tier])

  const handleEscalate = useCallback(async (issue?: string) => {
    setEscalated(true)
    const ticketId = `TKT-${Date.now().toString(36).toUpperCase().slice(-6)}`
    const newTicket: SupportTicket = {
      id:      ticketId,
      issue:   issue || 'General support request',
      status:  'open',
      created: new Date().toLocaleString('en-IN'),
      agent:   'Priya S.',
    }
    setTicket(newTicket)

    // Notify in chat
    setMessages(prev => [...prev, {
      id:   `sys-${Date.now()}`,
      role: 'system',
      text: `✅ Support ticket ${ticketId} created. Agent Priya S. will contact you within 30 minutes on your registered number.`,
      time: nowStr(),
    }])
  }, [])

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-[#06C167]" /> Help & Support
        </h1>
        <p className="text-sm text-gray-500 mt-1">AI-powered support · escalate to human anytime</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
        {([['chat', '💬 AI Chat'], ['faq', '❓ FAQ'], ['contact', '📞 Contact']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── AI Chat Tab ── */}
      {tab === 'chat' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col" style={{ height: '520px' }}>
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-[#06C167]/10 to-transparent">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#06C167] rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-900">EarnIQ Support AI</p>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <p className="text-[10px] text-gray-500">Online · responds instantly</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleEscalate()}
              className="flex items-center gap-1.5 text-[11px] text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Headphones className="w-3 h-3" /> Talk to human
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role !== 'system' && (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.role === 'user' ? 'bg-[#06C167]' : 'bg-gray-100'}`}>
                    {msg.role === 'user'
                      ? <User className="w-3.5 h-3.5 text-white" />
                      : <Bot className="w-3.5 h-3.5 text-gray-600" />}
                  </div>
                )}
                <div className={`max-w-[75%] ${msg.role === 'system' ? 'w-full' : ''}`}>
                  {msg.typing ? (
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1 items-center h-4">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  ) : msg.role === 'system' ? (
                    <div className="bg-[#E6FAF1] border border-[#06C167]/20 rounded-xl px-3 py-2 text-[12px] text-[#049150] font-medium text-center">
                      {msg.text}
                    </div>
                  ) : (
                    <div className={`rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-[#06C167] text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  )}
                  {msg.role !== 'system' && (
                    <p className={`text-[10px] text-gray-400 mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>{msg.time}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 2 && (
            <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
              {QUICK_PROMPTS.map(p => (
                <button key={p} onClick={() => sendMessage(p)}
                  className="flex-shrink-0 text-[11px] bg-gray-50 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full hover:bg-[#E6FAF1] hover:border-[#06C167]/30 hover:text-[#06C167] transition-colors">
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Escalation banner */}
          {escalated && ticket && (
            <div className="mx-4 mb-2 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
              <Headphones className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-blue-800">Ticket #{ticket.id} · Agent: {ticket.agent}</p>
                <p className="text-[11px] text-blue-600">You'll receive a call within 30 minutes on your registered number.</p>
              </div>
              <button onClick={() => setEscalated(false)} className="text-blue-400 hover:text-blue-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
              placeholder="Type your question…"
              disabled={loading}
              className="flex-1 text-[13px] bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#06C167]/30 focus:border-[#06C167] disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="w-10 h-10 bg-[#06C167] text-white rounded-xl flex items-center justify-center hover:bg-[#049150] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── FAQ Tab ── */}
      {tab === 'faq' && (
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-[13px] font-medium text-gray-800 pr-4">{faq.q}</span>
                {expandedFaq === i
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              </button>
              {expandedFaq === i && (
                <div className="px-4 pb-4 text-[13px] text-gray-600 leading-relaxed border-t border-gray-50 pt-3">
                  {faq.a}
                  <button
                    onClick={() => { setTab('chat'); setTimeout(() => sendMessage(faq.q), 300) }}
                    className="mt-2 text-[11px] text-[#06C167] hover:underline block"
                  >
                    Ask AI about this →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Contact Tab ── */}
      {tab === 'contact' && (
        <div className="space-y-4">
          {/* Active ticket */}
          {ticket && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <p className="text-[13px] font-semibold text-blue-800">Active Ticket — #{ticket.id}</p>
                <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  ticket.status === 'resolved' ? 'bg-green-100 text-green-700' :
                  ticket.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-blue-100 text-blue-700'
                }`}>{ticket.status.replace('_', ' ').toUpperCase()}</span>
              </div>
              <p className="text-[12px] text-blue-700">Issue: {ticket.issue}</p>
              <p className="text-[11px] text-blue-500 mt-1">Agent: {ticket.agent} · Created: {ticket.created}</p>
            </div>
          )}

          {/* Contact options */}
          <div className="grid gap-3">
            {[
              {
                icon: MessageCircle,
                title: 'Chat with AI',
                desc: 'Instant answers · available 24/7',
                action: () => setTab('chat'),
                color: 'bg-[#E6FAF1] border-[#06C167]/20',
                iconColor: 'text-[#06C167]',
                badge: 'Instant',
                badgeColor: 'bg-[#06C167] text-white',
              },
              {
                icon: Headphones,
                title: 'Talk to Support Executive',
                desc: 'Human agent · Mon–Sat 9AM–9PM',
                action: () => handleEscalate('User requested human support'),
                color: 'bg-blue-50 border-blue-200',
                iconColor: 'text-blue-600',
                badge: '~30 min',
                badgeColor: 'bg-blue-100 text-blue-700',
              },
              {
                icon: Phone,
                title: 'Call Support',
                desc: '1800-XXX-XXXX · Toll free · 9AM–9PM',
                action: () => window.open('tel:1800XXXXXXX'),
                color: 'bg-gray-50 border-gray-200',
                iconColor: 'text-gray-600',
                badge: 'Toll free',
                badgeColor: 'bg-gray-100 text-gray-600',
              },
            ].map(opt => {
              const Icon = opt.icon
              return (
                <button key={opt.title} onClick={opt.action}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left hover:scale-[1.01] transition-all ${opt.color}`}>
                  <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">{opt.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 ${opt.badgeColor}`}>
                    {opt.badge}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Worker ID for support */}
          {worker && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-[11px] text-gray-500 mb-2">Share this with the support executive:</p>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div><p className="text-gray-400 text-[10px]">Worker ID</p><p className="font-mono font-bold text-gray-800">{(worker as any).platform_worker_id || worker.id}</p></div>
                <div><p className="text-gray-400 text-[10px]">Phone</p><p className="font-medium text-gray-800">+91 {worker.phone}</p></div>
                <div><p className="text-gray-400 text-[10px]">Platform</p><p className="font-medium text-gray-800 capitalize">{PLATFORM_NAMES[worker.platform]}</p></div>
                <div><p className="text-gray-400 text-[10px]">Policy Tier</p><p className="font-medium text-gray-800 capitalize">{policy?.tier || '—'}</p></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
