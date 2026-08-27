using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;
using Toybox.Timer;
using Toybox.Lang;

class RrView extends WatchUi.View {

    // Geometry of the button as actually drawn, for the delegate's hit test.
    static var _btnTop = 0;

    hidden var _c;
    hidden var _link;
    hidden var _app;
    hidden var _timer;

    function initialize(app, collector, link) {
        View.initialize();
        _app = app;
        _c = collector;
        _link = link;
    }

    hidden var _fast = false;

    function onShow() {
        // Drives the elapsed clock; sensor callbacks drive everything else.
        _timer = new Timer.Timer();
        retime(false);
    }

    // The waiting dots need ~4 fps; the countdown needs 1. Runs fast only while
    // waiting for the lock, which is seconds, so the redraws cost nothing over
    // a five minute reading.
    hidden function retime(fast) {
        if (_timer == null) { return; }
        _timer.stop();
        _fast = fast;
        _timer.start(method(:onTick), fast ? 250 : 1000, true);
    }

    function onHide() {
        if (_timer != null) { _timer.stop(); _timer = null; }
    }

    function onTick() as Void {
        var wantFast = _c.isRunning() && !_c.hasLock();
        if (wantFast != _fast) { retime(wantFast); }
        // The reading ends itself at five minutes, exactly as the phone session
        // does. Leaving it to the user would produce readings of assorted
        // lengths that are not comparable with each other or with a strap.
        if (_c.isRunning() && _c.isComplete()) {
            _c.stop();
            if (_c.worthSending()) { _app.submit(_c.payload()); }
        }
        WatchUi.requestUpdate();
    }

    hidden function fmtClock(sec) {
        var m = sec / 60;
        var s = sec % 60;
        return m.format("%d") + ":" + s.format("%02d");
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

        if (_c.error() != null) {
            dc.setColor(Theme.ACCENT, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.42, small, "ERROR", Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(cx, h * 0.50, small, _c.error(), Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        var running = _c.isRunning();
        var done = !running && _c.hasResult();

        if (done) {
            _btnTop = 0;   // nothing is running: a tap anywhere may leave
            Theme.completion(dc, w, h, cx, cy, small,
                "Open Autonomic on your phone for details", "BACK");
            return;
        }


        // The ring IS the timer: it fills as the five minutes run down, so the
        // reading's progress is legible from across a room without reading the
        // digits. Nothing else on this screen moves.
        Theme.ring(dc, cx, cy, (w / 2) - 9, 9,
            running || done ? _c.progress() : 0,
            Theme.TILE, done ? Theme.GREEN : Theme.ACCENT);

        // Everything hangs off the countdown, which is centred on the face.
        // Laying it out top-down instead left the whole group sitting low.
        var numH = dc.getFontHeight(num);
        var smallH = dc.getFontHeight(small);
        var numY = cy - numH / 2;
        // One gap, used above and below, so the three elements are evenly spaced
        // around the centred timer.
        var gap = h * 0.03;

        // No heart rate, no BPM, no interval count, no HRV figures. None of it
        // is computed on the watch — the phone does every calculation from the
        // raw intervals — so a number here would be either a duplicate of the
        // watch face or a claim the app cannot back up.
        // The duration is already the biggest thing on the screen, so naming it
        // here said the same number twice.
        //
        // Before the sensor locks there is no countdown to show: the clock has
        // not started. Saying so is better than running a timer over a reading
        // that is capturing nothing, which is precisely how an empty reading
        // used to reach the phone.
        var label = "HRV Reading";
        var labelColor = Theme.DIM;
        if (running && !_c.hasLock()) {
            label = _c.lockTimedOut() ? "No signal yet" : "Getting a signal";
            labelColor = _c.lockTimedOut() ? Theme.AMBER : Theme.DIM;
        } else if (running) {
            label = "Be still";
        } else if (done) {
            label = "Complete";
            labelColor = Theme.GREEN;
        }
        dc.setColor(labelColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, numY - smallH - gap, small, label,
            Graphics.TEXT_JUSTIFY_CENTER);


        // Counting DOWN: the question during a reading is "how much longer",
        // not "how long so far".
        // Waiting for the sensor: cycling dots where the countdown will be. A
        // clock that has not started must not look like one that has, and a
        // frozen placeholder looks like a fault.
        if (running && !_c.hasLock()) {
            Theme.loadingDots(dc, cx, numY + numH / 2, h * 0.016,
                Theme.TILE, Theme.DIM);
        } else {
            dc.setColor(Theme.INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, numY, num,
                done ? Theme.clock(_c.measuredSec()) : Theme.clock(_c.remainingSec()),
                Graphics.TEXT_JUSTIFY_CENTER);
        }

        // While waiting for the lock, show the pulse the sensor DOES see.
        // Without it "Getting a signal" is unfalsifiable: a watch sitting on a
        // desk and a watch that simply has not produced intervals yet look
        // identical. A number here means the sensor has contact; no number
        // means it does not, and the fix is the strap, not patience.
        if (running && !_c.hasLock()) {
            var hr = _c.lastHr();
            dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, numY + numH - h * 0.045, small,
                hr == null ? "no pulse detected" : hr.format("%d") + " bpm",
                Graphics.TEXT_JUSTIFY_CENTER);

        }

        var btnY = numY + numH + gap;
        _btnTop = btnY;
        Theme.pillLabel(dc, cx, btnY, w * 0.44, h * 0.125,
            running ? Theme.CARD : Theme.ACCENT, Theme.INK, small,
            running ? "FINISH EARLY" : "START");

        // Only success is reported. A reading that has not gone out yet is
        // safely queued on the watch and retried automatically — there is
        // nothing the user can do about it, so saying so would be worry
        // without an action.
        if (_link.state().equals("sent")) {
            dc.setColor(Theme.GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, btnY + h * 0.125 + h * 0.015, small, "synced",
                Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

}

class RrDelegate extends WatchUi.BehaviorDelegate {

    hidden var _c;
    hidden var _link;

    hidden var _app;

    function initialize(app, collector, link) {
        BehaviorDelegate.initialize();
        _app = app;
        _c = collector;
        _link = link;
    }

    hidden function toggle() {
        if (_c.isRunning()) {
            _c.stop();
            // A reading with too few beats is not sent at all. The phone would
            // refuse it, and an unsendable reading in the outbox is a retry
            // loop that costs battery and can never succeed.
            if (_c.worthSending()) { _app.submit(_c.payload()); }
        } else if (_c.hasResult()) {
            // Finished: the only action left is leaving. Starting another
            // reading from here would silently discard the one on screen.
            _c.reset();
            _app.goHome();
        } else {
            _c.start();
        }
        WatchUi.requestUpdate();
        return true;
    }

    // onSelect is deliberately NOT overridden. On a touch Garmin a tap raises
    // it as a behaviour ahead of onTap, so acting on it would let any stray
    // touch — a sleeve, a coat cuff — finish a reading five minutes in. The
    // physical button comes through onKey.
    function onKey(evt) {
        var k = evt.getKey();
        if (k == WatchUi.KEY_ENTER || k == WatchUi.KEY_START) { return toggle(); }
        return false;
    }

    // While a reading runs, only a tap on the button itself counts — a touch
    // anywhere else is swallowed. Once it has finished, _btnTop is cleared and
    // a tap anywhere leaves, because there is nothing left to lose.
    function onTap(evt) {
        if (_c.isRunning() && RrView._btnTop > 0
            && evt.getCoordinates()[1] < RrView._btnTop) {
            return true;
        }
        return toggle();
    }

    function onBack() {
        if (_c.isRunning()) {
            // A stray swipe must not bin a reading in progress: back FINISHES
            // it, which is the same thing the button does.
            _c.stop();
            if (_c.worthSending()) { _app.submit(_c.payload()); }
            WatchUi.requestUpdate();
            return true;
        }
        _c.reset();
        _app.goHome();
        return true;
    }
}
