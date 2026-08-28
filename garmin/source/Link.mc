using Toybox.Communications;
using Toybox.Application;
using Toybox.System;
using Toybox.Timer;
using Toybox.WatchUi;

// The phone link, with store-and-forward.
//
// `Communications.transmit` is a LIVE send, not a queue: it fails outright when
// the phone is asleep or Autonomic is not listening (measured — a locked screen
// reliably rejects). A five minute reading is far too expensive to lose to that,
// so nothing is ever sent-and-forgotten:
//
//   1. a finished session is persisted to Application.Storage FIRST
//   2. transmit is attempted
//   3. on failure it stays queued and is retried (on app open, and on a timer)
//   4. it is cleared only when the phone ACKs that id
//
// The ack is why every payload carries an `id`. Without it the watch cannot
// distinguish "delivered" from "sent into a void", and would either drop
// readings or deliver them twice.
class Link extends Communications.ConnectionListener {

    const PROTOCOL = 2;
    const QUEUE_KEY = "outbox";
    // Retry backs OFF rather than hammering: 30s, then doubling to a 4 minute
    // ceiling. A phone that is out of range stays out of range for minutes at a
    // time, and a fixed 30s retry spends radio power on an outcome that has not
    // changed. The reading is safe in storage either way, and a reconnect
    // resets the interval.
    const RETRY_MS = 30000;
    const RETRY_MAX_MS = 240000;

    hidden var _state;      // "idle" | "sending" | "sent" | "failed"
    hidden var _detail;
    hidden var _onChange;
    hidden var _timer;
    hidden var _inFlight;   // id currently being transmitted
    hidden var _backoff;

    function initialize(onChange) {
        ConnectionListener.initialize();
        _state = "idle";
        _detail = null;
        _onChange = onChange;
        _inFlight = null;
        _backoff = RETRY_MS;
    }

    function state() { return _state; }
    function detail() { return _detail; }

    hidden function note(s, d) {
        _state = s;
        _detail = d;
        if (_onChange != null) { _onChange.invoke(); }
        WatchUi.requestUpdate();
    }

    // ---- Outbox ----------------------------------------------------------

    hidden function outbox() {
        var q = Application.Storage.getValue(QUEUE_KEY);
        if (q == null) { return []; }
        return q;
    }

    hidden function setOutbox(q) {
        Application.Storage.setValue(QUEUE_KEY, q);
    }

    function pending() { return outbox().size(); }

    // Queue a payload and try to send it. `payload` must already carry its
    // `type` (hrv) and `id`.
    function enqueue(payload) {
        var q = outbox();
        q.add(payload);
        // Bound the outbox so a phone that never reconnects cannot fill
        // storage. Oldest goes first: a stale reading is worth less than a
        // fresh one.
        while (q.size() > 8) { q = q.slice(1, q.size()); }
        setOutbox(q);
        flush();
    }

    // Attempt the head of the queue.
    function flush() {
        if (_state.equals("sending")) { return; }
        var q = outbox();
        if (q.size() == 0) {
            note("idle", null);
            stopRetry();
            return;
        }
        // Don't attempt a send we already know will fail. Transmit against a
        // disconnected phone is a guaranteed error, and every attempt costs
        // radio time on a battery this app has no right to spend. The reading
        // stays queued and the retry timer picks it up when the phone is back.
        if (!System.getDeviceSettings().phoneConnected) {
            note("failed", "phone away");
            startRetry();
            return;
        }
        var item = q[0];
        _inFlight = item["id"];
        note("sending", "" + q.size() + " queued");
        try {
            send(item);
        } catch (ex) {
            _inFlight = null;
            note("failed", "queued");
            startRetry();
        }
    }

    // The only place Communications is touched on the way out.
    hidden function send(item) {
        Communications.transmit(item, {}, self);
    }


    // The phone confirms an id. Only then is it safe to forget.
    function ack(id) {
        var q = outbox();
        var keep = [];
        for (var i = 0; i < q.size(); i = i + 1) {
            if (!q[i]["id"].equals(id)) { keep.add(q[i]); }
        }
        setOutbox(keep);
        if (keep.size() == 0) {
            note("sent", null);
            stopRetry();
        } else {
            flush();
        }
    }

    // ---- Retry -----------------------------------------------------------

    hidden function startRetry() {
        if (_timer != null) { return; }
        _timer = new Timer.Timer();
        // One-shot: each attempt schedules the next at a longer interval.
        _timer.start(method(:onRetry), _backoff, false);
    }

    hidden function stopRetry() {
        if (_timer != null) { _timer.stop(); _timer = null; }
        _backoff = RETRY_MS;
    }

    function onRetry() as Void {
        _timer = null;
        if (outbox().size() == 0) { stopRetry(); return; }
        _backoff = _backoff * 2;
        if (_backoff > RETRY_MAX_MS) { _backoff = RETRY_MAX_MS; }
        _state = "idle";
        flush();
    }

    // ---- ConnectionListener ----------------------------------------------

    // NOTE: onComplete means the message left the watch, NOT that Autonomic
    // stored it. The entry stays in the outbox until an explicit ack arrives.
    function onComplete() {
        note("sending", "awaiting ack");
        startRetry();
    }

    function onError() {
        _inFlight = null;
        note("failed", "phone unreachable");
        startRetry();
    }
}
