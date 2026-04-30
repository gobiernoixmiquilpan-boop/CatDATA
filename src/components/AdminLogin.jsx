import { useState } from 'react'
import { supabase, isConfigured, setLocalSession } from '../lib/supabase'
import { IconAppLogo } from './Icons'
import './AdminLogin.css'

export default function AdminLogin({ onBack, onLoginLocal }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (isConfigured) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      if (!email || !email.includes('@')) {
        setError('Ingresa un email válido para modo desarrollo')
      } else {
        setLocalSession(email)
        if (onLoginLocal) onLoginLocal({ user: { email } })
      }
    }
    setLoading(false)
  }

  return (
    <div className="al-page">

      {/* Topbar — igual al del formulario */}
      <header className="al-topbar">
        <div className="al-topbar-inner">
          <div className="al-brand">
            <IconAppLogo size={26} />
            <span>Catastro</span>
          </div>
          <button className="al-back-btn" onClick={onBack}>
            ← Formulario
          </button>
        </div>
      </header>

      {/* Contenido centrado */}
      <div className="al-body">
        <div className="al-card">

          <div className="al-card-head">
            <div className="al-card-icon">
              <IconAppLogo size={36} />
            </div>
            <div>
              <h1>Acceso Admin</h1>
              <p className="al-sub">
                {isConfigured
                  ? 'Inicia sesión para gestionar los registros'
                  : 'Modo desarrollo — ingresa cualquier email'}
              </p>
            </div>
          </div>

          {!isConfigured && (
            <div className="al-warn">
              <b>Modo desarrollo.</b> Sin Supabase configurado. Cualquier email es válido para acceder al panel.
            </div>
          )}

          <form onSubmit={handleSubmit} className="al-form">
            <div className="al-field">
              <label>Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={isConfigured ? 'admin@ixmiquilpan.gob.mx' : 'admin@local.dev'}
                required
                autoFocus
              />
            </div>
            <div className="al-field">
              <label>Contraseña{!isConfigured && <span className="al-dev-note"> (ignorada en dev)</span>}</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required={isConfigured}
              />
            </div>
            {error && <div className="al-error">{error}</div>}
            <button type="submit" className="al-btn" disabled={loading}>
              {loading ? 'Verificando…' : 'Ingresar al panel'}
            </button>
          </form>

          <p className="al-footer">
            <button className="al-link" onClick={onBack}>← Volver al formulario de captura</button>
          </p>
        </div>
      </div>
    </div>
  )
}
