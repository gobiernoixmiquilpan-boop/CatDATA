import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, AreaChart, Area,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { supabase, isConfigured } from '../lib/supabase'
import { toUTM } from '../utils/utm'
import './AdminDashboard.css'

const PIN_COLORS = { luminaria: '#f59e0b', alcantarilla: '#2563eb', inmueble: '#dc2626' }
const PAGE_SIZE  = 20

function makePinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  })
}

const SERVICIOS_LIST = [
  { key: 'aguaPotable',       label: 'Agua Potable' },
  { key: 'drenaje',           label: 'Drenaje' },
  { key: 'alcantarillado',    label: 'Alcantarillado' },
  { key: 'electrificacion',   label: 'Electrificación' },
  { key: 'guarniciones',      label: 'Guarniciones' },
  { key: 'banquetas',         label: 'Banquetas' },
  { key: 'pavimento',         label: 'Pavimento' },
  { key: 'recoleccionBasura', label: 'Basura' },
]
const SERVICIOS_FULL = [
  { key: 'aguaPotable',       label: 'Agua Potable' },
  { key: 'drenaje',           label: 'Drenaje' },
  { key: 'alcantarillado',    label: 'Alcantarillado' },
  { key: 'electrificacion',   label: 'Electrificación' },
  { key: 'guarniciones',      label: 'Guarniciones' },
  { key: 'banquetas',         label: 'Banquetas' },
  { key: 'pavimento',         label: 'Pavimento' },
  { key: 'recoleccionBasura', label: 'Recolección de Basura' },
]

const EQUIPAMIENTO_LIST = [
  { key: 'educacionCultura',  label: 'Educación' },
  { key: 'transportePublico', label: 'Transporte' },
  { key: 'comercioAbasto',    label: 'Comercio' },
  { key: 'recreacionDeporte', label: 'Deporte' },
  { key: 'saludAsistencia',   label: 'Salud' },
  { key: 'telefono',          label: 'Teléfono' },
  { key: 'correosYTelegrafo', label: 'Correos' },
  { key: 'contaminacion',     label: 'Contaminación' },
  { key: 'calleEspecial',     label: 'C. Especial' },
]
const EQUIPAMIENTO_FULL = [
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

const OPCIONES = [
  { val: 'B', label: 'Bueno',   color: '#15803d' },
  { val: 'R', label: 'Regular', color: '#b45309' },
  { val: 'M', label: 'Malo',    color: '#b91c1c' },
  { val: 'N', label: 'Ninguno', color: '#a3a3a3' },
]

const TIPOS_VIALIDAD = [
  { code: 'AVE', label: 'Avenida' }, { code: 'BLV', label: 'Boulevard' },
  { code: 'CAL', label: 'Calle' },   { code: 'CJN', label: 'Callejón' },
  { code: 'CDA', label: 'Cerrada' }, { code: 'CZA', label: 'Calzada' },
  { code: 'CAR', label: 'Carretera' },
]

const TIPO_LABELS = Object.fromEntries(TIPOS_VIALIDAD.map(t => [t.code, t.label]))

/* ── Stat card ── */
function StatCard({ value, label, sub, color }) {
  return (
    <div className="ad-card" style={color ? { borderTop: `3px solid ${color}` } : {}}>
      <div className="ad-card-val" style={color ? { color } : {}}>{value}</div>
      <div className="ad-card-lbl">{label}</div>
      {sub && <div className="ad-card-sub">{sub}</div>}
    </div>
  )
}

/* ── Export CSV ── */
function exportCSV(records) {
  const headers = [
    'Fecha', 'Manzana', 'Tipo Vialidad', 'Nombre Vialidad',
    ...SERVICIOS_FULL.map(s => `Serv_${s.label}`),
    ...EQUIPAMIENTO_FULL.map(e => `Equip_${e.label}`),
    'Subtotal Servicios', 'Subtotal Equipamiento', 'Total', 'Observaciones',
  ]
  const rows = records.map(r => [
    new Date(r.created_at).toLocaleDateString('es-MX'),
    r.manzana,
    TIPO_LABELS[r.tipo_vialidad] ?? r.tipo_vialidad,
    r.nombre_vialidad,
    ...SERVICIOS_FULL.map(s => r.servicios?.[s.key] ?? ''),
    ...EQUIPAMIENTO_FULL.map(e => r.equipamiento?.[e.key] === '1' ? 'Sí' : r.equipamiento?.[e.key] === '0' ? 'No' : ''),
    Number(r.subtotal_servicios).toFixed(4),
    r.subtotal_equipamiento,
    Number(r.total).toFixed(4),
    r.observaciones ?? '',
  ])
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: `catastro_${new Date().toISOString().slice(0,10)}.csv` }).click()
  URL.revokeObjectURL(url)
}

/* ── Export DXF (AutoCAD) ── */
function exportDXF(records) {
  const pts = []
  records.forEach(r => {
    if (!Array.isArray(r.infra_mapa)) return
    r.infra_mapa.forEach(m => {
      const utm = toUTM(m.lat, m.lng)
      pts.push({
        x:      utm.easting,
        y:      utm.northing,
        layer:  (m.type || 'INFRA').toUpperCase(),
        label:  `MZ${r.manzana}-${(m.type||'').toUpperCase()}${m.subtype ? '-' + m.subtype.toUpperCase() : ''}`,
      })
    })
  })

  if (!pts.length) { alert('No hay puntos de infraestructura para exportar'); return }

  const layers   = [...new Set(pts.map(p => p.layer))]
  const COLORS   = { LUMINARIA: 2, ALCANTARILLA: 5, INMUEBLE: 1 } // 2=amarillo 5=azul 1=rojo

  let d = ''
  // HEADER
  d += '0\nSECTION\n2\nHEADER\n'
  d += '9\n$ACADVER\n1\nAC1015\n'
  d += '9\n$INSUNITS\n70\n6\n'   // 6 = metros
  d += '9\n$PDMODE\n70\n35\n'    // estilo de punto visible (cruz + círculo)
  d += '9\n$PDSIZE\n40\n3.0\n'   // tamaño del punto
  d += '0\nENDSEC\n'

  // TABLES → capas
  d += '0\nSECTION\n2\nTABLES\n'
  d += `0\nTABLE\n2\nLAYER\n70\n${layers.length + 1}\n`
  d += '0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n'
  layers.forEach(l => {
    d += `0\nLAYER\n2\n${l}\n70\n0\n62\n${COLORS[l]||3}\n6\nCONTINUOUS\n`
  })
  d += '0\nENDTAB\n0\nENDSEC\n'

  // ENTITIES
  d += '0\nSECTION\n2\nENTITIES\n'
  pts.forEach(p => {
    // Punto
    d += `0\nPOINT\n8\n${p.layer}\n10\n${p.x.toFixed(3)}\n20\n${p.y.toFixed(3)}\n30\n0.0\n`
    // Etiqueta de texto
    d += `0\nTEXT\n8\n${p.layer}\n10\n${(p.x+1.5).toFixed(3)}\n20\n${(p.y+1.5).toFixed(3)}\n30\n0.0\n40\n2.5\n1\n${p.label}\n`
  })
  d += '0\nENDSEC\n0\nEOF\n'

  const blob = new Blob([d], { type: 'application/dxf' })
  const url  = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), {
    href: url,
    download: `catastro_${new Date().toISOString().slice(0,10)}.dxf`,
  }).click()
  URL.revokeObjectURL(url)
}

/* ── Export GeoJSON ── */
function exportGeoJSON(records) {
  const features = []
  records.forEach(r => {
    if (!Array.isArray(r.infra_mapa)) return
    r.infra_mapa.forEach(m => {
      const utm = toUTM(m.lat, m.lng)
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
        properties: {
          manzana:        r.manzana,
          tipo_vialidad:  TIPO_LABELS[r.tipo_vialidad] ?? r.tipo_vialidad,
          nombre_vialidad: r.nombre_vialidad,
          tipo:           m.type,
          subtipo:        m.subtype ?? null,
          utm_zona:       `${utm.zone}${utm.hemi}`,
          utm_este:       utm.easting,
          utm_norte:      utm.northing,
          latitud:        m.lat,
          longitud:       m.lng,
        },
      })
    })
  })
  const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: `catastro_infra_${new Date().toISOString().slice(0,10)}.geojson` }).click()
  URL.revokeObjectURL(url)
}

/* ── Print report ── */
function PrintReport({ record, onClose }) {
  const ref = useRef(null)
  const infraMarkers = Array.isArray(record.infra_mapa) ? record.infra_mapa : []

  useEffect(() => {
    const t = setTimeout(() => {
      window.print()
    }, 300)
    const handler = () => onClose()
    window.addEventListener('afterprint', handler)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', handler) }
  }, [])

  return (
    <div ref={ref} className="print-report">
      <div className="pr-header">
        <div className="pr-logo">CATASTRO IXMIQUILPAN</div>
        <div className="pr-title">Ficha de Registro — Manzana {record.manzana}</div>
        <div className="pr-sub">
          {TIPO_LABELS[record.tipo_vialidad] ?? record.tipo_vialidad} {record.nombre_vialidad} &nbsp;·&nbsp;
          {new Date(record.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}
        </div>
      </div>

      <div className="pr-scores">
        <div className="pr-score"><span>Subtotal Servicios</span><b>{Number(record.subtotal_servicios).toFixed(4)}</b></div>
        <div className="pr-score"><span>Subtotal Equipamiento</span><b>{record.subtotal_equipamiento}</b></div>
        <div className="pr-score pr-score-total"><span>TOTAL</span><b>{Number(record.total).toFixed(4)}</b></div>
      </div>

      <div className="pr-section-title">Servicios e Infraestructura</div>
      <table className="pr-table">
        <thead><tr><th>Servicio</th><th>Calidad</th></tr></thead>
        <tbody>
          {SERVICIOS_FULL.map(s => {
            const v = record.servicios?.[s.key]
            const o = OPCIONES.find(o => o.val === v)
            return <tr key={s.key}><td>{s.label}</td><td>{o?.label ?? '—'}</td></tr>
          })}
        </tbody>
      </table>

      <div className="pr-section-title" style={{ marginTop: '1rem' }}>Equipamiento Urbano</div>
      <table className="pr-table">
        <thead><tr><th>Equipamiento</th><th>Presencia</th></tr></thead>
        <tbody>
          {EQUIPAMIENTO_FULL.map(e => {
            const v = record.equipamiento?.[e.key]
            return <tr key={e.key}><td>{e.label}</td><td>{v === '1' ? 'Sí hay' : v === '0' ? 'No hay' : '—'}</td></tr>
          })}
        </tbody>
      </table>

      {infraMarkers.length > 0 && (
        <>
          <div className="pr-section-title" style={{ marginTop: '1rem' }}>
            Infraestructura registrada ({infraMarkers.length} puntos)
          </div>
          <table className="pr-table">
            <thead><tr><th>#</th><th>Tipo</th><th>Subtipo</th><th>UTM Zona</th><th>Este (m)</th><th>Norte (m)</th><th>Latitud</th><th>Longitud</th></tr></thead>
            <tbody>
              {infraMarkers.map((m, i) => {
                const utm = toUTM(m.lat, m.lng)
                return (
                  <tr key={i}>
                    <td>{i+1}</td>
                    <td style={{ textTransform:'capitalize' }}>{m.type}</td>
                    <td>{m.subtype ?? '—'}</td>
                    <td>{utm.zone}{utm.hemi}</td>
                    <td>{utm.easting.toLocaleString()}</td>
                    <td>{utm.northing.toLocaleString()}</td>
                    <td>{m.lat.toFixed(6)}</td>
                    <td>{m.lng.toFixed(6)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {record.observaciones && (
        <>
          <div className="pr-section-title" style={{ marginTop: '1rem' }}>Observaciones</div>
          <p className="pr-obs">{record.observaciones}</p>
        </>
      )}

      <div className="pr-footer">
        Generado el {new Date().toLocaleString('es-MX')} &nbsp;·&nbsp; Sistema de Catastro Ixmiquilpan
      </div>

      <button className="pr-close-btn no-print" onClick={onClose}>✕ Cerrar vista de impresión</button>
    </div>
  )
}

/* ── Edit Modal ── */
function EditModal({ record, onSave, onClose }) {
  const [form, setForm] = useState({
    manzana:        record.manzana,
    tipo_vialidad:  record.tipo_vialidad,
    nombre_vialidad: record.nombre_vialidad,
    tipo_pavimento: record.tipo_pavimento ?? '',
    observaciones:  record.observaciones ?? '',
    servicios:      { ...record.servicios },
    equipamiento:   { ...record.equipamiento },
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleSave() {
    setSaving(true)
    await onSave(record.id, form)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-modal" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <div><h2>Editar Manzana {record.manzana}</h2></div>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>
        <div className="edit-body">

          {/* Identificación */}
          <h3 className="detail-sect">Identificación</h3>
          <div className="edit-row">
            <div className="edit-field">
              <label>Manzana</label>
              <input value={form.manzana} onChange={e => set('manzana', e.target.value)} />
            </div>
            <div className="edit-field">
              <label>Nombre de Vialidad</label>
              <input value={form.nombre_vialidad} onChange={e => set('nombre_vialidad', e.target.value)} />
            </div>
          </div>
          <div className="edit-field" style={{ marginTop: '.75rem' }}>
            <label>Tipo de Vialidad</label>
            <div className="edit-vial-grid">
              {TIPOS_VIALIDAD.map(t => (
                <button
                  key={t.code}
                  type="button"
                  className={`edit-vial-btn ${form.tipo_vialidad === t.code ? 'evb-active' : ''}`}
                  onClick={() => set('tipo_vialidad', t.code)}
                >
                  <b>{t.code}</b> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Servicios */}
          <h3 className="detail-sect" style={{ marginTop: '1rem' }}>Servicios</h3>
          <div className="edit-servicios">
            {SERVICIOS_FULL.map(s => (
              <div key={s.key} className="edit-serv-row">
                <span className="edit-serv-label">{s.label}</span>
                <div className="edit-serv-opts">
                  {OPCIONES.map(o => (
                    <button
                      key={o.val}
                      type="button"
                      className={`edit-serv-btn ${form.servicios[s.key] === o.val ? 'esb-active' : ''}`}
                      style={form.servicios[s.key] === o.val ? { background: o.color, color: '#fff', borderColor: o.color } : {}}
                      onClick={() => setForm(p => ({ ...p, servicios: { ...p.servicios, [s.key]: o.val } }))}
                    >
                      {o.label[0]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Equipamiento */}
          <h3 className="detail-sect" style={{ marginTop: '1rem' }}>Equipamiento</h3>
          <div className="edit-servicios">
            {EQUIPAMIENTO_FULL.map(e => (
              <div key={e.key} className="edit-serv-row">
                <span className="edit-serv-label">{e.label}</span>
                <div className="edit-serv-opts">
                  {[{val:'1',label:'Sí',color:'#15803d'},{val:'0',label:'No',color:'#a3a3a3'}].map(o => (
                    <button
                      key={o.val}
                      type="button"
                      className={`edit-serv-btn ${form.equipamiento[e.key] === o.val ? 'esb-active' : ''}`}
                      style={form.equipamiento[e.key] === o.val ? { background: o.color, color: '#fff', borderColor: o.color } : {}}
                      onClick={() => setForm(p => ({ ...p, equipamiento: { ...p.equipamiento, [e.key]: o.val } }))}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Observaciones */}
          <h3 className="detail-sect" style={{ marginTop: '1rem' }}>Observaciones</h3>
          <textarea
            className="edit-obs"
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            rows={3}
            placeholder="Notas adicionales…"
          />

          <div className="edit-footer">
            <button className="btn-cancel" onClick={onClose}>Cancelar</button>
            <button className="btn-save" disabled={saving} onClick={handleSave}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Detail Modal ── */
function DetailModal({ record, onClose, onEdit, onPrint }) {
  if (!record) return null
  const infraMarkers = Array.isArray(record.infra_mapa) ? record.infra_mapa : []
  const mapCenter = infraMarkers.length > 0
    ? [infraMarkers.reduce((s,m)=>s+m.lat,0)/infraMarkers.length, infraMarkers.reduce((s,m)=>s+m.lng,0)/infraMarkers.length]
    : [20.4878, -99.1533]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <div>
            <h2>Manzana {record.manzana}</h2>
            <span className="detail-sub">
              {TIPO_LABELS[record.tipo_vialidad] ?? record.tipo_vialidad} {record.nombre_vialidad} ·{' '}
              {new Date(record.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}
            </span>
          </div>
          <div className="detail-header-btns">
            <button className="btn-edit-detail" onClick={() => onEdit(record)} title="Editar">✏ Editar</button>
            <button className="btn-print-detail" onClick={() => onPrint(record)} title="Imprimir PDF">🖨 PDF</button>
            <button className="detail-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-scores">
            <div className="detail-score-item"><span>Servicios</span><b>{Number(record.subtotal_servicios).toFixed(2)}</b></div>
            <div className="detail-score-item"><span>Equipamiento</span><b>{record.subtotal_equipamiento}</b></div>
            <div className="detail-score-item total"><span>Total</span><b>{Number(record.total).toFixed(2)}</b></div>
          </div>

          <h3 className="detail-sect">Servicios</h3>
          <div className="detail-grid">
            {SERVICIOS_FULL.map(s => {
              const v = record.servicios?.[s.key]
              const o = OPCIONES.find(o => o.val === v)
              return (
                <div key={s.key} className="detail-item">
                  <span>{s.label}</span>
                  <span className="detail-badge" style={{ background: o?.color ?? '#e5e5e5' }}>{o?.label ?? '—'}</span>
                </div>
              )
            })}
          </div>

          <h3 className="detail-sect">Equipamiento</h3>
          <div className="detail-grid">
            {EQUIPAMIENTO_FULL.map(e => {
              const v = record.equipamiento?.[e.key]
              return (
                <div key={e.key} className="detail-item">
                  <span>{e.label}</span>
                  <span className="detail-badge" style={{ background: v==='1' ? '#15803d' : '#a3a3a3' }}>
                    {v==='1' ? 'Sí' : v==='0' ? 'No' : '—'}
                  </span>
                </div>
              )
            })}
          </div>

          {infraMarkers.length > 0 && (
            <>
              <h3 className="detail-sect">Infraestructura ({infraMarkers.length} punto{infraMarkers.length!==1?'s':''})</h3>
              <div className="detail-map-wrap">
                <MapContainer center={mapCenter} zoom={17} style={{ height:'260px', width:'100%' }} scrollWheelZoom={false}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                  {infraMarkers.map((m,i) => (
                    <Marker key={i} position={[m.lat,m.lng]} icon={makePinIcon(PIN_COLORS[m.type]??'#666')}>
                      <Popup>
                        <div style={{ fontSize:'12px', lineHeight:1.6 }}>
                          <b style={{ textTransform:'capitalize' }}>{m.type}{m.subtype ? ` · ${m.subtype}` : ''}</b><br/>
                          <span style={{ color:'#6366f1', fontFamily:'monospace' }}>UTM {toUTM(m.lat,m.lng).label}</span><br/>
                          <span style={{ color:'#888', fontFamily:'monospace', fontSize:'11px' }}>{m.lat.toFixed(6)}, {m.lng.toFixed(6)}</span>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              <div className="detail-infra-list">
                {infraMarkers.map((m,i) => {
                  const utm = toUTM(m.lat,m.lng)
                  return (
                    <div key={i} className="detail-infra-item">
                      <span className="detail-infra-type" style={{ textTransform:'capitalize' }}>{m.type}{m.subtype ? ` · ${m.subtype}` : ''}</span>
                      <span className="detail-infra-utm">UTM {utm.label}</span>
                      <span className="detail-infra-geo">{m.lat.toFixed(6)}, {m.lng.toFixed(6)}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {infraMarkers.length === 0 && (
            <div style={{ textAlign:'center', color:'#a3a3a3', padding:'1rem', fontSize:'.82rem' }}>
              Sin puntos de infraestructura en este registro.
            </div>
          )}

          {record.observaciones && (
            <>
              <h3 className="detail-sect">Observaciones</h3>
              <p className="detail-obs">{record.observaciones}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════ */
export default function AdminDashboard({ session, onLogout, onBack }) {
  const [tab, setTab]         = useState('stats')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [detail, setDetail]   = useState(null)
  const [editing, setEditing] = useState(null)
  const [printing, setPrinting] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [mapFilter, setMapFilter] = useState('all')

  // Records search / filter / pagination
  const [search, setSearch]     = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [page, setPage]         = useState(1)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (!isConfigured || !supabase) return
    const channel = supabase.channel('registros-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registros' },
        payload => setRecords(prev => [payload.new, ...prev]))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // Reset page when search/date changes
  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo])

  async function loadData() {
    setLoading(true); setError('')
    if (!isConfigured) {
      setRecords([
        { id:1, manzana:'42', tipo_vialidad:'CAL', nombre_vialidad:'Principal', subtotal_servicios:4.68, subtotal_equipamiento:6, total:10.68, created_at: new Date().toISOString(),
          servicios:{ aguaPotable:'B', drenaje:'B', alcantarillado:'R', electrificacion:'B', guarniciones:'B', banquetas:'B', pavimento:'B', recoleccionBasura:'N' },
          equipamiento:{ educacionCultura:'1', transportePublico:'1', comercioAbasto:'1', recreacionDeporte:'0', saludAsistencia:'1', telefono:'1', correosYTelegrafo:'0', contaminacion:'0', calleEspecial:'0' }, infra_mapa:[] },
        { id:2, manzana:'15', tipo_vialidad:'AVE', nombre_vialidad:'Independencia', subtotal_servicios:3.80, subtotal_equipamiento:4, total:7.80, created_at: new Date(Date.now()-86400000).toISOString(),
          servicios:{ aguaPotable:'B', drenaje:'R', alcantarillado:'R', electrificacion:'B', guarniciones:'B', banquetas:'M', pavimento:'R', recoleccionBasura:'B' },
          equipamiento:{ educacionCultura:'1', transportePublico:'0', comercioAbasto:'1', recreacionDeporte:'1', saludAsistencia:'0', telefono:'1', correosYTelegrafo:'1', contaminacion:'0', calleEspecial:'0' }, infra_mapa:[] },
      ])
      setLoading(false); return
    }
    const { data: recs, error: rErr } = await supabase
      .from('registros').select('*').order('created_at', { ascending: false })
    if (rErr) { setError(`Error: ${rErr.message}`); setLoading(false); return }
    setRecords(recs ?? [])
    setLoading(false)
  }

  /* ── Update ── */
  async function handleUpdate(id, form) {
    const OPCIONES_SERVICIO = [
      { val:'B', peso:0.76 }, { val:'R', peso:0.70 }, { val:'M', peso:0.64 }, { val:'N', peso:1.00 },
    ]
    const subtotal_servicios = SERVICIOS_FULL.reduce((s, item) => {
      const v = form.servicios[item.key]
      return v ? s + (OPCIONES_SERVICIO.find(o=>o.val===v)?.peso ?? 0) : s
    }, 0)
    const subtotal_equipamiento = EQUIPAMIENTO_FULL.reduce((s, item) => {
      return s + Number(form.equipamiento[item.key] ?? 0)
    }, 0)
    const total = subtotal_servicios + subtotal_equipamiento
    const payload = {
      manzana: form.manzana,
      tipo_vialidad: form.tipo_vialidad,
      nombre_vialidad: form.nombre_vialidad,
      tipo_pavimento: form.tipo_pavimento || null,
      observaciones: form.observaciones.trim() || null,
      servicios: form.servicios,
      equipamiento: form.equipamiento,
      subtotal_servicios,
      subtotal_equipamiento,
      total,
    }
    if (isConfigured) {
      const { error } = await supabase.from('registros').update(payload).eq('id', id)
      if (error) { alert(`Error al guardar: ${error.message}`); return }
    }
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...payload } : r))
    setEditing(null)
    setDetail(null)
  }

  /* ── Delete ── */
  async function handleDelete(id) {
    if (isConfigured) await supabase.from('registros').delete().eq('id', id)
    setRecords(r => r.filter(x => x.id !== id))
    setDeleting(null)
  }

  /* ── Filtered + paged records ── */
  const filteredRecords = useMemo(() => {
    let res = records
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      res = res.filter(r =>
        String(r.manzana).toLowerCase().includes(q) ||
        r.nombre_vialidad?.toLowerCase().includes(q) ||
        (TIPO_LABELS[r.tipo_vialidad] ?? r.tipo_vialidad)?.toLowerCase().includes(q)
      )
    }
    if (dateFrom) res = res.filter(r => new Date(r.created_at) >= new Date(dateFrom))
    if (dateTo)   res = res.filter(r => new Date(r.created_at) <= new Date(dateTo + 'T23:59:59'))
    return res
  }, [records, search, dateFrom, dateTo])

  const totalPages  = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE))
  const pagedRecords = filteredRecords.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  /* ── Stats ── */
  const stats = useMemo(() => {
    const n = records.length; if (!n) return null
    const avgS = records.reduce((s,r)=>s+(r.subtotal_servicios??0),0)/n
    const avgE = records.reduce((s,r)=>s+(r.subtotal_equipamiento??0),0)/n
    const avgT = records.reduce((s,r)=>s+(r.total??0),0)/n
    return { n, avgS: avgS.toFixed(2), avgE: avgE.toFixed(1), avgT: avgT.toFixed(2) }
  }, [records])

  const servChartData = useMemo(() =>
    SERVICIOS_LIST.map(({ key, label }) => {
      const cnt = { B:0, R:0, M:0, N:0 }
      records.forEach(r => { const v = r.servicios?.[key]; if (v in cnt) cnt[v]++ })
      return { label, ...cnt }
    }), [records])

  const equipChartData = useMemo(() =>
    EQUIPAMIENTO_LIST.map(({ key, label }) => {
      let si=0, no=0
      records.forEach(r => { const v=r.equipamiento?.[key]; if(v==='1')si++; else if(v==='0')no++ })
      return { label, Sí: si, No: no }
    }), [records])

  const timeChartData = useMemo(() => {
    const map = {}
    records.forEach(r => {
      const d = new Date(r.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short' })
      map[d] = (map[d]??0)+1
    })
    return Object.entries(map).reverse().map(([fecha,count])=>({ fecha, count }))
  }, [records])

  // Radar: calidad promedio por servicio (B=1, R=0.7, M=0.3, N=0)
  const radarData = useMemo(() => {
    const PESO = { B:1, R:0.7, M:0.3, N:0 }
    return SERVICIOS_LIST.map(({ key, label }) => {
      const vals = records.map(r => PESO[r.servicios?.[key]] ?? null).filter(v => v !== null)
      const avg = vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0
      return { label, calidad: Math.round(avg * 100) }
    })
  }, [records])

  // Pie: distribución por tipo de vialidad
  const vialidadPieData = useMemo(() => {
    const map = {}
    records.forEach(r => {
      const k = TIPO_LABELS[r.tipo_vialidad] ?? r.tipo_vialidad ?? 'Sin tipo'
      map[k] = (map[k] ?? 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value)
  }, [records])

  // Top 10 manzanas con mayor puntaje
  const topManzanas = useMemo(() =>
    [...records]
      .sort((a,b) => Number(b.total) - Number(a.total))
      .slice(0, 10)
      .map(r => ({
        manzana: `Mz ${r.manzana}`,
        total: Number(r.total).toFixed(2),
        fill: Number(r.total) >= 12 ? '#15803d' : Number(r.total) >= 8 ? '#6366f1' : '#b45309',
      }))
  , [records])

  /* ══ RENDER ══ */
  return (
    <div className="ad-page">

      {/* Print report — shown only on print */}
      {printing && <PrintReport record={printing} onClose={() => setPrinting(null)} />}

      {detail && !editing && (
        <DetailModal
          record={detail}
          onClose={() => setDetail(null)}
          onEdit={r => { setEditing(r); setDetail(null) }}
          onPrint={r => setPrinting(r)}
        />
      )}

      {editing && (
        <EditModal
          record={editing}
          onSave={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar registro?</h3>
            <p>Manzana <b>{deleting.manzana}</b> — {TIPO_LABELS[deleting.tipo_vialidad]} {deleting.nombre_vialidad}</p>
            <p className="confirm-warn">Esta acción no se puede deshacer.</p>
            <div className="confirm-btns">
              <button className="btn-cancel" onClick={() => setDeleting(null)}>Cancelar</button>
              <button className="btn-delete-confirm" onClick={() => handleDelete(deleting.id)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Topbar */}
      <div className="ad-topbar">
        <div className="ad-topbar-inner">
          <span className="ad-brand">Catastro <span className="ad-tag">Admin</span></span>
          <div className="ad-topbar-right">
            <span className="ad-email">{session?.user?.email}</span>
            {onBack && (
              <button className="ad-back-btn" onClick={onBack} title="Volver al formulario">
                ← Formulario
              </button>
            )}
            <button className="ad-logout-btn" onClick={onLogout}>Cerrar sesión</button>
          </div>
        </div>
      </div>

      <div className="ad-body">
        {!isConfigured && <div className="ad-demo-banner">⚠ Modo desarrollo — datos de demostración.</div>}

        <nav className="ad-tabs">
          {[
            { key:'stats',   label:'Estadísticas' },
            { key:'mapa',    label:'Mapa' },
            { key:'records', label:`Registros${stats ? ` (${stats.n})` : ''}` },
          ].map(t => (
            <button key={t.key} className={`ad-tab ${tab===t.key ? 'ad-tab-on' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
          <button className="ad-refresh" onClick={loadData} title="Actualizar">↻</button>
        </nav>

        {loading && <div className="ad-loading">Cargando datos…</div>}
        {error   && <div className="ad-error">{error}</div>}

        {/* ══ MAPA ══ */}
        {tab==='mapa' && !loading && (() => {
          const allPoints = []
          records.forEach(r => {
            if (!Array.isArray(r.infra_mapa)) return
            r.infra_mapa.forEach(m => allPoints.push({
              ...m, manzana: r.manzana,
              vialidad: `${TIPO_LABELS[r.tipo_vialidad]??r.tipo_vialidad} ${r.nombre_vialidad}`,
            }))
          })
          const filtered = mapFilter==='all' ? allPoints : allPoints.filter(m=>m.type===mapFilter)
          const mapCenter = filtered.length>0
            ? [filtered.reduce((s,m)=>s+m.lat,0)/filtered.length, filtered.reduce((s,m)=>s+m.lng,0)/filtered.length]
            : [20.4878, -99.1533]
          const counts = {
            luminaria:    allPoints.filter(m=>m.type==='luminaria').length,
            alcantarilla: allPoints.filter(m=>m.type==='alcantarilla').length,
            inmueble:     allPoints.filter(m=>m.type==='inmueble').length,
          }
          return (
            <div>
              <div className="avance-panel">
                <div className="avance-header">
                  <h2>Avance de captura</h2>
                  <span className="avance-pct">{records.length} manzana{records.length!==1?'s':''} capturada{records.length!==1?'s':''}</span>
                </div>
                <div className="avance-bar-wrap">
                  <div className="avance-bar-track">
                    <div className="avance-bar-fill" style={{ width:`${Math.min((records.length/1000)*100,100).toFixed(1)}%` }}/>
                  </div>
                  <span className="avance-bar-label">{((records.length/1000)*100).toFixed(1)}% de 1,000</span>
                </div>
                <div className="avance-stats">
                  {[['#f59e0b','Luminarias',counts.luminaria],['#2563eb','Alcantarillas',counts.alcantarilla],['#dc2626','Inmuebles',counts.inmueble],['#6366f1','Total puntos',allPoints.length]].map(([c,l,v])=>(
                    <div key={l} className="avance-stat"><span style={{color:c}}>●</span> {l} <b>{v}</b></div>
                  ))}
                </div>
              </div>

              <div className="avance-panel" style={{ marginBottom:'1.25rem' }}>
                <h2 className="ad-sect" style={{ marginBottom:'.75rem' }}>Avance por manzana</h2>
                <div className="manzanas-grid">
                  {[...records].sort((a,b)=>Number(a.manzana)-Number(b.manzana)).map(r => (
                    <div key={r.id} className="manzana-chip" onClick={() => { setDetail(r); setTab('records') }}>
                      <span className="manzana-chip-num">{r.manzana}</span>
                      <span className="manzana-chip-via">{TIPO_LABELS[r.tipo_vialidad]?.slice(0,3)??r.tipo_vialidad} {r.nombre_vialidad}</span>
                      <span className="manzana-chip-score">{Number(r.total).toFixed(1)}</span>
                    </div>
                  ))}
                  {records.length === 0 && <div className="ad-empty">Sin registros aún.</div>}
                </div>
              </div>

              <div className="mapa-admin-filters">
                {[
                  { key:'all',label:`Todos (${allPoints.length})`,color:'#0a0a0a' },
                  { key:'luminaria',label:`Luminarias (${counts.luminaria})`,color:'#f59e0b' },
                  { key:'alcantarilla',label:`Alcantarillas (${counts.alcantarilla})`,color:'#2563eb' },
                  { key:'inmueble',label:`Inmuebles (${counts.inmueble})`,color:'#dc2626' },
                ].map(f=>(
                  <button key={f.key} className={`mapa-admin-filter-btn ${mapFilter===f.key?'maf-active':''}`}
                    style={mapFilter===f.key?{borderColor:f.color,color:f.color}:{}} onClick={()=>setMapFilter(f.key)}>
                    <span style={{color:f.color}}>●</span> {f.label}
                  </button>
                ))}
                {allPoints.length > 0 && (
                  <div style={{ marginLeft:'auto', display:'flex', gap:'.4rem' }}>
                    <button className="mapa-admin-filter-btn" onClick={() => exportGeoJSON(records)}>⬇ GeoJSON</button>
                    <button className="mapa-admin-filter-btn btn-dxf"  onClick={() => exportDXF(records)}>⬇ DXF AutoCAD</button>
                  </div>
                )}
              </div>

              {allPoints.length === 0
                ? <div className="ad-empty">No hay puntos de infraestructura registrados aún.</div>
                : (
                  <div className="mapa-admin-wrap">
                    <MapContainer center={mapCenter} zoom={15} style={{ height:'520px', width:'100%' }}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                      {filtered.map((m,i)=>(
                        <Marker key={i} position={[m.lat,m.lng]} icon={makePinIcon(PIN_COLORS[m.type]??'#666')}>
                          <Popup>
                            <div style={{ fontSize:'12px', lineHeight:1.7, minWidth:'180px' }}>
                              <b style={{ fontSize:'13px' }}>Manzana {m.manzana}</b><br/>
                              <span style={{ color:'#737373' }}>{m.vialidad}</span><br/>
                              <span style={{ textTransform:'capitalize', fontWeight:600 }}>{m.type}{m.subtype?` · ${m.subtype}`:''}</span><br/>
                              <span style={{ color:'#6366f1', fontFamily:'monospace', fontSize:'11px' }}>UTM {toUTM(m.lat,m.lng).label}</span><br/>
                              <span style={{ color:'#a3a3a3', fontFamily:'monospace', fontSize:'10px' }}>{m.lat.toFixed(6)}, {m.lng.toFixed(6)}</span>
                            </div>
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  </div>
                )
              }
            </div>
          )
        })()}

        {/* ══ ESTADÍSTICAS ══ */}
        {tab==='stats' && !loading && (
          <div>
            <div className="ad-cards">
              <StatCard value={stats?.n??0}     label="Total registros"      color="#6366f1" />
              <StatCard value={stats?.avgT??'—'} label="Promedio total"       sub="servicios + equipamiento" color="#0284c7" />
              <StatCard value={stats?.avgS??'—'} label="Prom. servicios"      sub="máx 6.08" color="#15803d" />
              <StatCard value={stats?.avgE??'—'} label="Prom. equipamiento"   sub="máx 9"    color="#b45309" />
            </div>
            {(!stats||stats.n===0) && <div className="ad-empty">No hay registros aún.</div>}
            {stats && stats.n>0 && (<>
              {timeChartData.length>1 && (
                <>
                  <h2 className="ad-sect">Registros por día</h2>
                  <div className="ad-chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={timeChartData} margin={{ top:10, right:20, left:0, bottom:0 }}>
                        <defs>
                          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
                        <XAxis dataKey="fecha" tick={{ fontSize:12 }}/>
                        <YAxis allowDecimals={false} tick={{ fontSize:12 }}/>
                        <Tooltip/>
                        <Area type="monotone" dataKey="count" name="Registros" stroke="#6366f1" fill="url(#cg)" strokeWidth={2}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
              <h2 className="ad-sect">Calidad de Servicios</h2>
              <div className="ad-chart-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={servChartData} layout="vertical" margin={{ top:5, right:30, left:90, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize:12 }}/>
                    <YAxis type="category" dataKey="label" tick={{ fontSize:12 }} width={90}/>
                    <Tooltip/><Legend/>
                    <Bar dataKey="B" name="Bueno"   stackId="a" fill="#15803d"/>
                    <Bar dataKey="R" name="Regular" stackId="a" fill="#b45309"/>
                    <Bar dataKey="M" name="Malo"    stackId="a" fill="#b91c1c"/>
                    <Bar dataKey="N" name="Ninguno" stackId="a" fill="#a3a3a3" radius={[0,4,4,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <h2 className="ad-sect">Equipamiento Urbano</h2>
              <div className="ad-chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={equipChartData} layout="vertical" margin={{ top:5, right:30, left:90, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize:12 }}/>
                    <YAxis type="category" dataKey="label" tick={{ fontSize:12 }} width={90}/>
                    <Tooltip/><Legend/>
                    <Bar dataKey="Sí" fill="#15803d" radius={[0,4,4,0]}/>
                    <Bar dataKey="No" fill="#e5e5e5" radius={[0,4,4,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <h2 className="ad-sect">Puntaje por manzana</h2>
              <div className="ad-chart-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[...records].sort((a,b)=>Number(a.manzana)-Number(b.manzana)).map(r=>({
                      manzana:`Mz ${r.manzana}`,
                      Servicios: Number(r.subtotal_servicios).toFixed(2),
                      Equipamiento: r.subtotal_equipamiento,
                    }))}
                    margin={{ top:5, right:20, left:0, bottom:30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5"/>
                    <XAxis dataKey="manzana" tick={{ fontSize:11 }} angle={-35} textAnchor="end"/>
                    <YAxis tick={{ fontSize:12 }}/><Tooltip/><Legend/>
                    <Bar dataKey="Servicios"    fill="#6366f1" radius={[4,4,0,0]}/>
                    <Bar dataKey="Equipamiento" fill="#0284c7" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Radar — calidad promedio por servicio */}
              <h2 className="ad-sect">Radar de Calidad de Servicios</h2>
              <div className="ad-chart-wrap">
                <p style={{ fontSize:'.75rem', color:'#a3a3a3', marginBottom:'.5rem', marginLeft:'.5rem' }}>
                  Porcentaje promedio de calidad por servicio (100% = todos Bueno, 0% = todos Ninguno)
                </p>
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={radarData} margin={{ top:10, right:30, left:30, bottom:10 }}>
                    <PolarGrid stroke="#e5e5e5"/>
                    <PolarAngleAxis dataKey="label" tick={{ fontSize:11, fill:'#737373' }}/>
                    <PolarRadiusAxis angle={90} domain={[0,100]} tick={{ fontSize:10, fill:'#a3a3a3' }} tickCount={5}/>
                    <Radar name="Calidad %" dataKey="calidad" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2}/>
                    <Tooltip formatter={(v) => [`${v}%`, 'Calidad promedio']}/>
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie — tipo de vialidad */}
              {vialidadPieData.length > 0 && (
                <>
                  <h2 className="ad-sect">Distribución por Tipo de Vialidad</h2>
                  <div className="ad-chart-wrap" style={{ display:'flex', alignItems:'center', gap:'1.5rem', flexWrap:'wrap' }}>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={vialidadPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                          labelLine={true}
                        >
                          {vialidadPieData.map((_, i) => (
                            <Cell key={i} fill={['#6366f1','#0284c7','#15803d','#b45309','#dc2626','#7c3aed','#0891b2'][i % 7]}/>
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* Top 10 manzanas */}
              {topManzanas.length > 0 && (
                <>
                  <h2 className="ad-sect">Top {topManzanas.length} Manzanas — Mayor Puntaje Total</h2>
                  <div className="ad-chart-wrap">
                    <ResponsiveContainer width="100%" height={Math.max(200, topManzanas.length * 36)}>
                      <BarChart
                        data={topManzanas}
                        layout="vertical"
                        margin={{ top:5, right:50, left:60, bottom:5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false}/>
                        <XAxis type="number" domain={[0,'auto']} tick={{ fontSize:12 }}/>
                        <YAxis type="category" dataKey="manzana" tick={{ fontSize:12 }} width={58}/>
                        <Tooltip formatter={(v) => [v, 'Puntaje total']}/>
                        <Bar dataKey="total" name="Puntaje" radius={[0,6,6,0]}>
                          {topManzanas.map((entry, i) => (
                            <Cell key={i} fill={entry.fill}/>
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap', padding:'.5rem .75rem 0', fontSize:'.75rem', color:'#737373' }}>
                      <span><span style={{ color:'#15803d', fontWeight:700 }}>●</span> Alto (≥12)</span>
                      <span><span style={{ color:'#6366f1', fontWeight:700 }}>●</span> Medio (≥8)</span>
                      <span><span style={{ color:'#b45309', fontWeight:700 }}>●</span> Bajo (&lt;8)</span>
                    </div>
                  </div>
                </>
              )}
            </>)}
          </div>
        )}

        {/* ══ REGISTROS ══ */}
        {tab==='records' && !loading && (
          <div>
            {/* Toolbar */}
            <div className="rec-toolbar">
              <input
                className="rec-search"
                placeholder="Buscar manzana, vialidad…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <input type="date" className="rec-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Desde" />
              <input type="date" className="rec-date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   title="Hasta" />
              {(search||dateFrom||dateTo) && (
                <button className="rec-clear" onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>✕ Limpiar</button>
              )}
              <div className="rec-toolbar-right">
                <span className="ad-records-count">
                  {filteredRecords.length !== records.length
                    ? `${filteredRecords.length} de ${records.length}`
                    : `${records.length} registro${records.length!==1?'s':''}`}
                </span>
                {records.length > 0 && (
                  <>
                    <button className="btn-export" onClick={() => exportCSV(filteredRecords)}>⬇ CSV</button>
                    <button className="btn-export btn-export-geo" onClick={() => exportGeoJSON(filteredRecords)}>⬇ GeoJSON</button>
                    <button className="btn-export btn-export-dxf" onClick={() => exportDXF(filteredRecords)}>⬇ DXF</button>
                  </>
                )}
              </div>
            </div>

            {filteredRecords.length === 0 ? (
              <div className="ad-empty">{search||dateFrom||dateTo ? 'Sin resultados para esa búsqueda.' : 'No hay registros aún.'}</div>
            ) : (
              <>
                <div className="ad-table-wrap">
                  <table className="ad-table">
                    <thead>
                      <tr>
                        <th>Fecha</th><th>Manzana</th><th>Vialidad</th>
                        <th>Servicios</th><th>Equip.</th><th>Total</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRecords.map(r => (
                        <tr key={r.id} className="ad-tr-hover" onClick={() => setDetail(r)} style={{ cursor:'pointer' }}>
                          <td className="ad-td-date">
                            {new Date(r.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })}
                          </td>
                          <td><b>{r.manzana}</b></td>
                          <td>{TIPO_LABELS[r.tipo_vialidad]??r.tipo_vialidad} {r.nombre_vialidad}</td>
                          <td>{Number(r.subtotal_servicios).toFixed(2)}</td>
                          <td>{r.subtotal_equipamiento}</td>
                          <td><b>{Number(r.total).toFixed(2)}</b></td>
                          <td onClick={e => e.stopPropagation()} className="td-actions">
                            <button className="btn-row-edit" title="Editar" onClick={() => setEditing(r)}>✏</button>
                            <button className="btn-row-del"  title="Eliminar" onClick={() => setDeleting(r)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="ad-table-hint">Clic en una fila para ver el detalle completo</p>
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                  <div className="pagination">
                    <button className="pg-btn" disabled={page===1} onClick={() => setPage(1)}>«</button>
                    <button className="pg-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>‹</button>
                    <span className="pg-info">Página {page} de {totalPages}</span>
                    <button className="pg-btn" disabled={page===totalPages} onClick={() => setPage(p=>p+1)}>›</button>
                    <button className="pg-btn" disabled={page===totalPages} onClick={() => setPage(totalPages)}>»</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
