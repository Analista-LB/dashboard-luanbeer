/**
 * @fileoverview Módulo de Integración con Supabase para Dashboard LuanBeer.
 * Maneja la conexión con Supabase (PostgreSQL, Auth, RLS y RPC), sincronización de versiones,
 * autenticación de administradores, ingesta atómica protegida y fallback local.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArgonBI = root.ArgonBI || {};
    root.ArgonBI.SupabaseClient = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Configuración por defecto (puede sobreescribirse mediante window.__ARGON_SUPABASE_CONFIG__)
  const DEFAULT_CONFIG = {
    url: (typeof window !== 'undefined' && window.__ARGON_SUPABASE_CONFIG__ && window.__ARGON_SUPABASE_CONFIG__.url) || '',
    anonKey: (typeof window !== 'undefined' && window.__ARGON_SUPABASE_CONFIG__ && window.__ARGON_SUPABASE_CONFIG__.anonKey) || '',
    storageKey: 'argon_supabase_session'
  };

  let clientInstance = null;
  let activeUser = null;
  let activeRole = 'reader'; // 'reader' (público) o 'admin'
  let authListeners = [];

  /**
   * Obtiene la configuración activa de Supabase
   */
  function getConfig() {
    let cfg = { ...DEFAULT_CONFIG };
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('argon_supabase_config');
        if (stored) {
          const parsed = JSON.parse(stored);
          cfg = { ...cfg, ...parsed };
        }
      } catch (e) { /* ignore */ }
      if (window.__ARGON_SUPABASE_CONFIG__) {
        cfg = { ...cfg, ...window.__ARGON_SUPABASE_CONFIG__ };
      }
    }
    return cfg;
  }

  /**
   * Guarda o actualiza la configuración de Supabase
   */
  function setConfig(newConfig) {
    const current = getConfig();
    const merged = { ...current, ...newConfig };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('argon_supabase_config', JSON.stringify({
          url: merged.url,
          anonKey: merged.anonKey
        }));
      } catch (e) { /* ignore */ }
    }
    clientInstance = null; // Re-crear cliente
    return getClient();
  }

  /**
   * Verifica si Supabase está configurado con URL y anonKey válidas
   */
  function isConfigured() {
    const cfg = getConfig();
    return Boolean(cfg.url && cfg.anonKey && cfg.url.startsWith('http') && cfg.anonKey.length > 20);
  }

  /**
   * Inicializa o devuelve la instancia del cliente oficial de Supabase
   */
  function getClient() {
    if (clientInstance) return clientInstance;

    const cfg = getConfig();
    const createClientFn = (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) ||
      (typeof root !== 'undefined' && root.supabase && root.supabase.createClient);

    if (!createClientFn) {
      return null;
    }

    if (isConfigured()) {
      try {
        clientInstance = createClientFn(cfg.url, cfg.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            storageKey: cfg.storageKey
          }
        });

        // Registrar listener de autenticación
        clientInstance.auth.onAuthStateChange(async (event, session) => {
          activeUser = session?.user || null;
          await refreshUserRole();
          notifyAuthListeners({ event, session, user: activeUser, role: activeRole });
        });
      } catch (err) {
        console.warn('[SupabaseClient] Error al inicializar cliente oficial:', err);
      }
    }

    return clientInstance;
  }

  /**
   * Actualiza el rol del usuario actual desde la tabla 'user_roles'
   */
  async function refreshUserRole() {
    if (!activeUser || !clientInstance) {
      activeRole = 'reader';
      return 'reader';
    }

    try {
      const { data, error } = await clientInstance
        .from('user_roles')
        .select('role')
        .eq('user_id', activeUser.id)
        .maybeSingle();

      if (!error && data && data.role) {
        activeRole = data.role;
      } else {
        // Por defecto si no tiene rol explícito en tabla
        activeRole = 'reader';
      }
    } catch (err) {
      console.warn('[SupabaseClient] No se pudo verificar rol en user_roles:', err);
      activeRole = 'reader';
    }

    return activeRole;
  }

  /**
   * Registra callbacks ante cambios de estado de autenticación
   */
  function onAuthStateChange(listener) {
    if (typeof listener === 'function') {
      authListeners.push(listener);
    }
  }

  function notifyAuthListeners(payload) {
    for (const l of authListeners) {
      try { l(payload); } catch (e) { console.error(e); }
    }
  }

  /**
   * Inicia sesión con correo y contraseña mediante Supabase Auth
   */
  async function signIn(email, password) {
    const client = getClient();
    if (!client) {
      // Modo local simulado para entornos de prueba offline
      if (email === 'admin@luanbeer.com' && password === 'admin123') {
        activeUser = { id: 'mock-admin-uuid', email: 'admin@luanbeer.com' };
        activeRole = 'admin';
        notifyAuthListeners({ event: 'SIGNED_IN', user: activeUser, role: 'admin' });
        return { success: true, user: activeUser, role: 'admin', isLocalMock: true };
      }
      return { success: false, error: 'Supabase no está conectado ni configurado.' };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      activeUser = data.user;
      await refreshUserRole();

      if (activeRole !== 'admin') {
        // Si el usuario se autenticó pero no tiene rol admin
        return {
          success: true,
          user: activeUser,
          role: activeRole,
          warning: 'Usuario autenticado pero sin rol de administrador en user_roles.'
        };
      }

      return { success: true, user: activeUser, role: activeRole };
    } catch (err) {
      return { success: false, error: err.message || 'Error de conexión con el servidor de autenticación.' };
    }
  }

  /**
   * Cierra sesión del usuario actual
   */
  async function signOut() {
    const client = getClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (e) { /* ignore */ }
    }
    activeUser = null;
    activeRole = 'reader';
    notifyAuthListeners({ event: 'SIGNED_OUT', user: null, role: 'reader' });
    return { success: true };
  }

  /**
   * Comprueba si el usuario autenticado actual tiene rol de administrador
   */
  function isAdmin() {
    return activeRole === 'admin';
  }

  /**
   * Obtiene el usuario actual
   */
  function getCurrentUser() {
    return activeUser;
  }

  /**
   * Obtiene el rol actual ('admin' | 'reader')
   */
  function getCurrentRole() {
    return activeRole;
  }

  /**
   * Consulta las versiones centrales en Supabase ('data_versions')
   */
  async function fetchRemoteVersions() {
    const client = getClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('data_versions')
        .select('*');

      if (error) {
        console.warn('[SupabaseClient] Error al consultar data_versions:', error.message);
        return null;
      }

      const map = {};
      (data || []).forEach(v => {
        map[v.dataset] = { version: v.version, updatedAt: v.updated_at, metadata: v.metadata };
      });
      return map;
    } catch (e) {
      return null;
    }
  }

  /**
   * Ejecuta el procedimiento atómico seguro REPLACE MONTH en Supabase
   * Invoca la función RPC 'replace_monthly_sales_partition'
   */
  async function replaceMonthlySalesPartition(period, fileName, rows, diagnostic = {}) {
    const client = getClient();
    if (!client) {
      return {
        success: false,
        error: 'No se puede ejecutar ingesta en Supabase: Cliente no configurado.'
      };
    }

    if (!isAdmin()) {
      return {
        success: false,
        error: 'No tenés permisos para modificar las bases. Se requiere rol de administrador.'
      };
    }

    try {
      // 1. Invocar RPC segura con protección transaccional en PostgreSQL
      const { data, error } = await client.rpc('replace_monthly_sales_partition', {
        p_period: period,
        p_file_name: fileName,
        p_rows: rows,
        p_diagnostic: diagnostic
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'Error en procedimiento de reemplazo mensual en Supabase.',
          details: error
        };
      }

      return {
        success: true,
        data: data,
        period: period,
        deletedRows: data.deleted_rows,
        insertedRows: data.inserted_rows,
        message: data.message
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Error de red o comunicación al ejecutar reemplazo mensual.'
      };
    }
  }

  /**
   * Obtiene el historial de auditoría desde la tabla central 'ingestion_log'
   */
  async function getAuditLogs(limit = 50) {
    const client = getClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from('ingestion_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('[SupabaseClient] Error al leer ingestion_log:', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Carga ventas de un período específico desde Supabase ('sales_monthly')
   */
  async function fetchSalesByPeriod(period) {
    const client = getClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('sales_monthly')
        .select('*')
        .eq('period', period);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn(`[SupabaseClient] Error al descargar partición ${period}:`, err);
      return null;
    }
  }

  return {
    getConfig,
    setConfig,
    isConfigured,
    getClient,
    signIn,
    signOut,
    isAdmin,
    getCurrentUser,
    getCurrentRole,
    refreshUserRole,
    onAuthStateChange,
    fetchRemoteVersions,
    replaceMonthlySalesPartition,
    getAuditLogs,
    fetchSalesByPeriod
  };
});
