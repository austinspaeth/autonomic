/* api.js — the one call the dashboard makes.
   Every request carries a Cognito id token; the Lambda re-checks the email
   against its allowlist before touching the table. */
window.Api = (function () {
  'use strict';

  var CFG = window.AUTONOMIC_CONFIG;

  function call(action, payload) {
    return window.Auth.idToken().then(function (token) {
      return fetch(CFG.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ action: action, payload: payload || {} })
      });
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { /* gateway HTML */ }
        if (!res.ok) {
          var err = new Error(data.error || data.message || ('Request failed (' + res.status + ')'));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  return { call: call };
})();
