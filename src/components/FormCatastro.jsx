import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import './FormCatastro.css'
import {
  SERVICE_ICONS,
  IconMap, IconHash, IconRoadType, IconCheck, IconLock, IconClose, IconDelete,
  IconLampPost, IconManhole, IconPin, IconLayers, IconTrash2, IconLocate,
  IconBuilding, IconAppLogo
} from './Icons'
import { supabase, isConfigured } from '../lib/supabase'
import { toUTM } from '../utils/utm'
import { enqueue, getQueue, dequeue, queueSize, addConflict, getConflicts, clearConflicts, conflictCount } from '../utils/offlineQueue'

/* ─── Data ──────────────────────────────────────────────── */
const TIPOS_VIALIDAD = [
  { code: 'AVE', label: 'Avenida' },
  { code: 'BLV', label: 'Boulevard' },
  { code: 'CAL', label: 'Calle' },
  { code: 'CJN', label: 'Callejón' },
  { code: 'CDA', label: 'Cerrada' },
  { code: 'CZA', label: 'Calzada' },
  { code: 'CAR', label: 'Carretera' },
]

const TIPOS_PAVIMENTO = [
  { code: 'AD', label: 'Adoquín' },
  { code: 'HI', label: 'Concreto Hidráulico' },
  { code: 'AS', label: 'Asfalto' },
  { code: 'EM', label: 'Empedrado' },
  { code: 'TE', label: 'Terracería' },
  { code: 'TI', label: 'Tierra' },
]

const SERVICIOS_LIST = [
  { key: 'aguaPotable',       label: 'Agua Potable' },
  { key: 'drenaje',           label: 'Drenaje' },
  { key: 'alcantarillado',    label: 'Alcantarillado' },
  { key: 'electrificacion',   label: 'Electrificación' },
  { key: 'guarniciones',      label: 'Guarniciones' },
  { key: 'banquetas',         label: 'Banquetas' },
  { key: 'pavimento',         label: 'Pavimento', hasTipo: true },
  { key: 'recoleccionBasura', label: 'Recolección de Basura' },
]

const EQUIPAMIENTO_LIST = [
  { key: 'educacionCultura',  label: 'Educación y Cultura' },
  { key: 'transportePublico', label: 'Transporte Público' },
  { key: 'comercioAbasto',    label: 'Comercio y Abasto' },
  { key: 'recreacionDeporte', label: 'Recreación y Deporte' },
  { key: 'saludAsistencia',   label: 'Salud y Asistencia' },
  { key: 'telefono',          label: 'Teléfono' },
  { key: 'correosYTelegrafo', label: 'Correos y Telégrafo' },
  { key: 'contaminacion',     label: 'Contaminación' },
  { key: 'calleEspecial',     label: 'Calle Especial' },
]

const OPCIONES_SERVICIO = [
  { val: 'B', label: 'Bueno',   peso: 0.76, color: 'green' },
  { val: 'R', label: 'Regular', peso: 0.70, color: 'amber' },
  { val: 'M', label: 'Malo',    peso: 0.64, color: 'red'   },
  { val: 'N', label: 'Ninguno', peso: 1.00, color: 'muted' },
]

const INFRA_TIPOS = [
  {
    key: 'luminaria', label: 'Luminaria', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d',
    icon: <IconLampPost />, symbol: 'L',
    iconSvg: '<path d="M12 22V11"/><path d="M12 11C12 7 16 5 19 5"/><circle cx="19" cy="5" r="2" fill="white"/><path d="M5 22h14"/>',
    subtypes: [
      { key: 'poste_luz',      label: 'Poste de Luz',         symbol: 'PL', color: '#d97706',
        iconSvg: '<path d="M12 22V11"/><path d="M12 11C12 7 16 5 19 5"/><circle cx="19" cy="5" r="2" fill="white"/><path d="M5 22h14"/>' },
      { key: 'poste_telefono', label: 'Poste de Teléfono',    symbol: 'PT', color: '#6366f1',
        iconSvg: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="6" y1="8" x2="18" y2="8"/><line x1="7" y1="13" x2="17" y2="13"/>' },
      { key: 'luminaria',      label: 'Luminaria',            symbol: 'LU', color: '#f59e0b',
        iconSvg: '<path d="M9 21h6"/><path d="M10 18h4"/><path d="M12 3a5 5 0 015 5c0 2-1 3-2 4v1H9v-1c-1-1-2-2-2-4a5 5 0 015-5z"/>' },
      { key: 'todos',          label: 'Todas las anteriores', symbol: 'LA', color: '#92400e',
        iconSvg: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/><line x1="18.4" y1="5.6" x2="5.6" y2="18.4"/>' },
    ],
  },
  {
    key: 'alcantarilla', label: 'Alcantarilla', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd',
    icon: <IconManhole />, symbol: 'A',
    iconSvg: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',
    subtypes: [
      { key: 'con_agua', label: 'Sí hay agua', symbol: 'CA', color: '#0284c7',
        iconSvg: '<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>' },
      { key: 'sin_agua', label: 'No hay agua', symbol: 'SA', color: '#475569',
        iconSvg: '<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/><line x1="8" y1="14" x2="16" y2="18" stroke-width="2.5"/>' },
    ],
  },
  {
    key: 'inmueble', label: 'Inmueble', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5',
    icon: <IconBuilding />, symbol: 'I',
    iconSvg: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
    subtypes: [
      { key: 'casa_habitacional', label: 'Casa Habitacional', symbol: 'CH', color: '#16a34a',
        iconSvg: '<polyline points="3,11 12,3 21,11"/><path d="M5 11v10h5v-5h4v5h5V11"/>' },
      { key: 'nave_industrial',   label: 'Nave Industrial',   symbol: 'NI', color: '#7c3aed',
        iconSvg: '<path d="M2 22V9l10-7 10 7v13"/><path d="M9 22v-8h6v8"/><line x1="2" y1="13" x2="22" y2="13"/>' },
      { key: 'comercial',         label: 'Comercial',         symbol: 'CM', color: '#ea580c',
        iconSvg: '<path d="M3 9l1-6h16l1 6"/><path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0"/><path d="M5 22V13h14v9"/>' },
      { key: 'terreno_baldio',    label: 'Terreno Baldío',    symbol: 'TB', color: '#78716c',
        iconSvg: '<rect x="3" y="8" width="18" height="12" rx="1" stroke-dasharray="3 2"/><line x1="2" y1="21" x2="22" y2="21"/>' },
    ],
  },
]

function makeMarkerIcon(color, iconSvg) {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin-dot" style="background:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">${iconSvg}</svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  })
}

// Precreate icons (type + subtype) so they don't recreate on every render
const INFRA_ICONS = {}
INFRA_TIPOS.forEach(t => {
  INFRA_ICONS[t.key] = makeMarkerIcon(t.color, t.iconSvg)
  t.subtypes?.forEach(st => {
    INFRA_ICONS[`${t.key}_${st.key}`] = makeMarkerIcon(st.color, st.iconSvg)
  })
})

const TOTAL_FIELDS = 3 + SERVICIOS_LIST.length + EQUIPAMIENTO_LIST.length

/* ─── Manzana Modal (numpad + sub-tramo) ────────────────── */
function ManzanaModal({ current, onConfirm, onClose }) {
  const parts = current ? current.split('.') : ['', '']
  const [input, setInput] = useState(parts[0] || '')
  const [subPart, setSubPart] = useState(parts[1] || '')

  const num = parseInt(input)
  const validMain = input !== '' && !isNaN(num) && num >= 1 && num <= 1000
  const fullValue = validMain ? (subPart ? `${num}.${subPart}` : String(num)) : ''

  const press = (k) => {
    if (k === 'DEL') { setInput(p => p.slice(0, -1)); return }
    if (k === 'CLR') { setInput(''); setSubPart(''); return }
    if (input.length >= 4) return
    const next = input + k
    if (parseInt(next) > 1000) return
    setInput(next)
  }

  const keys = ['1','2','3','4','5','6','7','8','9','CLR','0','DEL']

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-icon">{<IconHash />}</span>
            Número de Manzana
          </div>
          <button className="modal-close" onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-display">
          <span className={`modal-number ${!input ? 'placeholder' : ''} ${input && !validMain ? 'invalid' : ''}`}>
            {fullValue || '—'}
          </span>
          <span className="modal-range">1 – 1000 · Calle opcional</span>
        </div>

        {input && !validMain && (
          <div className="modal-error">Ingresa un número entre 1 y 1000</div>
        )}

        <div className="numpad">
          {keys.map(k => (
            <button
              key={k}
              className={`numpad-key ${k === 'CLR' ? 'key-clear' : ''} ${k === 'DEL' ? 'key-del' : ''}`}
              onClick={() => press(k)}
            >
              {k === 'DEL' ? <IconDelete /> : k}
            </button>
          ))}
        </div>

        {validMain && (
          <div className="modal-subpart">
            <div className="modal-subpart-label">Calle alrededor de la manzana — opcional</div>
            <div className="modal-subpart-grid">
              <button
                className={`subpart-btn ${subPart === '' ? 'subpart-active' : ''}`}
                onClick={() => setSubPart('')}
              >
                Sin calle
              </button>
              {['1','2','3','4','5','6','7','8','9'].map(s => (
                <button
                  key={s}
                  className={`subpart-btn ${subPart === s ? 'subpart-active' : ''}`}
                  onClick={() => setSubPart(s)}
                >
                  .{s}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className="modal-confirm"
          disabled={!validMain}
          onClick={() => { if (validMain) onConfirm(fullValue) }}
        >
          <IconCheck /> Confirmar{fullValue ? ` manzana ${fullValue}` : ''}
        </button>
      </div>
    </div>
  )
}


/* ─── Service Row ───────────────────────────────────────── */
function ServiceRow({ item, value, locked, isNext, onChange, children }) {
  const ref = useRef(null)
  const prevLocked = useRef(locked)

  useEffect(() => {
    if (prevLocked.current && !locked && ref.current) {
      ref.current.classList.add('row-pulse')
      setTimeout(() => ref.current?.classList.remove('row-pulse'), 700)
    }
    prevLocked.current = locked
  }, [locked])

  const sel = OPCIONES_SERVICIO.find(o => o.val === value)

  return (
    <div
      ref={ref}
      className={`fc-row ${locked ? (isNext ? 'row-next' : 'row-locked') : 'row-open'} ${value ? `row-filled row-filled-${sel?.color}` : ''}`}
    >
      <div className="row-left">
        <span className="row-icon">{SERVICE_ICONS[item.key]}</span>
        <span className="row-label">{item.label}</span>
        {value && <span className={`row-badge badge-${sel?.color}`}>{sel?.label}</span>}
      </div>

      {locked
        ? <div className="row-lock-msg"><IconLock /> {isNext ? 'Completa el campo anterior' : 'Bloqueado'}</div>
        : (
          <div className="row-opts">
            {OPCIONES_SERVICIO.map(opt => (
              <button
                key={opt.val}
                type="button"
                className={`row-opt opt-${opt.color} ${value === opt.val ? 'opt-active' : ''}`}
                onClick={() => onChange(item.key, opt.val)}
              >
                {value === opt.val && <IconCheck />}
                {opt.label}
              </button>
            ))}
          </div>
        )
      }

      {children}
    </div>
  )
}

/* ─── Equip Row ─────────────────────────────────────────── */
function EquipRow({ item, value, locked, isNext, onChange }) {
  const ref = useRef(null)
  const prevLocked = useRef(locked)

  useEffect(() => {
    if (prevLocked.current && !locked && ref.current) {
      ref.current.classList.add('row-pulse')
      setTimeout(() => ref.current?.classList.remove('row-pulse'), 700)
    }
    prevLocked.current = locked
  }, [locked])

  return (
    <div
      ref={ref}
      className={`fc-row ${locked ? (isNext ? 'row-next' : 'row-locked') : 'row-open'} ${value !== '' ? (value === '1' ? 'row-filled row-filled-green' : 'row-filled row-filled-muted') : ''}`}
    >
      <div className="row-left">
        <span className="row-icon">{SERVICE_ICONS[item.key]}</span>
        <span className="row-label">{item.label}</span>
        {value !== '' && (
          <span className={`row-badge ${value === '1' ? 'badge-green' : 'badge-muted'}`}>
            {value === '1' ? 'Sí hay' : 'No hay'}
          </span>
        )}
      </div>

      {locked
        ? <div className="row-lock-msg"><IconLock /> {isNext ? 'Completa el campo anterior' : 'Bloqueado'}</div>
        : (
          <div className="row-opts">
            <button
              type="button"
              className={`row-opt opt-green ${value === '1' ? 'opt-active' : ''}`}
              onClick={() => onChange(item.key, '1')}
            >
              {value === '1' && <IconCheck />} Sí hay
            </button>
            <button
              type="button"
              className={`row-opt opt-muted ${value === '0' ? 'opt-active' : ''}`}
              onClick={() => onChange(item.key, '0')}
            >
              {value === '0' && <IconCheck />} No hay
            </button>
          </div>
        )
      }
    </div>
  )
}

/* ─── Subtype Modal (infraestructura) ──────────────────── */
function SubtypeModal({ tipo, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className="modal-icon" style={{ color: tipo.color }}>{tipo.icon}</span>
            Tipo de {tipo.label}
          </div>
          <button className="modal-close" onClick={onCancel}><IconClose /></button>
        </div>
        <div className="subtype-list">
          {tipo.subtypes.map(st => (
            <button
              key={st.key}
              className="subtype-item"
              style={{ '--st-color': st.color }}
              onClick={() => onConfirm(st.key)}
            >
              <span className="subtype-pin" style={{ background: st.color }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="17" height="17"
                  dangerouslySetInnerHTML={{ __html: st.iconSvg }} />
              </span>
              <span className="subtype-item-label">{st.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Map helpers ───────────────────────────────────────── */
function MapClickCapture({ activeType, onPlace }) {
  const typeRef  = useRef(activeType)
  const placeRef = useRef(onPlace)
  typeRef.current  = activeType
  placeRef.current = onPlace

  useMapEvents({
    click(e) {
      placeRef.current({ id: Date.now(), lat: e.latlng.lat, lng: e.latlng.lng, type: typeRef.current })
    },
  })
  return null
}

function FlyTo({ center }) {
  const map = useMap()
  useEffect(() => { map.setView(center, 17) }, [center, map])
  return null
}

const IXMIQUILPAN = [20.4878, -99.1533]

// Icono de referencia (ya capturado por otro)
function makeRefIcon(type) {
  const color = type === 'luminaria' ? '#f59e0b' : type === 'alcantarilla' ? '#2563eb' : '#dc2626'
  return L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};opacity:0.5;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}

/* ─── Mapa Infraestructura Card ─────────────────────────── */
function MapaInfraestructura({ markers, onChange, blocked, refMarkers = [] }) {
  const [activeType, setActiveType] = useState('luminaria')
  const [flyTarget, setFlyTarget]   = useState(null)
  const [locating, setLocating]     = useState(false)
  const [locError, setLocError]     = useState(false)

  const handleLocate = () => {
    if (!navigator.geolocation) { setLocError(true); return }
    setLocating(true)
    setLocError(false)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setFlyTarget([pos.coords.latitude, pos.coords.longitude])
        setLocating(false)
      },
      () => {
        setLocating(false)
        setLocError(true)
        setTimeout(() => setLocError(false), 3000)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const [pendingMarker, setPendingMarker] = useState(null)

  const handleMapClick = useCallback((m) => {
    const tipo = INFRA_TIPOS.find(t => t.key === m.type)
    if (tipo?.subtypes?.length) {
      setPendingMarker(m)
    } else {
      onChange(prev => [...prev, m])
    }
  }, [onChange])

  const confirmSubtype = (subtypeKey) => {
    if (pendingMarker) {
      onChange(prev => [...prev, { ...pendingMarker, subtype: subtypeKey }])
      setPendingMarker(null)
    }
  }

  const removeMarker = (id) => onChange(prev => prev.filter(m => m.id !== id))

  const activeTipo = INFRA_TIPOS.find(t => t.key === activeType)

  const counts = INFRA_TIPOS.map(t => ({
    ...t,
    count: markers.filter(m => m.type === t.key).length,
  }))

  return (
    <div className={`mapa-card ${blocked ? 'card-blocked' : ''}`}>
      {pendingMarker && (
        <SubtypeModal
          tipo={INFRA_TIPOS.find(t => t.key === pendingMarker.type)}
          onConfirm={confirmSubtype}
          onCancel={() => setPendingMarker(null)}
        />
      )}
      {/* Header */}
      <div className="mapa-card-head">
        <span className="mapa-card-icon"><IconLayers /></span>
        <div>
          <h2>Infraestructura en Mapa</h2>
          <p>{blocked ? 'Completa el formulario para acceder al mapa' : 'Toca el mapa para agregar elementos. Selecciona el tipo con los botones.'}</p>
          {!blocked && refMarkers.length > 0 && (
            <p className="mapa-ref-note">
              <span className="mapa-ref-dot" /> {refMarkers.length} punto{refMarkers.length !== 1 ? 's' : ''} ya registrado{refMarkers.length !== 1 ? 's' : ''} visibles como referencia
            </p>
          )}
        </div>
        {blocked && <span className="card-lock-icon"><IconLock /></span>}
      </div>

      {blocked && (
        <div className="mapa-blocked-overlay">
          <IconLock />
          <span>Completa las secciones anteriores para habilitar el mapa</span>
        </div>
      )}

      {!blocked && (<>

      {/* Type selector buttons */}
      <div className="mapa-tipos">
        {INFRA_TIPOS.map(t => (
          <button
            key={t.key}
            type="button"
            className={`mapa-tipo-btn ${activeType === t.key ? 'mapa-tipo-active' : ''}`}
            style={activeType === t.key ? { background: t.bg, borderColor: t.border, color: t.color } : {}}
            onClick={() => setActiveType(t.key)}
          >
            <span className="mapa-tipo-icon">{t.icon}</span>
            <span className="mapa-tipo-label">{t.label}</span>
            {markers.filter(m => m.type === t.key).length > 0 && (
              <span
                className="mapa-tipo-count"
                style={{ background: t.color }}
              >
                {markers.filter(m => m.type === t.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cursor hint */}
      <div className="mapa-hint">
        <span className="mapa-hint-dot" style={{ background: activeTipo?.color }} />
        Toca el mapa para colocar <strong>{activeTipo?.label}</strong>
      </div>

      {/* Map */}
      <div className="mapa-wrap">
        <MapContainer
          center={IXMIQUILPAN}
          zoom={15}
          className="mapa-leaflet"
        >
          {flyTarget && <FlyTo center={flyTarget} />}
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapClickCapture activeType={activeType} onPlace={handleMapClick} />
          {/* Puntos ya registrados (referencia) */}
          {refMarkers.map((m, i) => (
            <Marker key={`ref-${i}`} position={[m.lat, m.lng]} icon={makeRefIcon(m.type)}>
              <Popup>
                <div className="mapa-popup">
                  <strong style={{ color: '#737373' }}>Manzana {m.manzana}</strong>
                  <span style={{ color: '#a3a3a3', fontSize: '11px' }}>{m.type}{m.subtype ? ` · ${m.subtype}` : ''}</span>
                  <span className="mapa-popup-coord"><b>UTM:</b> {toUTM(m.lat, m.lng).label}</span>
                </div>
              </Popup>
            </Marker>
          ))}
          {markers.map(m => {
            const tipo = INFRA_TIPOS.find(t => t.key === m.type)
            return (
              <Marker
                key={m.id}
                position={[m.lat, m.lng]}
                icon={INFRA_ICONS[m.subtype ? `${m.type}_${m.subtype}` : m.type] ?? makeMarkerIcon('#666', '<circle cx="12" cy="12" r="5"/>')}
              >
                <Popup>
                  <div className="mapa-popup">
                    <strong>{tipo?.label}</strong>
                    {m.subtype && tipo?.subtypes && (() => {
                      const st = tipo.subtypes.find(s => s.key === m.subtype)
                      return st ? <span style={{ fontWeight: 600, color: st.color }}>{st.label}</span> : null
                    })()}
                    <span className="mapa-popup-coord">
                      <b>Geo:</b> {m.lat.toFixed(6)}, {m.lng.toFixed(6)}
                    </span>
                    <span className="mapa-popup-coord">
                      <b>UTM:</b> {toUTM(m.lat, m.lng).label}
                    </span>
                    <button
                      className="mapa-popup-del"
                      onClick={() => removeMarker(m.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
        <button
          type="button"
          className={`mapa-locate-btn${locating ? ' mapa-locate-loading' : ''}${locError ? ' mapa-locate-error' : ''}`}
          onClick={handleLocate}
          disabled={locating}
          title="Centrar en mi ubicación"
        >
          <IconLocate />
          {locating ? 'Buscando…' : locError ? 'Sin GPS' : 'Mi ubicación'}
        </button>
      </div>

      {/* Marker count summary */}
      <div className="mapa-resumen">
        {counts.map(t => (
          <div key={t.key} className="mapa-resumen-item" style={{ borderColor: t.border, background: t.bg }}>
            <span className="mapa-resumen-icon" style={{ color: t.color }}>{t.icon}</span>
            <span className="mapa-resumen-label">{t.label}</span>
            <span className="mapa-resumen-count" style={{ background: t.color }}>{t.count}</span>
          </div>
        ))}
      </div>

      {/* Marker list */}
      {markers.length > 0 && (
        <div className="mapa-lista">
          <div className="mapa-lista-head">
            <IconPin /> {markers.length} elemento{markers.length !== 1 ? 's' : ''} registrado{markers.length !== 1 ? 's' : ''}
          </div>
          <div className="mapa-lista-items">
            {markers.map((m, i) => {
              const tipo = INFRA_TIPOS.find(t => t.key === m.type)
              const subtipo = m.subtype ? tipo?.subtypes?.find(s => s.key === m.subtype) : null
              const badgeColor = subtipo?.color ?? tipo?.color ?? '#666'
              const badgeSymbol = subtipo?.symbol ?? tipo?.symbol ?? '?'
              return (
                <div key={m.id} className="mapa-lista-item">
                  <span
                    className="mapa-lista-badge"
                    style={{ background: badgeColor }}
                  >
                    {badgeSymbol}
                  </span>
                  <div className="mapa-lista-info">
                    <span className="mapa-lista-tipo">{tipo?.label}</span>
                    {subtipo && (
                      <span className="mapa-lista-subtype" style={{ color: subtipo.color }}>
                        {subtipo.label}
                      </span>
                    )}
                    <span className="mapa-lista-coords">
                      UTM {toUTM(m.lat, m.lng).label}
                    </span>
                    <span className="mapa-lista-coords" style={{ opacity: 0.5 }}>
                      {m.lat.toFixed(6)}, {m.lng.toFixed(6)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mapa-lista-del"
                    onClick={() => removeMarker(m.id)}
                    title="Eliminar"
                  >
                    <IconTrash2 />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}

/* ─── Main ──────────────────────────────────────────────── */
export default function FormCatastro({ onAdminClick, isAdmin = false }) {
  const [manzana, setManzana]           = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [tipoVialidad, setTipoVialidad] = useState('')
  const [nombreVialidad, setNombreVialidad] = useState('')
  const [servicios, setServicios]       = useState(
    Object.fromEntries(SERVICIOS_LIST.map(s => [s.key, '']))
  )
  const [tipoPavimento, setTipoPavimento] = useState('')
  const [equipamiento, setEquipamiento] = useState(
    Object.fromEntries(EQUIPAMIENTO_LIST.map(e => [e.key, '']))
  )
  const [infraMarkers, setInfraMarkers]  = useState([])
  const [observaciones, setObservaciones] = useState('')
  const [toast, setToast]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [isOnline, setIsOnline]           = useState(navigator.onLine)
  const [pendingCount, setPendingCount]   = useState(queueSize)
  const [conflicts, setConflicts]         = useState(() => getConflicts())
  const [installPrompt, setInstallPrompt] = useState(null)
  const [refMarkers, setRefMarkers]     = useState([])
  // Cache stores { manzana, data } so manzanaDup and checkingManzana are fully derived —
  // no synchronous setState needed in effects.
  const [manzanaDupCache, setManzanaDupCache] = useState(null)
  const manzanaDup = manzanaDupCache?.manzana === manzana ? manzanaDupCache.data : null
  const checkingManzana = Boolean(manzana && isConfigured && supabase && manzanaDupCache?.manzana !== manzana)

  const seccion1Completa   = manzana !== '' && tipoVialidad !== '' && nombreVialidad.trim() !== ''
  const serviciosCompletos = SERVICIOS_LIST.every(s => servicios[s.key] !== '')
  const equipamientoCompleto = EQUIPAMIENTO_LIST.every(e => equipamiento[e.key] !== '')

  const serviciosUnlocked = useMemo(() => {
    let c = 1
    for (let i = 0; i < SERVICIOS_LIST.length - 1; i++) {
      if (servicios[SERVICIOS_LIST[i].key] !== '') c++; else break
    }
    return c
  }, [servicios])

  const equipamientoUnlocked = useMemo(() => {
    let c = 1
    for (let i = 0; i < EQUIPAMIENTO_LIST.length - 1; i++) {
      if (equipamiento[EQUIPAMIENTO_LIST[i].key] !== '') c++; else break
    }
    return c
  }, [equipamiento])

  const subtotalServicios = useMemo(() =>
    SERVICIOS_LIST.reduce((s, item) => {
      const v = servicios[item.key]
      return v ? s + (OPCIONES_SERVICIO.find(o => o.val === v)?.peso ?? 0) : s
    }, 0), [servicios])

  const subtotalEquipamiento = useMemo(() =>
    EQUIPAMIENTO_LIST.reduce((s, item) => {
      const v = equipamiento[item.key]
      return v !== '' ? s + Number(v) : s
    }, 0), [equipamiento])

  const total = subtotalServicios + subtotalEquipamiento

  const completedFields =
    (manzana ? 1 : 0) + (tipoVialidad ? 1 : 0) + (nombreVialidad.trim() ? 1 : 0) +
    SERVICIOS_LIST.filter(s => servicios[s.key] !== '').length +
    EQUIPAMIENTO_LIST.filter(e => equipamiento[e.key] !== '').length
  const progressPct = Math.round((completedFields / TOTAL_FIELDS) * 100)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  useEffect(() => {
    if (!manzana || !isConfigured || !supabase) return
    let cancelled = false
    supabase
      .from('registros')
      .select('tipo_vialidad, nombre_vialidad')
      .eq('manzana', manzana)
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return
        setManzanaDupCache({ manzana, data: data?.length ? data[0] : null })
      })
    return () => { cancelled = true }
  }, [manzana])

  const prevS1 = useRef(false)
  const prevS2 = useRef(false)
  useEffect(() => { if (!prevS1.current && seccion1Completa)   { showToast('Seccion 1 completa') } prevS1.current = seccion1Completa }, [seccion1Completa])
  useEffect(() => { if (!prevS2.current && serviciosCompletos) { showToast('Servicios completados') } prevS2.current = serviciosCompletos }, [serviciosCompletos])

  // Cargar puntos ya registrados como referencia en el mapa
  useEffect(() => {
    if (!isConfigured || !supabase) return
    supabase.from('registros').select('manzana, infra_mapa').then(({ data }) => {
      if (!data) return
      const all = []
      data.forEach(r => {
        if (Array.isArray(r.infra_mapa)) {
          r.infra_mapa.forEach(m => all.push({ ...m, manzana: r.manzana }))
        }
      })
      setRefMarkers(all)
    })
  }, [])

  // Online / offline detection
  useEffect(() => {
    const goOnline  = () => { setIsOnline(true);  syncOfflineQueue() }
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function syncOfflineQueue() {
    if (!isConfigured || !supabase) return
    const queue = getQueue()
    if (!queue.length) return
    let synced = 0
    let newConflicts = 0
    for (const item of queue) {
      const { _qid, _at, ...record } = item
      const { error } = await supabase.from('registros').insert([record])
      if (!error) {
        dequeue(_qid)
        synced++
      } else if (error.code === '23505') {
        // Violación UNIQUE — manzana ya registrada por otro capturista
        dequeue(_qid)
        addConflict({ ...record, _qid, _at })
        newConflicts++
      }
      // Otros errores (red, servidor) → dejar en cola para reintentar
    }
    const updatedConflicts = getConflicts()
    setConflicts(updatedConflicts)
    setPendingCount(queueSize())
    if (synced > 0 && newConflicts === 0) {
      showToast(`${synced} registro${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''} ✓`)
    } else if (synced > 0 && newConflicts > 0) {
      showToast(`${synced} sincronizado${synced > 1 ? 's' : ''} — ${newConflicts} conflicto${newConflicts > 1 ? 's' : ''} ⚠`)
    } else if (newConflicts > 0) {
      showToast(`${newConflicts} manzana${newConflicts > 1 ? 's' : ''} ya registrada${newConflicts > 1 ? 's' : ''} por otro capturista ⚠`)
    }
  }

  const handleReset = () => {
    setManzana(''); setTipoVialidad(''); setNombreVialidad('')
    setServicios(Object.fromEntries(SERVICIOS_LIST.map(s => [s.key, ''])))
    setTipoPavimento('')
    setEquipamiento(Object.fromEntries(EQUIPAMIENTO_LIST.map(e => [e.key, ''])))
    setInfraMarkers([])
    setObservaciones('')
    setToast(''); setSaving(false); setManzanaDupCache(null)
  }

  const handleSubmit = async () => {
    const record = {
      manzana,
      tipo_vialidad:         tipoVialidad,
      nombre_vialidad:       nombreVialidad,
      servicios,
      tipo_pavimento:        tipoPavimento || null,
      equipamiento,
      infra_mapa:            infraMarkers,
      subtotal_servicios:    subtotalServicios,
      subtotal_equipamiento: subtotalEquipamiento,
      total,
      observaciones:         observaciones.trim() || null,
    }

    if (isConfigured && supabase) {
      if (!navigator.onLine) {
        enqueue(record)
        setPendingCount(queueSize())
        handleReset()
        showToast('Sin internet — guardado en cola, se enviará al reconectarse')
        return
      }
      setSaving(true)
      const { error } = await supabase.from('registros').insert([record])
      setSaving(false)
      if (error) {
        enqueue(record)
        setPendingCount(queueSize())
        handleReset()
        showToast('Error de red — guardado en cola offline')
        return
      }
    }
    handleReset()
    showToast('Registro guardado correctamente ✓')
  }

  /* ── Form ── */
  return (
    <div className="fc-page">
      {showModal && (
        <ManzanaModal
          current={manzana}
          onConfirm={v => { setManzana(v); setShowModal(false) }}
          onClose={() => setShowModal(false)}
        />
      )}

      {toast && <div className="fc-toast">{toast}</div>}

      {/* Offline banner */}
      {!isOnline && (
        <div className="offline-banner">
          <span className="offline-dot" /> Sin internet — los registros se guardarán localmente
        </div>
      )}

      {/* Pending sync banner */}
      {isOnline && pendingCount > 0 && (
        <div className="sync-banner">
          <span>⟳ {pendingCount} registro{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''} de sincronizar</span>
          <button className="sync-now-btn" onClick={syncOfflineQueue}>Sincronizar ahora</button>
        </div>
      )}

      {/* Conflictos banner */}
      {conflicts.length > 0 && (
        <div className="conflict-banner">
          <div className="conflict-banner-content">
            <span className="conflict-icon">⚠</span>
            <div className="conflict-text">
              <strong>{conflicts.length} manzana{conflicts.length > 1 ? 's' : ''} con conflicto</strong>
              <span>
                {conflicts.map(c => `Mz ${c.manzana}`).join(', ')} — ya {conflicts.length > 1 ? 'fueron registradas' : 'fue registrada'} por otro capturista. Avisa al administrador.
              </span>
            </div>
          </div>
          <button className="conflict-dismiss" onClick={() => { clearConflicts(); setConflicts([]) }} title="Descartar">✕</button>
        </div>
      )}

      {/* Install PWA banner */}
      {installPrompt && (
        <div className="install-banner">
          <span>📲 Instala la app para usarla sin internet</span>
          <button className="install-btn" onClick={async () => {
            installPrompt.prompt()
            const { outcome } = await installPrompt.userChoice
            if (outcome === 'accepted') setInstallPrompt(null)
          }}>Instalar</button>
          <button className="install-dismiss" onClick={() => setInstallPrompt(null)}>✕</button>
        </div>
      )}

      <div className="fc-topbar">
        <div className="fc-topbar-inner">
          <div className="fc-topbar-brand">
            <IconAppLogo size={26} />
            <span>Catastro</span>
          </div>
          <div className="fc-topbar-progress">
            <div className="fc-topbar-track">
              <div className="fc-topbar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span>{progressPct}%</span>
          </div>
          <div className="fc-topbar-right">
            {!isOnline && <span className="topbar-offline-badge">Offline</span>}
            {isOnline && pendingCount > 0 && <span className="topbar-pending-badge">{pendingCount}</span>}
            <button className="fc-admin-btn" onClick={onAdminClick}>Admin</button>
          </div>
        </div>
      </div>

      <div className="fc-form">
        {/* Hero */}
        <div className="fc-hero">
          <div className="fc-hero-brand">
            <IconAppLogo size={48} />
            <div>
              <h1>Catastro</h1>
              <p>Captura de Servicios e Infraestructura</p>
            </div>
          </div>
          <div className="fc-steps">
            {[
              { label: 'Identificación', done: seccion1Completa, active: !seccion1Completa },
              { label: 'Servicios',      done: serviciosCompletos, active: seccion1Completa && !serviciosCompletos },
              { label: 'Equipamiento',   done: equipamientoCompleto, active: serviciosCompletos && !equipamientoCompleto },
            ].map((step, i) => (
              <span key={i} className={`fc-step ${step.done ? 'step-done' : step.active ? 'step-active' : ''}`}>
                <span className="step-num">{step.done ? <IconCheck /> : i + 1}</span>
                {step.label}
                {i < 2 && <span className="step-sep" />}
              </span>
            ))}
          </div>
        </div>

        {/* ══ Card 1 ══ */}
        <div className={`fc-card ${seccion1Completa ? 'card-done' : ''}`}>
          <div className="card-head">
            <span className="card-num">{seccion1Completa ? <IconCheck /> : '1'}</span>
            <div>
              <h2>Identificación</h2>
              <p>Localización de la manzana</p>
            </div>
          </div>
          <div className="card-body">

            {/* Manzana */}
            <div className="fc-field">
              <label><span className="field-icon"><IconHash /></span> Manzana</label>
              <button
                type="button"
                className={`manzana-trigger ${manzana ? 'has-value' : ''} ${manzanaDup ? 'manzana-trigger-dup' : ''}`}
                onClick={() => setShowModal(true)}
              >
                <span className="manzana-icon"><IconMap /></span>
                {manzana
                  ? <><span className="manzana-val">{manzana}</span><span className="manzana-edit">Cambiar</span></>
                  : <span className="manzana-placeholder">Seleccionar número de manzana</span>
                }
              </button>
              {checkingManzana && (
                <div className="manzana-hint manzana-hint-checking">Verificando disponibilidad…</div>
              )}
              {!checkingManzana && manzanaDup && (
                <div className="manzana-hint manzana-hint-dup">
                  ⚠ La manzana {manzana} ya tiene un registro — {manzanaDup.tipo_vialidad} {manzanaDup.nombre_vialidad}
                </div>
              )}
            </div>

            {/* Tipo Vialidad */}
            <div className="fc-field">
              <label><span className="field-icon"><IconRoadType /></span> Tipo de Vialidad</label>
              <div className="vial-grid">
                {TIPOS_VIALIDAD.map(t => (
                  <button
                    key={t.code}
                    type="button"
                    className={`vial-btn ${tipoVialidad === t.code ? 'active' : ''}`}
                    onClick={() => setTipoVialidad(t.code)}
                  >
                    <span className="vial-code">{t.code}</span>
                    <span className="vial-name">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Nombre Vialidad */}
            <div className="fc-field">
              <label><span className="field-icon"><IconMap /></span> Nombre de la Vialidad</label>
              <div className="input-wrap">
                <input
                  type="text"
                  className="fc-input"
                  value={nombreVialidad}
                  onChange={e => setNombreVialidad(e.target.value)}
                  placeholder="Ej. Miguel Hidalgo, López Mateos…"
                />
                {nombreVialidad.trim() && <span className="input-ok"><IconCheck /></span>}
              </div>
            </div>
          </div>
        </div>

        {/* ══ Card 2 ══ */}
        <div className={`fc-card ${!seccion1Completa ? 'card-blocked' : ''} ${serviciosCompletos ? 'card-done' : ''}`}>
          <div className="card-head">
            <span className="card-num" style={!seccion1Completa ? { background: '#e5e5e5', color: '#a3a3a3' } : {}}>
              {serviciosCompletos ? <IconCheck /> : '2'}
            </span>
            <div>
              <h2>Servicios e Infraestructura</h2>
              <p>{seccion1Completa ? 'Evalúa la calidad de cada servicio' : 'Completa la sección 1 para continuar'}</p>
            </div>
            {!seccion1Completa && <span className="card-lock-icon"><IconLock /></span>}
          </div>

          {seccion1Completa && (
            <div className="card-body">
              <div className="legend-row">
                {OPCIONES_SERVICIO.map(o => (
                  <span key={o.val} className={`legend-pill lp-${o.color}`}>{o.label}</span>
                ))}
              </div>

              <div className="fc-rows">
                {SERVICIOS_LIST.map((item, idx) => {
                  const locked = idx >= serviciosUnlocked
                  return (
                    <ServiceRow
                      key={item.key}
                      item={item}
                      value={servicios[item.key]}
                      locked={locked}
                      isNext={idx === serviciosUnlocked}
                      onChange={(k, v) => setServicios(p => ({ ...p, [k]: v }))}
                    >
                      {item.hasTipo && servicios[item.key] && servicios[item.key] !== 'N' && (
                        <div className="pav-subfield">
                          <span className="pav-label">Tipo de pavimento</span>
                          <div className="pav-grid">
                            {TIPOS_PAVIMENTO.map(tp => (
                              <button
                                key={tp.code}
                                type="button"
                                className={`pav-btn ${tipoPavimento === tp.code ? 'active' : ''}`}
                                onClick={() => setTipoPavimento(tp.code)}
                              >
                                <b>{tp.code}</b><span>{tp.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </ServiceRow>
                  )
                })}
              </div>

              {/* Equipamiento subsection */}
              <div className={`equip-section ${!serviciosCompletos ? 'equip-locked' : ''}`}>
                <div className="equip-head">
                  <h3>Equipamiento Urbano</h3>
                  {!serviciosCompletos
                    ? <span className="equip-lock-note"><IconLock /> Completa los servicios primero</span>
                    : <span className="equip-ready-note">Indica la presencia de cada equipamiento</span>
                  }
                </div>

                {serviciosCompletos && (
                  <>
                    <div className="legend-row">
                      <span className="legend-pill lp-green">Sí hay</span>
                      <span className="legend-pill lp-muted">No hay</span>
                    </div>
                    <div className="fc-rows">
                      {EQUIPAMIENTO_LIST.map((item, idx) => (
                        <EquipRow
                          key={item.key}
                          item={item}
                          value={equipamiento[item.key]}
                          locked={idx >= equipamientoUnlocked}
                          isNext={idx === equipamientoUnlocked}
                          onChange={(k, v) => setEquipamiento(p => ({ ...p, [k]: v }))}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ══ Card 3 — Mapa de Infraestructura ══ */}
        <MapaInfraestructura
          markers={infraMarkers}
          onChange={setInfraMarkers}
          blocked={!equipamientoCompleto}
          refMarkers={refMarkers}
        />

        {/* Live score - Solo visible para admin */}
        {isAdmin && seccion1Completa && (
          <div className="score-panel">
            <p className="score-panel-label">Puntaje parcial</p>
            <div className="score-panel-grid">
              <div>
                <span>Servicios respondidos</span>
                <b>{SERVICIOS_LIST.filter(s => servicios[s.key]).length} / {SERVICIOS_LIST.length}</b>
              </div>
              <div>
                <span>Equipamiento respondido</span>
                <b>{EQUIPAMIENTO_LIST.filter(e => equipamiento[e.key] !== '').length} / {EQUIPAMIENTO_LIST.length}</b>
              </div>
              <div className="score-panel-sub">
                <span>Subtotal servicios</span>
                <b>{subtotalServicios.toFixed(2)}</b>
              </div>
              <div className="score-panel-sub">
                <span>Subtotal equipamiento</span>
                <b>{subtotalEquipamiento}</b>
              </div>
            </div>
          </div>
        )}

        {equipamientoCompleto && (
          <>
            {/* ══ Card 4 — Observaciones ══ */}
            <div className="obs-card">
              <div className="obs-card-head">
                <span className="obs-card-num">4</span>
                <div>
                  <h2>Observaciones</h2>
                  <p>Notas adicionales sobre la manzana (opcional)</p>
                </div>
              </div>
              <div className="obs-card-body">
                <textarea
                  className="obs-textarea"
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  placeholder="Escribe aquí cualquier observación relevante sobre la manzana, sus calles o condiciones especiales…"
                  rows={4}
                />
                {observaciones.trim() && (
                  <div className="obs-char-count">{observaciones.trim().length} caracteres</div>
                )}
              </div>
            </div>

            {manzanaDup && (
              <div className="fc-dup-error">
                ⚠ La manzana {manzana} ya está registrada ({manzanaDup.tipo_vialidad} {manzanaDup.nombre_vialidad}).
                Cambia el número de manzana para poder guardar.
              </div>
            )}
            <button
              className="btn-submit"
              onClick={handleSubmit}
              disabled={saving || Boolean(manzanaDup) || checkingManzana}
            >
              {saving ? 'Guardando…' : 'Guardar registro'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
