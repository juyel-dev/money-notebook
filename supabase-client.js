/* ============================================================
   Supabase hookup — READY SCOPE, currently DISABLED (offline-first).
   When you want cloud sync + login + multi-device:
   1. Create project at supabase.com → copy URL + anon key below
   2. Run the SQL schema from bottom of store.js in Supabase SQL editor
   3. Uncomment the CDN import in index.html and set window.SUPA_ON = true
   4. In store.js set DB.setBackend('dual') for offline-queue + cloud sync
   UI (app.js) needs ZERO changes.
   ============================================================ */
window.SUPA_CONFIG = {
  URL: "",       // e.g. "https://xyzcompany.supabase.co"
  ANON_KEY: "",  // sb_publishable_... key
  ON: false
};
// Future sync sketch:
// async function supaPush(op){ if(!window.SUPA_CONFIG.ON) return; ... }
// window.addEventListener('online', () => supaPush('flush-queue'));
