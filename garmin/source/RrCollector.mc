using Toybox.Sensor;
using Toybox.System;
using Toybox.Time;
using Toybox.Application;
using Toybox.WatchUi;
using Toybox.Lang;

// Collects raw beat-to-beat intervals.
//
// HOW THE SENSOR IS DRIVEN, and why each step is there. All of it was expensive
// to find and none of it is in the docs.
//
//   1. NO activity session. It was tried (ActivityRecording.createSession with
//      the Fit permission, discarded on stop) as the documented way to force
//      the optical sensor into its activity-rate mode, because Garmin's tracker
//      holds an acknowledged report of Connect IQ apps being left in the
//      low-power mode on some firmware when the watch's Wrist Heart Rate
//      setting is Auto. On the Venu 4 it did the opposite: a reading that had
//      locked in 3-5 s every time stopped producing ANY beat-to-beat with the
//      session open, and the Fit permission moved the app into the watch's
//      Activities list. Do not bring it back.
//   2. setEnabledSensors asks for SENSOR_ONBOARD_HEARTRATE — the WRIST sensor.
//      SENSOR_HEARTRATE is the remote chest-strap type, and asking for it made
//      beat-to-beat unreliable for a whole day.
//   3. The listener is registered ONCE and left up between readings (`_armed`).
//      On the development watch only the first registration after launch gave
//      beat-to-beat; re-registering every few seconds to "refresh" it made
//      things strictly worse, since each call restarts optical acquisition.
//   4. ...but a reading that has produced NOTHING for LOCK_TIMEOUT_SEC is
//      re-armed once, and once more later, because at that point there is
//      nothing left to lose: the alternative shipped, and it was a spinner that
//      ran until the user gave up. A reading whose callbacks STOP mid-way
//      (the app went inactive — a call, a notification — and Connect IQ
//      disables sensors on inactive) is re-armed the same way.
//   5. A reading that cannot get a signal is STOPPED at GIVE_UP_SEC, told so,
//      and a diagnostic record goes to the phone in place of the reading, so
//      the failure is counted per device and firmware instead of vanishing.
//
// Does NOT analyse, correct, or de-duplicate: everything is preserved exactly as
// Garmin delivered it. The phone does every calculation.
class RrCollector {

    // Matches the phone app's own baseline reading (durationFor() in
    // sessionStore.ts). Both ends must agree: a Garmin reading of a different
    // length would not be comparable with one taken on a strap.
    //
    // Measured from the FIRST BEAT, not from the tap. The optical sensor needs
    // time to lock, and that delay is not a constant — it cost ~25% of a 2:25
    // reading and ~2% of a 5:17 one.
    const DURATION_SEC = 300;

    // How long to wait for the first beat before doing something about it.
    // Lock is normally 3-5 seconds, so 25 seconds of silence is not patience.
    const LOCK_TIMEOUT_SEC = 25;

    // A second re-arm, for a sensor that needed the first one to settle.
    const SECOND_REARM_SEC = 50;

    // No beat at all by here and the reading is stopped and the user told. A
    // spinner that runs for ever is the failure mode this replaces.
    const GIVE_UP_SEC = 75;

    // Callbacks stopping ENTIRELY for this long mid-reading means the listener
    // is dead, not that the signal is poor (a poor signal still calls back with
    // an empty array). Re-arm.
    const STALL_SEC = 12;

    // Re-arms allowed per reading, all causes.
    const MAX_REARMS = 3;

    // A reading shorter than this that captured nothing is the user changing
    // their mind, not a sensor failure, and is not reported.
    const DIAG_MIN_SEC = 10;

    // Below this a reading is not worth sending: the phone refuses it anyway,
    // and a refusal that travels is just a retry loop waiting to happen.
    const MIN_INTERVALS = 30;

    // Guard against unbounded growth on a long session.
    const MAX_INTERVALS = 4000;

    hidden var _intervals as Lang.Array<Lang.Number> = [];
    hidden var _running = false;
    hidden var _startedAt = null;      // epoch seconds
    hidden var _startedMoment = null;
    hidden var _lockTimer = null;      // System.getTimer() at the first interval
    hidden var _endedAt = null;
    hidden var _startTimer = null;     // System.getTimer() at start, ms
    hidden var _lastCallbackTimer = null;
    hidden var _lastHr = null;
    hidden var _callbacks = 0;         // every callback, of any kind
    hidden var _nullCallbacks = 0;     // callbacks that carried no heartRateData
    hidden var _emptyCallbacks = 0;    // callbacks with an empty interval array
    hidden var _rearms = 0;
    hidden var _failed = null;         // why the app itself stopped the reading
    hidden var _error = null;
    hidden var _frozenElapsed = 0;
    hidden var _frozenMeasured = 0;
    // Survives reset(): the listener is registered ONCE for the app's lifetime.
    hidden var _armed = false;

    function initialize() {
        reset();
    }

    function reset() {
        _intervals = [];
        _running = false;
        _startedAt = null;
        _startedMoment = null;
        _lockTimer = null;
        _endedAt = null;
        _startTimer = null;
        _lastCallbackTimer = null;
        _lastHr = null;
        _callbacks = 0;
        _nullCallbacks = 0;
        _emptyCallbacks = 0;
        _rearms = 0;
        _failed = null;
        _error = null;
        _frozenElapsed = 0;
        _frozenMeasured = 0;
    }

    function isRunning() { return _running; }
    function error() { return _error; }
    function count() { return _intervals.size(); }
    function lastHr() { return _lastHr; }
    function failed() { return _failed; }
    function rearms() { return _rearms; }

    function elapsedSec() {
        if (_startTimer == null) { return 0; }
        if (_endedAt != null && !_running) { return _frozenElapsed; }
        return (System.getTimer() - _startTimer) / 1000;
    }

    function start() {
        if (_running) { return; }
        reset();
        _startedAt = Time.now().value();
        _startedMoment = Time.now();
        _startTimer = System.getTimer();
        _lastCallbackTimer = _startTimer;
        _running = true;
        arm();
    }

    // Register the sensor listener. Once per app session in the normal case;
    // rearm() is the only other caller.
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

    // Tear the listener down and bring it back. Only for a reading that is
    // getting NOTHING — see the header.
    hidden function rearm() {
        _rearms = _rearms + 1;
        _lastCallbackTimer = System.getTimer();
        release();
        arm();
    }

    // Only on the way out of the app, and from rearm().
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

    // Called once a second by the view. Watches the sensor the way the user
    // would and acts before they have to: re-arms a dead feed, and stops a
    // reading that is never going to lock. Returns a reason when the reading
    // must END now, else null.
    function tick() {
        if (!_running) { return null; }
        var now = System.getTimer();

        // The pulse the sensor DOES see, polled here rather than only inside
        // the callback: with the listener dead there are no callbacks, and
        // "no pulse detected" would then be a claim about the listener.
        var info = Sensor.getInfo();
        if (info != null && info.heartRate != null) { _lastHr = info.heartRate; }

        var el = (now - _startTimer) / 1000;
        if (_lockTimer == null) {
            if (el >= GIVE_UP_SEC) { _failed = "nosignal"; return "nosignal"; }
            if ((el >= LOCK_TIMEOUT_SEC && _rearms == 0)
                || (el >= SECOND_REARM_SEC && _rearms == 1)) {
                rearm();
            }
            return null;
        }
        // Locked, and the feed has gone completely quiet.
        if ((now - _lastCallbackTimer) / 1000 >= STALL_SEC && _rearms < MAX_REARMS) {
            rearm();
        }
        return null;
    }

    // The sensor callback. Keep it cheap and allocation-light.
    function onSensorData(data as Sensor.SensorData) as Void {
        // The feed stays registered between readings; only a running reading
        // consumes it.
        if (!_running) { return; }
        _callbacks = _callbacks + 1;
        _lastCallbackTimer = System.getTimer();

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

        // The clock starts here, on the first beat the sensor gives us.
        if (_lockTimer == null) { _lockTimer = System.getTimer(); }

        // Flattened stream, acquisition order, no filtering of any kind.
        for (var i = 0; i < iv.size(); i = i + 1) {
            if (_intervals.size() >= MAX_INTERVALS) { break; }
            _intervals.add(iv[i]);
        }

        WatchUi.requestUpdate();
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

    // A failed reading worth REPORTING: it ran long enough that the sensor had
    // its chance. A two-second tap-and-back is not a fault.
    function worthReporting() {
        return !worthSending() && elapsedSec() >= DIAG_MIN_SEC;
    }

    // A reading that has ENDED, whatever it captured. Distinct from
    // `count() > 0`: a session that finished with no beats is still a finished
    // session, and treating it as "never started" silently threw the user back
    // to the ready screen as though nothing had happened.
    function hasResult() { return _endedAt != null; }

    // ---- Persistence ------------------------------------------------------
    // A summary of the last session, for the simulator and for a support
    // conversation with the watch in hand. The intervals themselves travel in
    // the payload.
    function persist() {
        try {
            Application.Storage.setValue("lastSession", {
                "startedAt" => _startedAt,
                "endedAt" => _endedAt,
                "count" => _intervals.size(),
                "callbacks" => _callbacks,
                "nullCallbacks" => _nullCallbacks,
                "emptyCallbacks" => _emptyCallbacks,
                "rearms" => _rearms,
                "failed" => _failed
            });
        } catch (ex) {
            _error = "storage: " + ex.getErrorMessage();
        }
    }

    // The journal payload for a finished reading. Diagnostics travel with it
    // so the phone can judge coverage rather than trusting the series.
    function payload() {
        return {
            "type" => "hrv",
            "schemaVersion" => Payload.SCHEMA,
            "time" => (_startedMoment == null) ? Payload.isoNow() : Payload.isoOf(_startedMoment),
            "elapsedSec" => measuredSec(),
            "emptyCallbacks" => _emptyCallbacks,
            "nullCallbacks" => _nullCallbacks,
            "rearms" => _rearms,
            "rrMs" => _intervals,
            "source" => "garmin-optical",
            // The device's OWN part number, not a model name. The phone does
            // not read this field for display — receiver.ts resolves the
            // watch's name from Garmin Connect's linked-device list — so it
            // exists purely so a support dump can say which hardware a
            // reading came off.
            "device" => System.getDeviceSettings().partNumber
        };
    }

    // What goes to the phone INSTEAD of a reading when there is none. It
    // carries no beats and nothing about the person: which hardware, which
    // firmware, how long the sensor was given, whether it ever saw a pulse,
    // and how many re-arms were spent.
    // The phone files it on the fault route, grouped by that shape, which is
    // how "the Garmin app doesn't work" becomes a row per device.
    function diagPayload(reason) {
        var ds = System.getDeviceSettings();
        return {
            "type" => "diag",
            "schemaVersion" => 1,
            "time" => (_startedMoment == null) ? Payload.isoNow() : Payload.isoOf(_startedMoment),
            "reason" => reason,
            "elapsedSec" => elapsedSec(),
            "measuredSec" => measuredSec(),
            "count" => _intervals.size(),
            "callbacks" => _callbacks,
            "emptyCallbacks" => _emptyCallbacks,
            "nullCallbacks" => _nullCallbacks,
            "hrSeen" => _lastHr != null,
            "rearms" => _rearms,
            "device" => ds.partNumber,
            "firmware" => ds.firmwareVersion,
            "ciq" => ds.monkeyVersion
        };
    }
}
