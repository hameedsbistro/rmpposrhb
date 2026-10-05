/* HAMEEDS BISTRO — MERCHANT WEB CONFIG
 *
 * This is the ONLY file you need to edit when the POS moves to another PC.
 *
 * apiUrl must point to the MAIN RMP POS HOST API (normally port 8787 behind
 * Tailscale Serve/HTTPS). It is NOT the restricted Customer API on port 8788.
 * Example after moving to the shop PC:
 *   apiUrl: 'apiUrl: 'https://desktop-k7nplqn.tail4874ea.ts.net:8443''
 *
 * adminWebUrl is optional. Leave it blank unless you also deploy the Admin
 * page as a browser web app.
 */
(function(){
  'use strict';
  const cfg = {
    apiUrl: 'apiUrl: 'https://desktop-k7nplqn.tail4874ea.ts.net:8443'',
    adminWebUrl: ''
  };
  window.HAMEEDS_MERCHANT_CONFIG = cfg;
  try {
    if (cfg.apiUrl) localStorage.setItem('hameeds_local_api_url', String(cfg.apiUrl).replace(/\/$/,''));
  } catch (e) {}
})();
