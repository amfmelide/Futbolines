/* ==============================================================
   CONFIGURACIÓN · lo único que normalmente hay que tocar
   ============================================================== */
window.TORNEO_CONFIG = {
  // Mismo proyecto de Supabase que la Liga (la clave es la pública "anon", se puede publicar)
  supabaseUrl: "https://axjanluawnatwqmwwbgd.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4amFubHVhd25hdHdxbXd3YmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTc1NzIsImV4cCI6MjA5Mzk5MzU3Mn0.jwn_kQkm85j7dYh2JUm74P_x_5KfdbC8pZBcV1WJ9pE",
  funcion: "/functions/v1/torneo-api",

  // Clave PÚBLICA VAPID para los avisos push (npx web-push generate-vapid-keys).
  // La privada va SOLO en los secretos de Supabase, nunca aquí.
  vapidPublica: "",

  refrescoSeg: 10,          // cada cuánto se comprueba si hay cambios
  entidad: "Asociación Melide Futbolín",
  web: "amfmelide.es/torneos/"
};
