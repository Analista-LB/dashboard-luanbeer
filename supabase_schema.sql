-- ==============================================================================
-- SUPABASE SCHEMA & SECURITY POLICIES (RLS) — DASHBOARD LUANBEER
-- ==============================================================================
-- Este script crea la arquitectura relacional centralizada en PostgreSQL,
-- activa Row Level Security (RLS), restringe la escritura exclusivamente a administradores
-- y expone lectura pública para el dashboard comercial.
-- ==============================================================================

-- 1. EXTENSIONES REQUERIDAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLA DE ROLES Y CONTROL DE ACCESO (ADMIN / READER)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reader')),
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Función segura para verificar si el usuario autenticado actual es Administrador
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Trigger para sincronizar email automáticamente al crear roles
CREATE OR REPLACE FUNCTION public.handle_user_role_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS NULL THEN
    SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_user_role_email ON public.user_roles;
CREATE TRIGGER tr_user_role_email
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.handle_user_role_email();

-- ==============================================================================
-- 3. CONTROL DE VERSIONES CENTRALIZADO (SINCRONIZACIÓN Y CACHE)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.data_versions (
  dataset TEXT PRIMARY KEY,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ==============================================================================
-- 4. TABLA DE AUDITORÍA DE INGESTAS (INGESTION_LOG)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  source_type TEXT NOT NULL,
  period TEXT,
  file_name TEXT,
  rows_count INT DEFAULT 0,
  deleted_rows INT DEFAULT 0,
  inserted_rows INT DEFAULT 0,
  min_date TEXT,
  max_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('EXITOSO', 'FALLIDO', 'EN_PROCESO', 'REVERTIDO')),
  error_message TEXT,
  diagnostic JSONB DEFAULT '{}'::jsonb
);

-- ==============================================================================
-- 5. MAESTRO DE CLIENTES (PADRÓN OFICIAL)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  codigo INT PRIMARY KEY,
  nombre TEXT NOT NULL,
  canal TEXT,
  subcanal TEXT,
  supervisor TEXT,
  rtv TEXT,
  anulado TEXT DEFAULT 'NO',
  domicilio TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 6. MAESTRO DE PRODUCTOS (PORTFOLIO)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  codigo INT PRIMARY KEY,
  producto TEXT NOT NULL,
  unidad_negocio TEXT,
  division TEXT,
  marca TEXT,
  calibre TEXT,
  sabor TEXT,
  familia TEXT,
  en_maestro BOOLEAN DEFAULT TRUE,
  is_cza BOOLEAN DEFAULT FALSE,
  is_above_core BOOLEAN DEFAULT FALSE,
  is_core_value BOOLEAN DEFAULT FALSE,
  is_laton_710 BOOLEAN DEFAULT FALSE,
  is_balanced_choice BOOLEAN DEFAULT FALSE,
  is_top_ung BOOLEAN DEFAULT FALSE,
  is_saborizada BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7. MAESTROS DE CANALES Y SUBCANALES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.channel_mkt (
  canal_mkt TEXT PRIMARY KEY,
  canal_unificado TEXT,
  segmento_canal TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subchannel_mkt (
  subcanal_mkt TEXT PRIMARY KEY,
  canal_mkt TEXT,
  canal_unificado TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 8. VENTAS MENSUALES HISTÓRICAS Y BASE A LA FECHA (SALES_MONTHLY)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sales_monthly (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  cte INT NOT NULL,
  prod INT NOT NULL,
  canal TEXT,
  vend INT DEFAULT 1,
  sup INT DEFAULT 100,
  ccc SMALLINT DEFAULT 1,
  bultos NUMERIC(12, 2) DEFAULT 0,
  hl NUMERIC(12, 4) NOT NULL,
  neto NUMERIC(16, 2) NOT NULL,
  bonif NUMERIC(16, 2) DEFAULT 0,
  source SMALLINT DEFAULT 1,
  fecha DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 9. OBJETIVOS COMERCIALES (TARGETS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.targets (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  cte INT,
  prod INT,
  vend INT,
  hl NUMERIC(12, 4) DEFAULT 0,
  neto NUMERIC(16, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 10. ESTADO DE TABLERO DE VENTAS (TACO .XLSB) & GALAXIA 2026
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tablero_ventas_state (
  period TEXT PRIMARY KEY,
  source_file TEXT,
  fecha_corte JSONB,
  mando_integral JSONB,
  mesa_julio JSONB,
  mesa_gonza JSONB,
  by_vendedor JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.galaxia_state (
  period TEXT PRIMARY KEY,
  scorecard JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 11. ÍNDICES DE ALTO RENDIMIENTO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_sales_monthly_period ON public.sales_monthly(period);
CREATE INDEX IF NOT EXISTS idx_sales_monthly_cte ON public.sales_monthly(cte);
CREATE INDEX IF NOT EXISTS idx_sales_monthly_prod ON public.sales_monthly(prod);
CREATE INDEX IF NOT EXISTS idx_sales_monthly_canal ON public.sales_monthly(canal);
CREATE INDEX IF NOT EXISTS idx_sales_monthly_period_cte ON public.sales_monthly(period, cte);
CREATE INDEX IF NOT EXISTS idx_customers_anulado ON public.customers(anulado);
CREATE INDEX IF NOT EXISTS idx_products_unidad ON public.products(unidad_negocio);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_created ON public.ingestion_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_targets_period ON public.targets(period);

-- ==============================================================================
-- 12. SEGURIDAD — ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_mkt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subchannel_mkt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tablero_ventas_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.galaxia_state ENABLE ROW LEVEL SECURITY;

-- Políticas de LECTURA PÚBLICA (Anon / Lector / Todo el mundo)
CREATE POLICY "Public Read Sales" ON public.sales_monthly FOR SELECT USING (true);
CREATE POLICY "Public Read Customers" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Public Read Products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Public Read Channels" ON public.channel_mkt FOR SELECT USING (true);
CREATE POLICY "Public Read Subchannels" ON public.subchannel_mkt FOR SELECT USING (true);
CREATE POLICY "Public Read Targets" ON public.targets FOR SELECT USING (true);
CREATE POLICY "Public Read Versions" ON public.data_versions FOR SELECT USING (true);
CREATE POLICY "Public Read Ingestion Log" ON public.ingestion_log FOR SELECT USING (true);
CREATE POLICY "Public Read Tablero" ON public.tablero_ventas_state FOR SELECT USING (true);
CREATE POLICY "Public Read Galaxia" ON public.galaxia_state FOR SELECT USING (true);

-- user_roles solo visible por usuarios autenticados para su propio id o por administradores
CREATE POLICY "Self Read User Roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

-- Políticas de ESCRITURA ESTRICTA (Solo administradores autenticados)
CREATE POLICY "Admin Write Sales" ON public.sales_monthly FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Customers" ON public.customers FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Products" ON public.products FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Channels" ON public.channel_mkt FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Subchannels" ON public.subchannel_mkt FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Targets" ON public.targets FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Versions" ON public.data_versions FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Ingestion Log" ON public.ingestion_log FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Tablero" ON public.tablero_ventas_state FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Write Galaxia" ON public.galaxia_state FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admin Manage Roles" ON public.user_roles FOR ALL
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ==============================================================================
-- 13. PROCEDIMIENTO SEGURO ATÓMICO: REPLACE MONTH (TRANSACTIONAL RPC)
-- ==============================================================================
-- Reemplaza exclusivamente las ventas del mes especificado. Si ocurre cualquier error,
-- la transacción revierte automáticamente y el mes anterior queda 100% conservado.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.replace_monthly_sales_partition(
  p_period TEXT,
  p_file_name TEXT,
  p_rows JSONB,
  p_diagnostic JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INT := 0;
  v_inserted_count INT := 0;
  v_user_email TEXT;
  v_user_id UUID;
  v_log_id UUID;
BEGIN
  -- 1. Verificación estricta de autorización de administrador
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: Se requiere rol de administrador autenticado para modificar las bases.';
  END IF;

  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- 2. Validación de parámetros de entrada
  IF p_period IS NULL OR length(trim(p_period)) < 6 THEN
    RAISE EXCEPTION 'Período inválido: "%". Se espera formato AAAA/MM.', p_period;
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'El lote de datos está vacío o es inválido. No se realizaron cambios en la base.';
  END IF;

  -- 3. Iniciar reemplazo atómico: Eliminar exclusivamente las filas del mes target
  DELETE FROM public.sales_monthly WHERE period = p_period;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- 4. Insertar las nuevas filas correspondientes al mes
  INSERT INTO public.sales_monthly (
    period, cte, prod, canal, vend, sup, ccc, bultos, hl, neto, bonif, source
  )
  SELECT
    p_period,
    (r->>'cte')::INT,
    (r->>'prod')::INT,
    COALESCE(r->>'canal', 'General'),
    COALESCE((r->>'vend')::INT, 1),
    COALESCE((r->>'sup')::INT, 100),
    COALESCE((r->>'ccc')::SMALLINT, 1),
    COALESCE((r->>'bultos')::NUMERIC, 0),
    (r->>'hl')::NUMERIC,
    (r->>'neto')::NUMERIC,
    COALESCE((r->>'bonif')::NUMERIC, 0),
    COALESCE((r->>'source')::SMALLINT, 1)
  FROM jsonb_array_elements(p_rows) AS r;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- 5. Incrementar versión del dataset en data_versions
  INSERT INTO public.data_versions (dataset, version, updated_at, metadata)
  VALUES ('sales', 1, NOW(), jsonb_build_object('last_period', p_period, 'rows', v_inserted_count))
  ON CONFLICT (dataset) DO UPDATE
  SET version = public.data_versions.version + 1,
      updated_at = NOW(),
      metadata = jsonb_build_object('last_period', p_period, 'rows', v_inserted_count);

  -- 6. Registrar auditoría formal en ingestion_log
  INSERT INTO public.ingestion_log (
    user_id, user_email, source_type, period, file_name,
    rows_count, deleted_rows, inserted_rows, status, diagnostic
  ) VALUES (
    v_user_id, v_user_email, 'BASE_A_LA_FECHA_MA', p_period, p_file_name,
    v_inserted_count, v_deleted_count, v_inserted_count, 'EXITOSO', p_diagnostic
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'period', p_period,
    'deleted_rows', v_deleted_count,
    'inserted_rows', v_inserted_count,
    'message', format('Partición %s reemplazada con éxito (%s insertadas, %s eliminadas).', p_period, v_inserted_count, v_deleted_count)
  );

EXCEPTION WHEN OTHERS THEN
  -- Si ocurre cualquier error, registrar el intento fallido en ingestion_log
  INSERT INTO public.ingestion_log (
    user_id, user_email, source_type, period, file_name,
    rows_count, deleted_rows, inserted_rows, status, error_message, diagnostic
  ) VALUES (
    v_user_id, v_user_email, 'BASE_A_LA_FECHA_MA', p_period, p_file_name,
    0, 0, 0, 'FALLIDO', SQLERRM, p_diagnostic
  );
  -- Re-lanzar excepción para abortar la transacción y preservar el mes anterior intacto
  RAISE;
END;
$$;
