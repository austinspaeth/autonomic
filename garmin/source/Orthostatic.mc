using Toybox.Sensor;
using Toybox.Timer;
using Toybox.Time;
using Toybox.Attention;
using Toybox.WatchUi;

// Orthostatic-event capture — the lighter cousin of the stand test, for one-off
// transitions. Port of the Apple Watch's OrthostaticController.
//
//   picker -> intro -> baseline -> during (the transition; a tap ends it)
//          -> recovery (60s) -> complete
//
// The baseline is the mean HR over the LAST 30 s of the baseline stage: the
// rate the user actually transitioned FROM, not the settling period right after
// they opened the flow. Result maps onto the app's existing `orthostatic`
// reading type (transition / beforeHr / afterHr / hr1min).
class Orthostatic {

    enum { INTRO, BASELINE, DURING, RECOVERY, COMPLETE }

    const RECOVERY_SEC = 60;

    // id, list title, the phone's `transition` option, start button, done
    // button, subtitle while the transition is underway. The last three are
    // per-type because "Done climbing" and "I'm upright" describe genuinely
    // different acts — a generic "Done" would leave the user guessing what the
    // watch thinks they are doing.
    static const TYPES = [
        ["stairs",     "Stairs",       "Climbing stairs",
         "Start climbing",   "Done climbing", "Climbing stairs"],
        ["sitToStand", "Sit to stand", "Sitting to standing",
         "Start getting up", "I'm upright",   "Standing up"],
        ["layToStand", "Lay to stand", "Laying to standing",
         "Start getting up", "I'm upright",   "Standing up"]
    ];

    hidden var _stage;
    hidden var _typeIndex;
    hidden var _stageElapsed;
    hidden var _series;
    hidden var _timer;
    hidden var _startedAt;
    hidden var _startedMoment;
    hidden var _baseline;
    hidden var _afterHr;
    hidden var _hr1min;
    hidden var _delta;
    hidden var _lastHr;
    hidden var _result;

    function initialize() {
        _stage = INTRO;
        _typeIndex = 0;
        _series = [];
        reset();
    }

    hidden function reset() {
        _stageElapsed = 0;
        _series = [];
        _baseline = null;
        _afterHr = null;
        _hr1min = null;
        _delta = null;
        _lastHr = null;
        _result = null;
    }

    function stage() { return _stage; }
    function stageElapsed() { return _stageElapsed; }
    function delta() { return _delta; }
    function baseline() { return _baseline; }
    function lastHr() { return _lastHr; }
    function result() { return _result; }
    function typeIndex() { return _typeIndex; }
    function typeTitle() { return TYPES[_typeIndex][1]; }
    function startButton() { return TYPES[_typeIndex][3]; }
    function doneButton() { return TYPES[_typeIndex][4]; }
    function duringSubtitle() { return TYPES[_typeIndex][5]; }

    // Chosen from the list, not cycled: a user picking "stairs" should not
    // have to tap past two other options to reach it.
    function setType(i) {
        if (i < 0 || i >= TYPES.size()) { return; }
        _typeIndex = i;
    }

    function stageName() {
        if (_stage == BASELINE) { return "Capturing resting HR"; }
        if (_stage == DURING) { return duringSubtitle(); }
        if (_stage == RECOVERY) { return "Be still"; }
        return typeTitle();
    }

    // Only the recovery is timed. The baseline and the transition itself both
    // wait on the person: a countdown over "start climbing" would either rush
    // someone who is bracing for it, or start the clock before they moved.
    function stageDuration() {
        if (_stage == RECOVERY) { return RECOVERY_SEC; }
        return 0;
    }

    // Reset back to the instructions, for a freshly chosen transition type.
    function arm(i) {
        if (_timer != null) { _timer.stop(); _timer = null; }
        setType(i);
        reset();
        _stage = INTRO;
    }

    function start() {
        reset();
        _startedAt = Time.now().value();
        _startedMoment = Time.now();
        _stage = BASELINE;
        // Onboard (wrist), not SENSOR_HEARTRATE which is the remote strap type.
        Sensor.setEnabledSensors([Sensor.SENSOR_ONBOARD_HEARTRATE]);
        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function abort() {
        if (_timer != null) { _timer.stop(); _timer = null; }
        reset();
        _stage = INTRO;
    }

    // Baseline -> the transition itself. The user says when they move, so the
    // baseline is however long they actually sat still for.
    function beginTransition() {
        if (_stage != BASELINE) { return; }
        computeBaseline();
        _stage = DURING;
        _stageElapsed = 0;
        buzz(1);
    }

    // The user taps when the transition is done.
    function endTransition() {
        if (_stage != DURING) { return; }
        _afterHr = _lastHr;
        _stage = RECOVERY;
        _stageElapsed = 0;
    }

    function onTick() as Void {
        _stageElapsed = _stageElapsed + 1;

        var info = Sensor.getInfo();
        var hr = (info == null) ? null : info.heartRate;
        if (hr != null) {
            _lastHr = hr;
            _series.add([_stage, _stageElapsed, hr]);
            if (_baseline != null) { _delta = hr - _baseline; }
        }

        if (_stage == RECOVERY) {
            if (_stageElapsed >= RECOVERY_SEC) {
                _hr1min = _lastHr;
                complete();
            }
        }

        WatchUi.requestUpdate();
    }

    // Mean over the LAST 30 s of baseline only.
    hidden function computeBaseline() {
        var sum = 0.0;
        var n = 0;
        for (var i = 0; i < _series.size(); i = i + 1) {
            if (_series[i][0] == BASELINE && _series[i][1] > _stageElapsed - 30) {
                sum = sum + _series[i][2];
                n = n + 1;
            }
        }
        if (n > 0) { _baseline = sum / n; }
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
        if (_timer != null) { _timer.stop(); _timer = null; }
        _stage = COMPLETE;
        _result = {
            "type" => "orthostatic",
            "schemaVersion" => Payload.SCHEMA,
            "time" => Payload.isoOf(_startedMoment),
            "transition" => TYPES[_typeIndex][2],
            "beforeHr" => _baseline,
            "afterHr" => _afterHr,
            "hr1min" => _hr1min,
            "device" => "venu4"
        };
        buzz(2);
    }
}
