using Toybox.Sensor;
using Toybox.System;
using Toybox.Time;
using Toybox.Math;
using Toybox.Application;
using Toybox.WatchUi;
using Toybox.Lang;

// Collects raw beat-to-beat intervals.
//
// THE RULE THAT MATTERS: only the FIRST registerSensorDataListener after the app
// launches yields beat-to-beat on this watch. Unregister and register again and
// every callback returns an empty interval array while heart rate keeps working
// perfectly — indistinguishable from a dead sensor, and it cost an entire
// evening to find. So the listener is registered once (`_armed`), left up
// between readings, and released only when the app closes. Do not "refresh" it.
//
// setEnabledSensors is called EXACTLY ONCE, in arm(), immediately before
// registering, and asks for SENSOR_ONBOARD_HEARTRATE — the WRIST sensor.
// SENSOR_HEARTRATE is the remote chest-strap type and asking for it is what
// made beat-to-beat unreliable for a whole day. Calling setEnabledSensors a
// second time anywhere — including "helpfully" centralising it at app start —
// is separately harmful. The other modes call it too, on their own starts, and
// that is a theoretical hazard nobody has yet observed; it is left alone
// because this configuration is the one that demonstrably works, and it was
// expensive to find. Does NOT analyse, correct, or
// de-duplicate: everything is preserved exactly as Garmin delivered it so the
// semantics of heartBeatIntervals can be worked out off-device.
//
// Two things are recorded per session:
//   _intervals  flattened intervals in acquisition order (what we eventually want)
//   _callbacks  one entry per callback: [msSinceStart, rawArray] (what tells us
//               whether the array is rolling or cumulative, and whether values repeat)
class RrCollector {

    // Matches the phone app's own baseline reading (durationFor() in
    // sessionStore.ts). Both ends must agree: a Garmin reading of a different
    // length would not be comparable with one taken on a strap.
    //
    // Measured from the FIRST BEAT, not from the tap. The optical sensor needs
    // time to lock, and that delay is not a constant — it cost ~25% of a 2:25
    // reading and ~2% of a 5:17 one. Counting wall clock would hand the phone a
    // reading that is nominally five minutes but materially shorter than the
    // strap reading it gets compared against.
    const DURATION_SEC = 300;

    // How long to wait for the sensor before saying something is wrong. Lock is
    // normally 3-5 seconds, so a minute of silent waiting is not patience, it is
    // a reading the user has no reason to believe in.
    const LOCK_TIMEOUT_SEC = 25;


    // Below this a reading is not worth sending: the phone refuses it anyway,
    // and a refusal that travels is just a retry loop waiting to happen.
    const MIN_INTERVALS = 30;

    // Guard against unbounded growth on a long session.
    const MAX_INTERVALS = 4000;
    const MAX_CALLBACKS = 900;

    hidden var _intervals as Lang.Array<Lang.Number> = [];
    hidden var _callbacks as Lang.Array<Lang.Array> = [];
    hidden var _running;
    hidden var _startedAt;      // epoch seconds
    hidden var _startedMoment;
    hidden var _lockTimer;      // System.getTimer() at the first interval
    hidden var _endedAt;
    hidden var _startTimer;     // System.getTimer() at start, ms
    hidden var _lastHr;
    hidden var _nullCallbacks;  // callbacks that carried no heartRateData
    hidden var _emptyCallbacks; // callbacks with an empty interval array
    hidden var _error;
    // Survives reset(): the listener is registered ONCE for the app's lifetime.
    hidden var _armed = false;

    function initialize() {
        reset();
    }

    function reset() {
        _intervals = [];
        _callbacks = [];
        _running = false;
        _startedAt = null;
        _startedMoment = null;
        _lockTimer = null;
        _endedAt = null;
        _startTimer = null;
        _lastHr = null;
        _nullCallbacks = 0;
        _emptyCallbacks = 0;
        _error = null;
    }

    function isRunning() { return _running; }
    function error() { return _error; }
    function intervals() { return _intervals; }
    function callbacks() { return _callbacks; }
    function count() { return _intervals.size(); }
    function lastHr() { return _lastHr; }
    function nullCallbacks() { return _nullCallbacks; }

    // Is OUR activity actually recording? createSession/start can fail quietly,
    // and "we started a session" is not the same claim as "the watch is
    // sampling fast enough", which is the thing the reading depends on.
    // Ours, plus the SYSTEM's view of any activity at all. The pair matters:
    // "none/on" means someone else's recording is blocking ours, "rec/off"
    // would mean the watch disagrees that we are recording, and "rec/on" means
    // the recording is genuinely up and the problem is elsewhere.
    function emptyCallbacks() { return _emptyCallbacks; }
    function startedAt() { return _startedAt; }
    function endedAt() { return _endedAt; }

    function elapsedSec() {
        if (_startTimer == null) { return 0; }
        var now = System.getTimer();
        if (_endedAt != null && !_running) {
            // frozen at stop
            return _frozenElapsed;
        }
        return (now - _startTimer) / 1000;
    }

    hidden var _frozenElapsed = 0;
    hidden var _frozenMeasured = 0;

    function start() {
        if (_running) { return; }
        reset();
        _startedAt = Time.now().value();
        _startedMoment = Time.now();
        _startTimer = System.getTimer();
        _running = true;
        arm();
    }



    (:nohighrate)
    hidden function ensureHighRate() { }

    // Register the sensor listener ONCE for the whole app session.
    //
    // On this watch only the FIRST registration after launch yields
    // beat-to-beat. Unregister and register again — even minutes later, even
    // with the sensor re-enabled — and every callback comes back with an empty
    // interval array while heart rate keeps working. So the reading no longer
    // takes the listener down when it ends: the feed stays up and onSensorData
    // simply ignores data while no reading is running.
    //
    // (An earlier version re-registered every 8 seconds to "refresh" it, which
    // made things strictly worse: each call restarts optical acquisition, so
    // any reading that did not lock within 8 seconds never locked at all.)
    hidden function arm() {
        if (_armed) { return; }
        try {
            // SENSOR_ONBOARD_HEARTRATE, not SENSOR_HEARTRATE.
            //
            // SENSOR_HEARTRATE is a RemoteSensorType (value 4) — an external
            // ANT+/BLE chest strap. The wrist sensor is a different constant
            // entirely: SENSOR_ONBOARD_HEARTRATE, an OnboardSensorType (value
            // 8). Every build until now asked the watch to enable the STRAP and
            // then wondered why the wrist produced no beat-to-beat.
            //
            // It fits the symptoms better than anything else considered: it
            // failed intermittently rather than absolutely, and it was
            // "fixed" by anything that put the onboard sensor into continuous
            // use for its own reasons — a native activity, another app.
            Sensor.setEnabledSensors([Sensor.SENSOR_ONBOARD_HEARTRATE]);
            Sensor.registerSensorDataListener(
                method(:onSensorData),
                {
                    :period => 1,
                    :heartBeatIntervals => { :enabled => true }
                }
            );
            _armed = true;
        } catch (ex) {
            _running = false;
            _error = ex.getErrorMessage();
        }
    }

    // Only on the way out of the app.
    function release() {
        if (!_armed) { return; }
        try {
            Sensor.unregisterSensorDataListener();
        } catch (ex) {
            // Already gone.
        }
        _armed = false;
    }


    function stop() {
        if (!_running) { return; }
        _frozenElapsed = (System.getTimer() - _startTimer) / 1000;
        _frozenMeasured = (_lockTimer == null) ? 0 : (System.getTimer() - _lockTimer) / 1000;
        _running = false;
        _endedAt = Time.now().value();
        persist();
    }

    // The sensor callback. Keep it cheap and allocation-light.
    function onSensorData(data as Sensor.SensorData) as Void {
        // The feed stays registered between readings; only a running reading
        // consumes it.
        if (!_running) { return; }
        var t = (_startTimer == null) ? 0 : System.getTimer() - _startTimer;

        var info = Sensor.getInfo();
        if (info != null && info.heartRate != null) {
            _lastHr = info.heartRate;
        }

        if (data == null || data.heartRateData == null) {
            _nullCallbacks = _nullCallbacks + 1;
            WatchUi.requestUpdate();
            return;
        }

        var iv = data.heartRateData.heartBeatIntervals;
        if (iv == null || iv.size() == 0) {
            _emptyCallbacks = _emptyCallbacks + 1;
            WatchUi.requestUpdate();
            return;
        }

        // Raw callback log, verbatim.
        if (_callbacks.size() < MAX_CALLBACKS) {
            _callbacks.add([t, iv]);
        }

        // The clock starts here, on the first beat the sensor gives us.
        if (_lockTimer == null) { _lockTimer = System.getTimer(); }

        // Flattened stream, acquisition order, no filtering of any kind.
        for (var i = 0; i < iv.size(); i = i + 1) {
            if (_intervals.size() >= MAX_INTERVALS) { break; }
            _intervals.add(iv[i]);
        }

        WatchUi.requestUpdate();
    }

    // ---- Live diagnostics -------------------------------------------------
    // These exist to answer one question on the wrist without any export:
    // is this a real beat-to-beat series, or is it back-computed from BPM?

    // Mean absolute successive difference. Interpolated data trends to ~0;
    // a genuine supine series is typically tens of ms.
    function meanAbsDiff() {
        var n = _intervals.size();
        if (n < 2) { return null; }
        var sum = 0.0;
        for (var i = 1; i < n; i = i + 1) {
            var d = _intervals[i] - _intervals[i - 1];
            if (d < 0) { d = -d; }
            sum = sum + d;
        }
        return sum / (n - 1);
    }

    // How many distinct interval values we have seen. A series derived from an
    // integer BPM readout collapses onto very few distinct values.
    function distinctCount() {
        var n = _intervals.size();
        if (n == 0) { return 0; }
        var seen = {};
        for (var i = 0; i < n; i = i + 1) {
            seen.put(_intervals[i], true);
        }
        return seen.keys().size();
    }

    // Fraction of intervals that sit within 1 ms of 60000/k for a whole number
    // k. If the watch is dividing an integer BPM, this lands near 100%.
    function bpmQuantizedPct() {
        var n = _intervals.size();
        if (n == 0) { return null; }
        var hits = 0;
        for (var i = 0; i < n; i = i + 1) {
            var rr = _intervals[i];
            if (rr == null || rr <= 0) { continue; }
            var k = Math.round(60000.0 / rr).toNumber();
            if (k <= 0) { continue; }
            var exact = 60000.0 / k;
            var d = rr - exact;
            if (d < 0) { d = -d; }
            if (d <= 1.0) { hits = hits + 1; }
        }
        return (hits * 100.0) / n;
    }

    // Total time accounted for by the intervals we were given, in seconds.
    // Compared against elapsed time this is the cleanest test for dropped
    // beats: a shortfall is time during which beats happened and were not
    // reported, which RMSSD cannot survive uncorrected.
    function sumSec() {
        var total = 0;
        for (var i = 0; i < _intervals.size(); i = i + 1) {
            total = total + _intervals[i];
        }
        return total / 1000.0;
    }

    function coveragePct() {
        var el = elapsedSec();
        if (el <= 0) { return null; }
        return (sumSec() * 100.0) / el;
    }

    // Mean intervals delivered per non-empty callback. At 1 Hz polling this
    // should track HR/60; materially below that means beats are being lost
    // between callbacks rather than by the sensor.
    function meanPerCallback() {
        var cb = _callbacks.size();
        if (cb == 0) { return null; }
        return (_intervals.size() * 1.0) / cb;
    }

    // Seconds of MEASURED time: from the first interval, not from the tap.
    function measuredSec() {
        if (_lockTimer == null) { return 0; }
        if (!_running && _endedAt != null) { return _frozenMeasured; }
        return (System.getTimer() - _lockTimer) / 1000;
    }

    function hasLock() { return _lockTimer != null; }


    // True once the sensor has had long enough that silence means a problem
    // rather than a slow start.
    function lockTimedOut() {
        return _lockTimer == null && elapsedSec() >= LOCK_TIMEOUT_SEC;
    }

    function remainingSec() {
        var left = DURATION_SEC - measuredSec();
        return left < 0 ? 0 : left;
    }

    function progress() {
        var m = measuredSec();
        if (m >= DURATION_SEC) { return 1.0; }
        return (m * 1.0) / DURATION_SEC;
    }

    function isComplete() { return _lockTimer != null && measuredSec() >= DURATION_SEC; }

    // Worth sending? A reading the phone will refuse should never leave the
    // watch: it cannot become valid on a retry, so it would only ever cost
    // radio and battery.
    function worthSending() { return _intervals.size() >= MIN_INTERVALS; }

    // A reading that has ENDED, whatever it captured. Distinct from
    // `count() > 0`: a session that finished with no beats is still a finished
    // session, and treating it as "never started" silently threw the user back
    // to the ready screen as though nothing had happened.
    function hasResult() { return _endedAt != null; }


    function lastIntervals(k) as Lang.Array<Lang.Number> {
        var n = _intervals.size();
        if (n == 0) { return []; }
        var from = n - k;
        if (from < 0) { from = 0; }
        return _intervals.slice(from, n);
    }

    // ---- Persistence ------------------------------------------------------
    // Storage is the only way off the watch until the phone link exists.
    // The simulator can read this directly; on device it is what a later
    // export path will pick up.
    function persist() {
        try {
            Application.Storage.setValue("lastSession", {
                "startedAt" => _startedAt,
                "endedAt" => _endedAt,
                "count" => _intervals.size(),
                "nullCallbacks" => _nullCallbacks,
                "emptyCallbacks" => _emptyCallbacks,
                "rrMs" => _intervals
            });
            Application.Storage.setValue("lastCallbacks", _callbacks);
        } catch (ex) {
            _error = "storage: " + ex.getErrorMessage();
        }
    }

    // The journal payload for a finished reading. Diagnostics travel with it
    // so the phone can judge coverage rather than trusting the series: a
    // reading whose intervals do not account for the elapsed time has dropped
    // beats and must not be scored as continuous.
    function payload() {
        return {
            "type" => "hrv",
            "schemaVersion" => Payload.SCHEMA,
            "time" => (_startedMoment == null) ? Payload.isoNow() : Payload.isoOf(_startedMoment),
            "elapsedSec" => measuredSec(),
            "emptyCallbacks" => _emptyCallbacks,
            "nullCallbacks" => _nullCallbacks,
            "rrMs" => _intervals,
            "source" => "garmin-optical",
            "device" => "venu4"
        };
    }

    // Dump to the console. Simulator only, but this is the fastest read of the
    // raw callback structure while working out the semantics.
    function dumpToConsole() {
        System.println("=== AUTONOMIC RR SESSION ===");
        System.println("startedAt=" + _startedAt + " endedAt=" + _endedAt);
        System.println("count=" + _intervals.size()
            + " nullCb=" + _nullCallbacks
            + " emptyCb=" + _emptyCallbacks);
        System.println("--- raw callbacks [msSinceStart, intervals] ---");
        for (var i = 0; i < _callbacks.size(); i = i + 1) {
            System.println("" + _callbacks[i][0] + " " + _callbacks[i][1]);
        }
        System.println("--- flattened rrMs ---");
        System.println(_intervals.toString());
        System.println("=== END ===");
    }
}
