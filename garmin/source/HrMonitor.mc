using Toybox.Sensor;
using Toybox.System;
using Toybox.Timer;
using Toybox.Attention;
using Toybox.Activity;
using Toybox.WatchUi;
using Toybox.Graphics;

// Free live HR monitor — the Connect IQ twin of HrMonitorView.swift.
//
// Delta compares the current HR against a rolling 2-minute average ("how far
// above what my heart rate had been sitting at"), not against a resting
// baseline, so it means something in the middle of a session.
//
// STAYING AWAKE: an ordinary watch app is subject to the device's backlight
// timeout, and `Attention.backlight()` cannot override it — the API explicitly
// respects the device setting. The mechanism that does work is recording an
// ACTIVITY: that puts the watch into activity mode, keeps this app in the
// foreground, and follows the activity display settings instead of the short
// watch-face timeout. It is the same trick the Apple Watch companion plays with
// HKWorkoutSession, and for the same reason.
//
// Signal handling follows the Apple Watch rule: the last good HR is HELD on
// screen. Before the first ever reading the value shows a grey "00"; once a
// reading lands it takes its live colour, and a later dropout greys it rather
// than zeroing it. A fabricated zero would read as a real measurement.
class HrMonitor {

    const AVG_WINDOW_SEC = 120;

    hidden var _running;
    hidden var _timer;
    hidden var _window;      // [[t, hr], ...] trailing 2 min
    hidden var _elapsed;
    hidden var _displayHr;   // held through signal loss
    hidden var _everHadReading;
    hidden var _signalLost;
    hidden var _missSec;
    hidden var _avg;
    hidden var _delta;
    hidden var _lastBuzz;

    function initialize() {
        _running = false;
        reset();
    }

    hidden function reset() {
        _window = [];
        _elapsed = 0;
        _displayHr = null;
        _everHadReading = false;
        _signalLost = false;
        _missSec = 0;
        _avg = null;
        _delta = null;
        _lastBuzz = 0;
    }

    function isRunning() { return _running; }
    function displayHr() { return _displayHr; }
    function everHadReading() { return _everHadReading; }
    function signalLost() { return _signalLost; }
    function avg() { return _avg; }
    function delta() { return _delta; }
    function elapsed() { return _elapsed; }


    function start() {
        if (_running) { return; }
        reset();
        _running = true;
        // Onboard (wrist), not SENSOR_HEARTRATE which is the remote strap type.
        Sensor.setEnabledSensors([Sensor.SENSOR_ONBOARD_HEARTRATE]);


        _timer = new Timer.Timer();
        _timer.start(method(:onTick), 1000, true);
    }

    function stop() {
        if (!_running) { return; }
        _running = false;
        if (_timer != null) { _timer.stop(); _timer = null; }
    }

    function onTick() as Void {
        _elapsed = _elapsed + 1;

        var info = Sensor.getInfo();
        var hr = (info == null) ? null : info.heartRate;

        if (hr != null) {
            _displayHr = hr;
            _everHadReading = true;
            _signalLost = false;
            _missSec = 0;
            _window.add([_elapsed, hr]);
            trimWindow();
            recompute();
            checkBuzz();
        } else if (_everHadReading) {
            // Grace period before greying out, so a single dropped sample does
            // not flicker the whole readout.
            _missSec = _missSec + 1;
            if (_missSec >= 5) { _signalLost = true; }
        }

        WatchUi.requestUpdate();
    }

    hidden function trimWindow() {
        var from = _elapsed - AVG_WINDOW_SEC;
        while (_window.size() > 0 && _window[0][0] < from) {
            _window = _window.slice(1, _window.size());
        }
    }

    hidden function recompute() {
        if (_window.size() == 0) { return; }
        var sum = 0.0;
        for (var i = 0; i < _window.size(); i = i + 1) {
            sum = sum + _window[i][1];
        }
        _avg = sum / _window.size();
        if (_displayHr != null) { _delta = _displayHr - _avg; }
    }

    // A delta hovering on a boundary must not buzz every second.
    hidden function checkBuzz() {
        if (_delta == null) { return; }
        var band = 0;
        if (_delta > 50) { band = 2; }
        else if (_delta >= 30) { band = 1; }
        if (band > _lastBuzz) {
            if (Attention has :vibrate) {
                var pattern = [];
                for (var i = 0; i < (band == 2 ? 3 : 2); i = i + 1) {
                    pattern.add(new Attention.VibeProfile(80, 250));
                    pattern.add(new Attention.VibeProfile(0, 150));
                }
                Attention.vibrate(pattern);
            }
            _lastBuzz = band;
        } else if (band < _lastBuzz && _delta < 25) {
            _lastBuzz = band;
        }
    }
}

class HrMonitorView extends WatchUi.View {

    hidden var _m;

    function initialize(monitor) {
        View.initialize();
        _m = monitor;
    }

    function onShow() {
        if (!_m.isRunning()) { _m.start(); }
    }

    function onUpdate(dc) {
        dc.setColor(Theme.BG, Theme.BG);
        dc.clear();

        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        var cy = h / 2;
        var small = Graphics.FONT_XTINY;
        var num = Graphics.FONT_NUMBER_HOT;

        dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 0.16, small, "HR MONITOR", Graphics.TEXT_JUSTIFY_CENTER);

        // No heart icon: it carried no information the number did not already
        // give, and it was the only thing on the screen competing with it.
        //
        // Held value: grey until the first reading, grey again if contact is
        // lost, never zeroed. A fabricated zero would read as a measurement.
        var hr = _m.displayHr();
        var live = hr != null && !_m.signalLost();

        var numH = dc.getFontHeight(num);
        var smallH = dc.getFontHeight(small);

        // BPM tucks directly under the digits — the two are one readout, and a
        // gap between them made the unit look like a separate label.
        var block = numH + smallH * 0.62;
        var top = cy - block / 2;

        dc.setColor(live ? Theme.INK : Theme.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, top, num, hr == null ? "00" : hr.format("%d"),
            Graphics.TEXT_JUSTIFY_CENTER);
        Theme.boldText(dc, cx, top + numH - smallH * 0.38, small, "BPM",
            Graphics.TEXT_JUSTIFY_CENTER, Theme.DIM);

        // Average and delta flank the value rather than sitting under it: they
        // are context for that number, and on a round face the widest usable
        // band is the one running through the centre.
        var a = _m.avg();
        var d = _m.delta();
        var colY = cy - smallH;
        stat(dc, cx - w * 0.335, colY, small, smallH, "Avg",
            a == null ? "00" : a.format("%.0f"),
            a == null ? Theme.DIM : Theme.INK);
        stat(dc, cx + w * 0.335, colY, small, smallH, "Delta",
            d == null ? "0" : (d >= 0 ? "+" : "") + d.format("%.0f"),
            d == null ? Theme.DIM : Theme.deltaColor(d));

        // Ending needs a HOLD, not a tap. The monitor is meant to run for a
        // long time on a moving wrist, and a single stray touch ending it would
        // silently stop the thing the user is relying on. The label carries the
        // instruction so the gesture needs no discovering.
        Theme.pillLabel(dc, cx, h * 0.775, w * 0.4, h * 0.125,
            Theme.CARD, Theme.INK, small, "HOLD TO END");
    }


    // A flanking stat: dim label over its value, centred on x. No pill — a
    // filled container either side of the readout crowded it.
    hidden function stat(dc, x, y, font, lh, label, value, valueColor) {
        dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, font, label, Graphics.TEXT_JUSTIFY_CENTER);
        Theme.boldText(dc, x, y + lh * 0.92, font, value,
            Graphics.TEXT_JUSTIFY_CENTER, valueColor);
    }

}

class HrMonitorDelegate extends WatchUi.BehaviorDelegate {

    hidden var _m;
    hidden var _app;

    function initialize(monitor, app) {
        BehaviorDelegate.initialize();
        _m = monitor;
        _app = app;
    }

    // A hold ends it. The system decides what counts as a hold, which is the
    // right threshold to inherit rather than invent.
    function onHold(evt) { return end(); }

    // A tap deliberately does nothing. Swallowed rather than ignored, so it
    // cannot fall through to some other handler and end the session anyway.
    function onTap(evt) { return true; }

    // onSelect is NOT overridden, and that is load-bearing.
    //
    // On a touch Garmin a screen tap raises onSelect() as a BEHAVIOR, and
    // behaviours are dispatched ahead of the raw onTap(). An onSelect that
    // ended the session therefore made every stray tap end it, no matter what
    // onTap did. Leaving it to the default lets the event fall through: a tap
    // reaches onTap (swallowed), a button press reaches onKey below.

    // The physical button is a real press, not a sleeve against the screen, so
    // it ends directly — and it is the escape route if a hold is ever not
    // delivered on some device.
    function onKey(evt) {
        var k = evt.getKey();
        if (k == WatchUi.KEY_ENTER || k == WatchUi.KEY_START) { return end(); }
        return false;
    }

    hidden function end() {
        // Confirm the gesture landed: a hold with no feedback leaves the user
        // holding on, unsure whether it took.
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(60, 200)]);
        }
        _m.stop();
        _app.goHome();
        return true;
    }

    function onBack() { return end(); }
}
