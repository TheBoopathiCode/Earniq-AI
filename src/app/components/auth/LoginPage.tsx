import { useEffect } from 'react'
import { EarniqLogo } from '../EarniqLogo'

interface Props {
  onGetStarted: () => void
  onGoogleLogin: () => void
  onBack: () => void
}

export function LoginPage({ onGetStarted, onGoogleLogin, onBack }: Props) {
  useEffect(() => {
    if (!document.getElementById('earniq-login-styles')) {
      const style = document.createElement('style')
      style.id = 'earniq-login-styles'
      style.innerHTML = `
        @keyframes earniq-float {
          0%   { transform: translateY(100vh) scale(0); opacity: 0; }
          10%  { opacity: 0.15; }
          90%  { opacity: 0.15; }
          100% { transform: translateY(-10vh) scale(1); opacity: 0; }
        }
        @keyframes earniq-slide-up {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `
      document.head.appendChild(style)
    }
    const particles: HTMLDivElement[] = []
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div')
      const size = Math.random() * 4 + 2
      p.style.cssText = `position:fixed;border-radius:50%;background:#22c55e;opacity:0.15;animation:earniq-float linear infinite;z-index:0;pointer-events:none;width:${size}px;height:${size}px;left:${Math.random()*100}%;animation-duration:${Math.random()*10+8}s;animation-delay:${Math.random()*10}s;`
      document.body.appendChild(p)
      particles.push(p)
    }
    return () => particles.forEach(p => p.remove())
  }, [])

  const muted = '#7aad8e'
  const border = '#1e3326'
  const green = '#22c55e'
  const greenGlow = 'rgba(34,197,94,0.18)'

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:'#0a1a12', color:'#e8f5ee', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative' }}>
      {/* bg-mesh */}
      <div style={{ position:'fixed', inset:0, zIndex:0, background:'radial-gradient(ellipse 60% 50% at 20% 20%,rgba(34,197,94,0.07) 0%,transparent 70%),radial-gradient(ellipse 50% 60% at 80% 80%,rgba(34,197,94,0.05) 0%,transparent 70%)' }} />
      {/* bg-grid */}
      <div style={{ position:'fixed', inset:0, zIndex:0, backgroundImage:'linear-gradient(rgba(34,197,94,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(34,197,94,0.04) 1px,transparent 1px)', backgroundSize:'40px 40px' }} />

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:440, padding:24, animation:'earniq-slide-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
            <EarniqLogo size="md" />
          </div>
          <div style={{ fontSize:13, color:muted, letterSpacing:'0.02em' }}>Income Insurance for Delivery Partners</div>
        </div>

        {/* Card */}
        <div style={{ background:'#111e16', border:`1px solid ${border}`, borderRadius:20, padding:32, boxShadow:'0 0 60px rgba(0,0,0,0.4),0 0 0 1px rgba(34,197,94,0.05)', animation:'earniq-slide-up 0.6s 0.2s cubic-bezier(0.22,1,0.36,1) both' }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:700, textAlign:'center', marginBottom:6, color:'#e8f5ee', margin:'0 0 6px' }}>Welcome Back</h2>
          <p style={{ textAlign:'center', color:muted, fontSize:14, marginBottom:24 }}>Sign in to protect your income</p>

          {/* Google */}
          <button onClick={onGoogleLogin}
            onMouseOver={e => (e.currentTarget.style.background='#f0f0f0')}
            onMouseOut={e => (e.currentTarget.style.background='#fff')}
            style={{ width:'100%', padding:13, background:'#fff', color:'#111', border:'none', borderRadius:12, fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:20, transition:'all 0.2s' }}>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, color:muted, fontSize:13 }}>
            <div style={{ flex:1, height:1, background:border }} />
            Or continue with
            <div style={{ flex:1, height:1, background:border }} />
          </div>

          {/* Get Started */}
          <button onClick={onGetStarted}
            onMouseOver={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 0 36px rgba(34,197,94,0.35)' }}
            onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow=`0 0 24px ${greenGlow}` }}
            style={{ width:'100%', padding:14, background:green, color:'#000', border:'none', borderRadius:12, fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, cursor:'pointer', letterSpacing:'0.02em', boxShadow:`0 0 24px ${greenGlow}`, marginBottom:24, transition:'all 0.2s' }}>
            Get Started
          </button>

          {/* Features */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { svg: <svg viewBox="0 0 24 24" fill="none" stroke={green} strokeWidth="2" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label:'Parametric income protection' },
              { svg: <svg viewBox="0 0 24 24" fill="none" stroke={green} strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><path d="M8 12l2 2 4-4"/></svg>, label:'Built for delivery partners' },
              { svg: <svg viewBox="0 0 24 24" fill="none" stroke={green} strokeWidth="2" width="14" height="14"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>, label:'AI-powered weekly pricing' },
            ].map(f => (
              <div key={f.label} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:muted }}>
                <div style={{ width:28, height:28, borderRadius:8, background:'#166534', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{f.svg}</div>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:16 }}>
          <button onClick={onBack} style={{ color:muted, fontSize:13, background:'none', border:'none', cursor:'pointer' }}>← Back to home</button>
        </div>
      </div>
    </div>
  )
}
