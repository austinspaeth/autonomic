using Toybox.Sensor;
using Toybox.System;
using Toybox.Timer;
using Toybox.Time;
using Toybox.Attention;
using Toybox.WatchUi;

// The guided POTS stand test — a port of the Apple Watch's StandTestController
// so both companions run the same protocol and emit the same payload.
//
//   intro -> resting (5:00) -> prompt (buzz; tap or 15s auto) -> standing (10:00) -> complete
//
// A 1 Hz ticker records the HR series for the whole test. Sensor dropouts leave
// GAPS — no interpolated samples are invented, because a fabricated beat during
// a diagnostic test is worse than a missing one.
class StandTest {

    enum { INTRO, RESTING, PROMPT, STANDING, COMPLETE }

    const RESTING_SEC = 300;
    const STANDING_SEC = 600;

    hidden var _stage;
    hidden var _stageElapsed;
    hidden var _testElapsed;
    hidden var _standAt;
    hidden var _series;         // [[t, hr], ...] gaps where HR was unavailable
    hidden var _restSeconds;
    hidden var _timer;
    hidden var _startedAt;
    hidden var _startedMoment;
    hidden var _baseline;
    hidden var _delta;
    hidden var _peakHr;
    hidden var _peakDelta;
    hidden var _lastBuzz;       // hysteresis band already announced
    hidden var _result;
    hidden var _baselineUnstable;
    hidden var _endedEarly;

    function initialize() {
        _stage = INTRO;
        _series = [];
        reset();
    }

    hidden function reset() {
        _stageElapsed = 0;
        _testElapsed = 0;
        _standAt = null;
        _series = [];
        _restSeconds = 0;
        _baseline = null;
        _delta = null;
        _peakHr = 0;
        _peakDelta = 0;
        _lastBuzz = 0;
        _result = null;
        _baselineUnstable = false;
        _endedEarly = false;
    }

    function stage() { return _stage; }
    function stageElapsed() { return _stageElapsed; }
    function delta() { return _delta; }
    function baseline() { return _baseline; }
    function peakHr() { return _peakHr; }
    function peakDelta() { return _peakDelta; }
    function result() { return _result; }

    // The prompt has NO duration on purpose, which also means no ring: it is
    // waiting on a person, not running a clock. Standing up is the one part of
    // this test the user may need a moment for — someone with POTS may be
    // bracing for it — and a countdown there would either rush them or start
    // the standing clock while they were still lying down.
    function stageDuration() {
        if (_stage == RESTING) { return RESTING_SEC; }
        if (_stage == STANDING) { return STANDING_SEC; }
        return 0;
    }

    function stageName() {
        if (_stage == INTRO) { return "Ready"; }
        if (_stage == RESTING) { return "Lie down"; }
        if (_stage == PROMPT) { return "Stand up"; }
        if (_stage == STANDING) { return "Standing"; }
        return "Complete";
    }

    function start() {
        reset();
        _startedAt = Time.now().value();
        _startedMoment = Time.now();
        _stage = RESTING;
        // Onboard (wrist), not SENSOR_HEARTRATE which is the remote strap type.
        Sensor.setEnabledSensors([Sensor.SENSOR_ONBOARD_HEARTRATE]);
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function abort() {
        stopTicker();
        _stage = INTRO;
        reset();
    }

    hidden function stopTicker() {
        if (_timer != null) { _timer.stop(); _timer = null; }
    }

    // Allowed during rest. The baseline then comes from whatever rest data
    // exists, and the result is flagged when there was under 2 min of it.
    //
    // Skipping goes to the PROMPT, not straight to standing: the timing of the
    // transition is the measurement. Jumping to STANDING would start the clock
    // while the user was still lying down, and every delta after it would be
    // measured from the wrong moment.
    function skipToStanding() {
        if (_stage != RESTING) { return; }
        if (_restSeconds < 120) { _baselineUnstable = true; }
        computeBaseline();
        _stage = PROMPT;
        _stageElapsed = 0;
        buzz(3);
    }

    // During standing: compute from the data so far and flag it.
    function finishNow() {
        if (_stage != STANDING) { return; }
        _endedEarly = true;
        complete();
    }

    function onTick() as Void {
        _testElapsed = _testElapsed + 1;
        _stageElapsed = _stageElapsed + 1;

        var info = Sensor.getInfo();
        var hr = (info == null) ? null : info.heartRate;
        if (hr != null) {
            _series.add([_testElapsed, hr]);
            if (hr > _peakHr) { _peakHr = hr; }
            if (_baseline != null) {
                _delta = hr - _baseline;
                if (_delta > _peakDelta) { _peakDelta = _delta; }
            }
        }

        if (_stage == RESTING) {
            _restSeconds = _restSeconds + 1;
            if (_stageElapsed >= RESTING_SEC) {
                computeBaseline();
                _stage = PROMPT;
                _stageElapsed = 0;
                buzz(3);
            }
        } else if (_stage == STANDING) {
            checkSafetyBuzz();
            if (_stageElapsed >= STANDING_SEC) { complete(); }
        }

        WatchUi.requestUpdate();
    }

    function confirmStanding() {
        if (_stage != PROMPT) { return; }
        _stage = STANDING;
        _stageElapsed = 0;
        _standAt = _testElapsed;
    }

    // Supine baseline: mean of the last 2 min of resting.
    hidden function computeBaseline() {
        var from = _testElapsed - 120;
        var sum = 0.0;
        var n = 0;
        for (var i = 0; i < _series.size(); i = i + 1) {
            if (_series[i][0] >= from) {
                sum = sum + _series[i][1];
                n = n + 1;
            }
        }
        if (n > 0) { _baseline = sum / n; }
    }

    // Sustained delta: mean delta over the final minute of standing. This is
    // the number the diagnosis actually rests on — a transient spike on
    // standing is normal, a sustained rise is not.
    hidden function sustainedDelta() {
        if (_baseline == null) { return null; }
        var from = _testElapsed - 60;
        var sum = 0.0;
        var n = 0;
        for (var i = 0; i < _series.size(); i = i + 1) {
            if (_series[i][0] >= from) {
                sum = sum + (_series[i][1] - _baseline);
                n = n + 1;
            }
        }
        if (n == 0) { return null; }
        return sum / n;
    }

    // Safety buzzers with hysteresis, so a HR hovering on a threshold does not
    // buzz every second.
    hidden function checkSafetyBuzz() {
        if (_delta == null) { return; }
        var band = 0;
        if (_delta > 50) { band = 2; }
        else if (_delta >= 30) { band = 1; }
        if (band > _lastBuzz) {
            buzz(band == 2 ? 3 : 2);
            _lastBuzz = band;
        } else if (band < _lastBuzz && _delta < 25) {
            _lastBuzz = band;
        }
    }

    hidden function buzz(times) {
        if (!(Attention has :vibrate)) { return; }
        var pattern = [];
        for (var i = 0; i < times; i = i + 1) {
            pattern.add(new Attention.VibeProfile(80, 250));
            pattern.add(new Attention.VibeProfile(0, 150));
        }
        Attention.vibrate(pattern);
    }

    hidden function complete() {
        stopTicker();
        _stage = COMPLETE;
        var sustained = sustainedDelta();
        // Field names and types match mobile/src/lib/watch/payload.ts exactly:
        // this goes through the same mapStandTestPayload the Apple Watch uses.
        _result = {
            "type" => "standTest",
            "schemaVersion" => Payload.SCHEMA,
            "time" => Payload.isoOf(_startedMoment),
            "baselineHr" => _baseline,
            "peakHr" => _peakHr,
            "peakDelta" => _peakDelta,
            "sustainedDelta" => sustained,
            "standAt" => _standAt,
            // The diagnostic threshold is the SUSTAINED rise, not the peak:
            // a transient spike on standing is normal.
            "metThreshold" => (sustained != null && sustained >= 30),
            "baselineUnstable" => _baselineUnstable,
            "endedEarly" => _endedEarly,
            "device" => "venu4"
        };
        buzz(2);
    }
}
