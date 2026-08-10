/* auth.js — passwordless sign-in for the master dashboard.
 *
 * Same flow DiscoveryMark uses (Cognito CUSTOM_AUTH: enter an email, receive a
 * 4-digit code, answer the challenge) but spoken directly to the Cognito IDP
 * REST API rather than through Amplify. The dashboard has no build step and no
 * dependencies, and this is ~200 lines against a ~2MB SDK.
 *
 * The sign-in EMAIL is DiscoveryMark-branded, because the pool's
 * CreateAuthChallenge trigger belongs to DiscoveryMark's stack. The magic link
 * in it points at discoverymark.com and will NOT sign you in here — enter the
 * 4-digit code instead. That is why this screen never mentions the link.
 */
window.Auth = (function () {
  'use strict';

  var CFG = window.AUTONOMIC_CONFIG;
  var STORE_KEY = 'autonomic.master.auth';
  var CODE_LENGTH = 4;
  var RESEND_COOLDOWN = 20;
  /* Refresh a little before expiry so a request never races the clock. */
  var REFRESH_MARGIN_SEC = 300;

  var tokens = null;     // { idToken, accessToken, refreshToken, email, exp }
  var session = null;    // in-flight Cognito challenge session
  var challengeUser = null;
  var refreshing = null; // de-dupes concurrent refreshes
  var onReady = null;

  /* ------------------------------------------------------------- cognito */

  function cognito(target, body) {
    return fetch(CFG.cognitoEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.' + target
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { /* non-JSON error body */ }
        if (!res.ok) {
          var err = new Error(data.message || data.__type || 'Cognito request failed.');
          // __type looks like "NotAuthorizedException" or a full ARN-ish name.
          err.code = String(data.__type || '').split('#').pop();
          throw err;
        }
        return data;
      });
    });
  }

  /* JWT payload, for the email claim and expiry. Not verification — the API
     verifies; this is only so the client knows who it thinks it is. */
  function decodeJwt(token) {
    try {
      var part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var pad = part.length % 4 ? '='.repeat(4 - (part.length % 4)) : '';
      return JSON.parse(decodeURIComponent(escape(atob(part + pad))));
    } catch (e) { return null; }
  }

  /* --------------------------------------------------------------- store */

  function persist(result) {
    var claims = decodeJwt(result.IdToken) || {};
    tokens = {
      idToken: result.IdToken,
      accessToken: result.AccessToken,
      // A refresh response omits RefreshToken — keep the one we already hold.
      refreshToken: result.RefreshToken || (tokens && tokens.refreshToken) || null,
      email: claims.email || '',
      exp: claims.exp || 0
    };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(tokens)); } catch (e) { /* private mode */ }
    return tokens;
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      tokens = raw ? JSON.parse(raw) : null;
    } catch (e) { tokens = null; }
    return tokens;
  }

  function clear() {
    tokens = null;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }

  function expired(margin) {
    if (!tokens || !tokens.exp) return true;
    return tokens.exp - (margin || 0) <= Math.floor(Date.now() / 1000);
  }

  function refresh() {
    if (!tokens || !tokens.refreshToken) return Promise.reject(new Error('No refresh token.'));
    if (refreshing) return refreshing;
    refreshing = cognito('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: CFG.clientId,
      AuthParameters: { REFRESH_TOKEN: tokens.refreshToken }
    }).then(function (data) {
      if (!data.AuthenticationResult) throw new Error('Refresh returned no tokens.');
      return persist(data.AuthenticationResult);
    }).finally(function () { refreshing = null; });
    return refreshing;
  }

  /** A currently-valid id token, refreshing first if it is close to expiry. */
  function idToken() {
    if (!tokens) return Promise.reject(new Error('Not signed in.'));
    if (!expired(REFRESH_MARGIN_SEC)) return Promise.resolve(tokens.idToken);
    return refresh().then(function (t) { return t.idToken; });
  }

  /* ---------------------------------------------------------- challenge */

  function startChallenge(email) {
    return cognito('InitiateAuth', {
      AuthFlow: 'CUSTOM_AUTH',
      ClientId: CFG.clientId,
      AuthParameters: { USERNAME: email }
    }).then(function (data) {
      session = data.Session;
      // With PreventUserExistenceErrors on, Cognito hands back a challenge even
      // for an unknown address, and echoes the username it will accept.
      challengeUser = (data.ChallengeParameters && data.ChallengeParameters.USERNAME) || email;
      return data;
    });
  }

  function answerChallenge(code) {
    return cognito('RespondToAuthChallenge', {
      ChallengeName: 'CUSTOM_CHALLENGE',
      ClientId: CFG.clientId,
      Session: session,
      ChallengeResponses: { USERNAME: challengeUser, ANSWER: code }
    }).then(function (data) {
      if (data.AuthenticationResult) return persist(data.AuthenticationResult);
      // Wrong code but attempts remain: Cognito re-issues the challenge with a
      // fresh session. Carry it forward or the retry fails as "invalid session".
      session = data.Session || session;
      var err = new Error('That code is not right. Check the email and try again.');
      err.retryable = true;
      throw err;
    });
  }

  /* --------------------------------------------------------------- gate */

  var el = {};
  var step = 'email';
  var cooldownTimer = null;
  var cooldown = 0;
  var busy = false;

  function $(id) { return document.getElementById(id); }

  function showError(msg) {
    el.error.textContent = msg || '';
    el.error.classList.toggle('on', !!msg);
  }

  function setStep(next) {
    step = next;
    el.emailStep.classList.toggle('hidden', next !== 'email');
    el.codeStep.classList.toggle('hidden', next !== 'code');
    showError('');
    if (next === 'code') {
      el.sentTo.textContent = el.email.value.trim().toLowerCase();
      clearDigits();
      startCooldown();
    }
  }

  function setBusy(on, label) {
    busy = on;
    el.submit.disabled = on;
    el.submit.textContent = on ? (label || 'Working…') : 'Continue';
    el.gate.classList.toggle('busy', on);
  }

  function digitInputs() {
    return Array.prototype.slice.call(el.codeRow.querySelectorAll('input'));
  }

  function clearDigits() {
    digitInputs().forEach(function (i) { i.value = ''; });
    setTimeout(function () { var f = digitInputs()[0]; if (f) f.focus(); }, 0);
  }

  function readCode() {
    return digitInputs().map(function (i) { return i.value; }).join('');
  }

  function startCooldown() {
    cooldown = RESEND_COOLDOWN;
    tickCooldown();
  }

  function tickCooldown() {
    clearTimeout(cooldownTimer);
    if (cooldown > 0) {
      el.resend.textContent = 'Resend code in ' + cooldown + 's';
      el.resend.disabled = true;
      cooldown -= 1;
      cooldownTimer = setTimeout(tickCooldown, 1000);
    } else {
      el.resend.textContent = 'Resend code';
      el.resend.disabled = false;
    }
  }

  function submitEmail() {
    var email = el.email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Enter a valid email address.');
      return;
    }
    setBusy(true, 'Sending code…');
    startChallenge(email).then(function () {
      setBusy(false);
      setStep('code');
    }).catch(function (err) {
      setBusy(false);
      showError(err.message || 'Could not send a sign-in code. Try again.');
    });
  }

  var verifying = false;
  function submitCode() {
    var code = readCode();
    if (code.length !== CODE_LENGTH || verifying) return;
    verifying = true;
    el.gate.classList.add('busy');
    showError('');
    answerChallenge(code).then(function () {
      el.gate.classList.remove('busy');
      finish();
    }).catch(function (err) {
      verifying = false;
      el.gate.classList.remove('busy');
      clearDigits();
      if (err.code === 'NotAuthorizedException') {
        // Session burned (too many wrong answers, or it expired). Start over.
        showError('That session expired. Enter your email to get a new code.');
        setStep('email');
        return;
      }
      showError(err.message || 'That code is not right.');
    });
  }

  function wireDigits() {
    var inputs = digitInputs();
    inputs.forEach(function (input, index) {
      input.addEventListener('input', function () {
        var cleaned = input.value.replace(/\D/g, '');
        if (cleaned.length > 1) { spread(cleaned, index); return; }
        input.value = cleaned;
        if (cleaned && index < inputs.length - 1) inputs[index + 1].focus();
        if (readCode().length === CODE_LENGTH) submitCode();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          e.preventDefault();
          inputs[index - 1].focus();
          inputs[index - 1].value = '';
        }
        if (e.key === 'ArrowLeft' && index > 0) inputs[index - 1].focus();
        if (e.key === 'ArrowRight' && index < inputs.length - 1) inputs[index + 1].focus();
      });
      input.addEventListener('paste', function (e) {
        e.preventDefault();
        var text = (e.clipboardData || window.clipboardData).getData('text') || '';
        spread(text.replace(/\D/g, ''), index);
      });
      input.addEventListener('focus', function () { input.select(); });
    });
  }

  function spread(digits, from) {
    var inputs = digitInputs();
    var chars = digits.slice(0, CODE_LENGTH - (digits.length === CODE_LENGTH ? 0 : from));
    var start = digits.length === CODE_LENGTH ? 0 : from;
    for (var i = 0; i < chars.length && start + i < inputs.length; i += 1) {
      inputs[start + i].value = chars[i];
    }
    var last = Math.min(start + chars.length, inputs.length - 1);
    inputs[last].focus();
    if (readCode().length === CODE_LENGTH) submitCode();
  }

  function mount() {
    el.gate = $('gate');
    el.email = $('gateEmail');
    el.submit = $('gateSubmit');
    el.error = $('gateError');
    el.emailStep = $('gateEmailStep');
    el.codeStep = $('gateCodeStep');
    el.codeRow = $('gateCodeRow');
    el.sentTo = $('gateSentTo');
    el.resend = $('gateResend');
    el.back = $('gateBack');

    el.submit.addEventListener('click', submitEmail);
    el.email.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitEmail(); }
    });
    el.email.addEventListener('input', function () { showError(''); });
    el.resend.addEventListener('click', function () {
      if (cooldown > 0) return;
      showError('');
      el.resend.disabled = true;
      el.resend.textContent = 'Sending…';
      startChallenge(el.email.value.trim().toLowerCase())
        .then(function () { clearDigits(); startCooldown(); })
        .catch(function (err) {
          showError(err.message || 'Could not resend. Try again.');
          cooldown = 0; tickCooldown();
        });
    });
    el.back.addEventListener('click', function () { setStep('email'); el.email.focus(); });
    wireDigits();
  }

  function showGate() {
    document.body.classList.add('gated');
    el.gate.classList.remove('hidden');
    setStep('email');
    setTimeout(function () { el.email.focus(); }, 60);
  }

  function finish() {
    document.body.classList.remove('gated');
    el.gate.classList.add('hidden');
    var who = $('whoami');
    if (who) who.textContent = tokens.email;
    if (onReady) { var fn = onReady; onReady = null; fn(); }
  }

  function signOut() {
    clear();
    // Reload rather than tear down: app.js holds a whole render tree keyed to
    // the signed-in user's data, and a fresh page is the honest reset.
    location.reload();
  }

  /** Resolve auth, then hand control to `ready`. Called once, from index.html. */
  function init(ready) {
    onReady = ready;
    mount();
    restore();
    if (!tokens || !tokens.refreshToken) { showGate(); return; }
    if (!expired(REFRESH_MARGIN_SEC)) { finish(); return; }
    // Returning user with a stale id token: spin rather than flash the email
    // form at someone who is already signed in.
    el.gate.classList.add('busy');
    el.emailStep.classList.add('hidden');
    refresh().then(finish).catch(function () {
      el.gate.classList.remove('busy');
      clear();
      showGate();
    });
  }

  return {
    init: init,
    idToken: idToken,
    signOut: signOut,
    email: function () { return tokens ? tokens.email : null; }
  };
})();
