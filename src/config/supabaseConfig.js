/**
 * @fileoverview Configuración de Acceso a Supabase para Dashboard LuanBeer.
 * Define la URL y Anon Key públicas para el frontend estático en Cloudflare Pages.
 * Las claves administrativas (Service Role) NUNCA deben incluirse aquí.
 */
(function (root) {
  'use strict';

  // Configuración predeterminada (Reemplazar con la URL y Clave Anónima de su proyecto Supabase)
  const SUPABASE_CONFIG = {
    url: 'https://fgbuzpkojloesumiordi.supabase.co', // Ej: 'https://xyzcompany.supabase.co'
    anonKey: 'sb_publishable_I4YsxIH9QH0b4DK0mjurAA_LY4RMqVJ' // Ej: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  };

  root.__ARGON_SUPABASE_CONFIG__ = root.__ARGON_SUPABASE_CONFIG__ || SUPABASE_CONFIG;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SUPABASE_CONFIG;
  }
})(typeof window !== 'undefined' ? window : global);
