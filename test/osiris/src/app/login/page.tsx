'use client'

import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { login } from '@/lib/nexafreight/client'
import { NexaHttpError, NexaNetworkError } from '@/lib/nexafreight/errors'
import { AuthProvider, useAuthStore } from '@/store/useAuthStore'
import { getCurrentUser } from '@/lib/nexafreight/client'

// ─── Inner form (needs access to auth store context) ─────────────────────────

function LoginForm() {
  const router = useRouter()
  const { setAuth } = useAuthStore()

  const [email, setEmail] = useState('operator@nexafreight.dev')
  const [password, setPassword] = useState('changeme123')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expiredNotice, setExpiredNotice] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search)
      if (p.get('reason') === 'expired') {
        setExpiredNotice(true)
      }
    }
    emailRef.current?.focus()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // login() auto-stores the token in client.ts's module-level store
      const loginResp = await login(email.trim(), password)

      // Fetch the full user profile (UserOut shape, has id)
      const user = await getCurrentUser()

      // Persist into React context so components can read it
      setAuth(loginResp.access_token, user)

      // Redirect to the main OSIRIS dashboard
      router.push('/')
    } catch (err) {
      console.error('[NexaFreight login error]', err)
      if (err instanceof NexaHttpError && err.isUnauthorized) {
        setError('Invalid credentials. Check your email and password.')
      } else if (err instanceof NexaNetworkError) {
        const detail = err.cause instanceof Error ? err.cause.message : String(err.cause ?? '')
        setError(`Cannot reach the NexaFreight server (${detail || 'port 8000'}). Check console.`)
      } else if (err instanceof NexaHttpError) {
        setError(`Server error ${err.status}: ${err.detail}`)
      } else {
        setError('Unexpected error. Check the browser console for details.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      {/* Animated background grid */}
      <div style={styles.grid} aria-hidden="true" />

      {/* Glow orbs */}
      <motion.div
        style={{ ...styles.orb, ...styles.orbGold }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.18, 0.28, 0.18] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      />
      <motion.div
        style={{ ...styles.orb, ...styles.orbCyan }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.12, 0.2, 0.12] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        aria-hidden="true"
      />

      <motion.main
        style={styles.card}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        role="main"
        aria-label="NexaFreight login"
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.eyeGlyph} aria-hidden="true">
            <span style={styles.eyeOuter}>◈</span>
          </div>
          <h1 style={styles.title}>NEXAFREIGHT</h1>
          <p style={styles.subtitle}>Control Tower — Operator Access</p>
          <div style={styles.divider} />
        </div>

        {expiredNotice && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: 16,
              background: 'rgba(255, 145, 0, 0.12)',
              border: '1px solid rgba(255, 145, 0, 0.4)',
              borderRadius: 6,
              color: '#FFB74D',
              fontSize: 12,
              fontFamily: 'var(--font-hud)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>◈</span>
            <span>Authentication token expired. Click Authenticate below to reconnect.</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          <div style={styles.fieldGroup}>
            <label htmlFor="nf-email" style={styles.label}>
              EMAIL
            </label>
            <input
              id="nf-email"
              ref={emailRef}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="operator@nexafreight.dev"
              style={styles.input}
              disabled={loading}
              aria-describedby={error ? 'nf-error' : undefined}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="nf-password" style={styles.label}>
              PASSWORD
            </label>
            <input
              id="nf-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              disabled={loading}
            />
          </div>

          {/* Error message */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                id="nf-error"
                role="alert"
                aria-live="assertive"
                style={styles.errorBox}
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.22 }}
              >
                <span style={styles.errorIcon} aria-hidden="true">⚠</span>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            id="nf-submit"
            type="submit"
            disabled={loading || !email || !password}
            style={{
              ...styles.button,
              opacity: loading || !email || !password ? 0.5 : 1,
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
            }}
            whileHover={loading ? {} : { scale: 1.02 }}
            whileTap={loading ? {} : { scale: 0.98 }}
          >
            {loading ? (
              <span style={styles.buttonLoading}>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                  style={{ display: 'inline-block' }}
                >
                  ◈
                </motion.span>
                &nbsp;AUTHENTICATING…
              </span>
            ) : (
              'AUTHENTICATE'
            )}
          </motion.button>
        </form>

        {/* Footer hint */}
        <p style={styles.hint}>
          Seeded operator account:&nbsp;
          <code style={styles.code}>operator@nexafreight.dev</code>
        </p>
      </motion.main>
    </div>
  )
}

export default function LoginPage() {
  return <LoginForm />
}

// ─── Styles (inline, using OSIRIS CSS variables via string literals) ──────────
// Using inline styles avoids any className/Tailwind conflicts with the global
// OSIRIS stylesheet while still reading from its CSS custom properties.

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-void)',
    fontFamily: 'var(--font-body)',
    position: 'relative',
    overflow: 'hidden',
  },

  // Subtle dot-grid background
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'radial-gradient(circle, rgba(212,175,55,0.07) 1px, transparent 1px)',
    backgroundSize: '32px 32px',
    pointerEvents: 'none',
  },

  // Glow orbs
  orb: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  orbGold: {
    width: 480,
    height: 480,
    background: 'var(--gold-primary)',
    top: '-15%',
    right: '-10%',
    opacity: 0.18,
  },
  orbCyan: {
    width: 360,
    height: 360,
    background: 'var(--cyan-primary)',
    bottom: '-10%',
    left: '-8%',
    opacity: 0.12,
  },

  // Glass card
  card: {
    position: 'relative',
    zIndex: 10,
    width: '100%',
    maxWidth: 420,
    margin: '0 16px',
    padding: '40px 36px 32px',
    background: 'var(--bg-panel)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid var(--border-active)',
    borderRadius: 12,
    boxShadow:
      '0 0 0 1px rgba(212,175,55,0.08), 0 32px 64px rgba(0,0,0,0.6), 0 0 80px rgba(212,175,55,0.06)',
  },

  // Header section
  header: {
    textAlign: 'center',
    marginBottom: 32,
  },
  eyeGlyph: {
    marginBottom: 12,
  },
  eyeOuter: {
    fontSize: 36,
    color: 'var(--gold-primary)',
    textShadow: '0 0 20px rgba(212,175,55,0.6)',
    fontFamily: 'var(--font-hud)',
  },
  title: {
    margin: '0 0 4px',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: 'var(--text-heading)',
    fontFamily: 'var(--font-hud)',
  },
  subtitle: {
    margin: '0 0 20px',
    fontSize: 11,
    letterSpacing: '0.12em',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-hud)',
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    background:
      'linear-gradient(90deg, transparent, var(--gold-primary), transparent)',
    opacity: 0.3,
  },

  // Form
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.14em',
    color: 'var(--text-gold)',
    fontFamily: 'var(--font-hud)',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid var(--border-primary)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
  },

  // Error box
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 14px',
    background: 'rgba(255,61,61,0.1)',
    border: '1px solid rgba(255,61,61,0.35)',
    borderRadius: 6,
    color: 'var(--alert-red)',
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    lineHeight: 1.5,
    overflow: 'hidden',
  },
  errorIcon: {
    flexShrink: 0,
    marginTop: 1,
    fontSize: 14,
  },

  // Submit button
  button: {
    marginTop: 4,
    padding: '12px',
    width: '100%',
    background: 'linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-dim) 100%)',
    border: 'none',
    borderRadius: 6,
    color: '#06060C',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.14em',
    fontFamily: 'var(--font-hud)',
    transition: 'box-shadow 0.2s',
    boxShadow: '0 0 20px rgba(212,175,55,0.25)',
  },
  buttonLoading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  // Footer hint
  hint: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 11,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-hud)',
  },
  code: {
    color: 'var(--text-cyan)',
    fontFamily: 'var(--font-hud)',
    fontSize: 11,
  },
}
