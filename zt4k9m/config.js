/* ==============================================================
   CONFIGURACIÓN
   Aquí NO va ninguna clave ni contraseña: todo pasa por la
   Edge Function "torneo-api", que es la única que las conoce.
   ============================================================== */
window.TORNEO_CONFIG = {
  supabaseUrl: "https://axjanluawnatwqmwwbgd.supabase.co",   // dirección del proyecto (no es secreta)
  funcion: "/functions/v1/super-processor",   // en Supabase se ve como "torneo-api"
  refrescoSeg: 10,          // cada cuánto se comprueba si hay cambios
  entidad: "Asociación Melide Futbolín"
};
