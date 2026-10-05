/* HAMEEDS BISTRO — MERCHANT WEB CONFIG
 *
 * This is the ONLY file you need to edit when the POS moves to another PC.
 *
 * apiUrl points to the MAIN RMP POS HOST API through Tailscale.
 * Current shop PC MAIN POS HOST:
 *   https://desktop-k7nplqn.tail4874ea.ts.net:8443
 *
 * It is NOT the restricted Customer API on port 8788.
 *
 * When moving the POS to another PC later, only change apiUrl below.
 */

(function () {
  'use strict';

  const cfg = {
    apiUrl: 'https://desktop-k7nplqn.tail4874ea.ts.net:8443',
    adminWebUrl: ''
  };

  window.HAMEEDS_MERCHANT_CONFIG = cfg;

  try {
    if (cfg.apiUrl) {
      localStorage.setItem(
        'hameeds_local_api_url',
        String(cfg.apiUrl).replace(/\/$/, '')
      );
    }
  } catch (e) {
    // Ignore localStorage errors.
  }
})();
