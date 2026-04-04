export function EarniqLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { hex: 28, font: '20px' },
    md: { hex: 36, font: '26px' },
    lg: { hex: 44, font: '32px' },
  }
  const s = sizes[size]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: s.hex, height: s.hex,
        background: '#22c55e',
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        position: 'relative',
        boxShadow: '0 0 20px rgba(34,197,94,0.3)',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', inset: 4,
          background: '#0a1a12',
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        }} />
      </div>
      <span style={{
        fontFamily: "'Syne', sans-serif",
        fontWeight: 800,
        fontSize: s.font,
        color: '#e8f5ee',
        letterSpacing: '-0.5px',
        lineHeight: 1,
      }}>
        Earniq<span style={{ color: '#22c55e' }}>AI</span>
      </span>
    </div>
  )
}
