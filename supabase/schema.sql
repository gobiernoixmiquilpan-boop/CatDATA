-- ══════════════════════════════════════════════════════════
-- Schema completo — Ejecuta en Supabase → SQL Editor
-- (instalación nueva desde cero)
-- ══════════════════════════════════════════════════════════

-- Limpiar políticas anteriores si existen
DROP POLICY IF EXISTS "insertar_registros"   ON public.registros;
DROP POLICY IF EXISTS "anon_insert_registros" ON public.registros;
DROP POLICY IF EXISTS "leer_registros"        ON public.registros;
DROP POLICY IF EXISTS "gestionar_usuarios"    ON public.usuarios;

-- Tabla de registros catastro
CREATE TABLE IF NOT EXISTS public.registros (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  manzana               TEXT          NOT NULL UNIQUE,
  tipo_vialidad         TEXT          NOT NULL,
  nombre_vialidad       TEXT          NOT NULL,
  servicios             JSONB         NOT NULL DEFAULT '{}',
  tipo_pavimento        TEXT,
  equipamiento          JSONB         NOT NULL DEFAULT '{}',
  infra_mapa            JSONB         DEFAULT '[]',
  subtotal_servicios    NUMERIC(10,4) NOT NULL,
  subtotal_equipamiento INTEGER       NOT NULL,
  total                 NUMERIC(10,4) NOT NULL,
  observaciones         TEXT
);

-- Tabla de administradores
CREATE TABLE IF NOT EXISTS public.usuarios (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  nombre     TEXT    NOT NULL,
  email      TEXT    UNIQUE,
  rol        TEXT    DEFAULT 'admin',
  activo     BOOLEAN DEFAULT TRUE
);

-- Row Level Security
ALTER TABLE public.registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios  ENABLE ROW LEVEL SECURITY;

-- Capturistas anónimos pueden insertar registros
CREATE POLICY "anon_insert_registros" ON public.registros
  FOR INSERT TO anon WITH CHECK (true);

-- Admin autenticado puede leer, editar y borrar
CREATE POLICY "auth_select_registros" ON public.registros
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_update_registros" ON public.registros
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_delete_registros" ON public.registros
  FOR DELETE TO authenticated USING (true);

-- Admin gestiona usuarios
CREATE POLICY "auth_gestionar_usuarios" ON public.usuarios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- GRANTs explícitos
GRANT INSERT                       ON public.registros TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios  TO authenticated;
