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
        // The collector watches the sensor and says when the reading cannot
        // go on: a feed that produced nothing for over a minute is stopped
        // here, with the user told, instead of spinning until they give up.
        var why = _c.tick();
        if (why != null) {
            _app.finishReading(why);
        } else if (_c.isRunning() && _c.isComplete()) {
            // The reading ends itself at five minutes, exactly as the phone
            // session does. Leaving it to the user would produce readings of
            // assorted lengths that are not comparable with each other or
            // with a strap.
            _app.finishReading("complete");
        }
        WatchUi.requestUpdate();
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

        if (done && !_c.worthSending()) {
            // Nothing went to the phone. Saying "Complete, open Autonomic for
            // details" here — which this screen used to do — sent the user to
            // a phone with nothing on it. Say what happened and what to do.
            drawFailure(dc, w, h, cx, cy, small);
            return;
        }

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
            running ? _c.progress() : 0,
            Theme.TILE, Theme.ACCENT);

        // Everything hangs off the countdown, which is centred on the face.
        var numH = dc.getFontHeight(num);
        var smallH = dc.getFontHeight(small);
        var numY = cy - numH / 2;
        var gap = h * 0.03;

        // No heart rate, no BPM, no interval count, no HRV figures. None of it
        // is computed on the watch — the phone does every calculation from the
        // raw intervals — so a number here would be either a duplicate of the
        // watch face or a claim the app cannot back up.
        //
        // Before the sensor locks there is no countdown to show: the clock has
        // not started. Saying so is better than running a timer over a reading
        // that is capturing nothing, which is precisely how an empty reading
        // used to reach the phone.
        var label = "HRV Reading";
        var labelColor = Theme.DIM;
        if (running && !_c.hasLock()) {
            // Past the timeout the app is re-arming the sensor on the user's
            // behalf (RrCollector.tick), so "Still trying" is literally true,
            // where "No signal yet" read as the app having given up.
            label = _c.lockTimedOut() ? "Still trying" : "Getting a signal";
            labelColor = _c.lockTimedOut() ? Theme.AMBER : Theme.DIM;
        } else if (running) {
            label = "Be still";
        }
        dc.setColor(labelColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, numY - smallH - gap, small, label,
            Graphics.TEXT_JUSTIFY_CENTER);

        // Counting DOWN: the question during a reading is "how much longer",
        // not "how long so far". Waiting for the sensor: cycling dots where the
        // countdown will be. A clock that has not started must not look like
        // one that has, and a frozen placeholder looks like a fault.
        if (running && !_c.hasLock()) {
            Theme.loadingDots(dc, cx, numY + numH / 2, h * 0.016,
                Theme.TILE, Theme.DIM);
        } else {
            dc.setColor(Theme.INK, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, numY, num, Theme.clock(_c.remainingSec()),
                Graphics.TEXT_JUSTIFY_CENTER);
        }

        // While waiting for the lock, show the pulse the sensor DOES see.
        // Without it "Getting a signal" is unfalsifiable: a watch sitting on a
        // desk and a watch that simply has not produced intervals yet look
        // identical. A number here means the sensor has contact; no number
        // means it does not, and the fix is the fit of the band, not patience.
        // Floor for the button, raised by whatever is drawn between it and the
        // timer: the fonts do not shrink in step with the screen, so a gap that
        // merely looks tight on a 454px Venu is a genuine overlap on a 176px
        // Instinct.
        var floor = 0;

        if (running && !_c.hasLock()) {
            var hr = _c.lastHr();
            var hrY = numY + numH - h * 0.045;
            dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, hrY, small,
                hr == null ? "no pulse detected" : hr.format("%d") + " bpm",
                Graphics.TEXT_JUSTIFY_CENTER);
            floor = hrY + smallH;
        }

        var btnY = numY + numH + gap;
        if (btnY < floor) { btnY = floor; }
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

    // A reading that ended with nothing to send. Two different problems look
    // identical from the spinner and need different fixes, so the sentence
    // depends on whether the sensor ever saw a pulse at all: no pulse is
    // contact (or wrist heart rate switched off in the watch's own settings),
    // a pulse with no beats is the sensor's fast mode not engaging, which a
    // fresh start — or a snugger band — usually fixes.
    hidden function drawFailure(dc, w, h, cx, cy, font) {
        Theme.ring(dc, cx, cy, (w / 2) - 9, 9, 0, Theme.TILE, Theme.AMBER);

        var lh = dc.getFontHeight(font);
        var btnH = h * 0.125;
        var gapA = h * 0.035;
        var gapB = h * 0.04;

        var message;
        if (_c.lastHr() == null) {
            message = "No pulse found. Snug the band a finger above the wrist bone and check Wrist Heart Rate is on in the watch settings.";
        } else if (_c.hasLock()) {
            message = "Too little signal to use. Keep the arm still and resting, then try again.";
        } else {
            message = "A pulse, but no beats. Snug the band one notch and try again. If it repeats, close and reopen the app.";
        }

        var lines = Theme.wrapLines(dc, w * 0.74, font, message);
        var total = lh + gapA + (lines.size() * lh) + gapB + btnH;
        var top = cy - total / 2;

        Theme.boldText(dc, cx, top, font, "No signal",
            Graphics.TEXT_JUSTIFY_CENTER, Theme.AMBER);
        var after = Theme.drawLines(dc, cx, top + lh + gapA, font, lines, Theme.DIM);
        _btnTop = after + gapB;
        Theme.pillLabel(dc, cx, _btnTop, w * 0.4, btnH, Theme.ACCENT, Theme.INK,
            font, "TRY AGAIN");
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
            _app.finishReading(_c.hasLock() ? "user-short" : "user-nolock");
        } else if (_c.hasResult() && !_c.worthSending()) {
            // Failed: the button is TRY AGAIN, and the retry is a fresh
            // reading — new session, new clock, re-arm budget restored.
            _c.reset();
            _c.start();
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

    // While a reading runs, or a failure is showing its TRY AGAIN, only a tap
    // on the button itself counts — a touch anywhere else is swallowed. Once a
    // reading has finished and gone out, _btnTop is cleared and a tap anywhere
    // leaves, because there is nothing left to lose.
    function onTap(evt) {
        var guarded = _c.isRunning() || (_c.hasResult() && !_c.worthSending());
        if (guarded && RrView._btnTop > 0
            && evt.getCoordinates()[1] < RrView._btnTop) {
            return true;
        }
        return toggle();
    }

    function onBack() {
        if (_c.isRunning()) {
            // A stray swipe must not bin a reading in progress: back FINISHES
            // it, which is the same thing the button does.
            _app.finishReading(_c.hasLock() ? "user-short" : "user-nolock");
            return true;
        }
        _c.reset();
        _app.goHome();
        return true;
    }
}
