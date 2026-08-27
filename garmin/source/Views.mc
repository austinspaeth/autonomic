using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.System;
using Toybox.Timer;

// Every screen in the app. Shapes come from Theme, so the pill language is
// declared once rather than repeated per screen.

// ------------------------------------------------------- Stand test

class StandTestView extends WatchUi.View {

    static var _btnTop = 0;

    hidden var _t;
    hidden var _link;

    function initialize(test, link) {
        View.initialize();
        _t = test;
        _link = link;
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
        var smallH = dc.getFontHeight(small);
        var numH = dc.getFontHeight(num);

        var stage = _t.stage();
        // Cleared every frame so a screen that draws no footer button cannot
        // leave a stale threshold behind for the hit test to trust.
        _btnTop = 0;

        // Ring around the face for the timed stages.
        var dur = _t.stageDuration();
        if (dur > 0) {
            var frac = _t.stageElapsed() * 1.0 / dur;
            var col = Theme.ACCENT;
            if (stage == StandTest.RESTING) { col = Theme.BLUE; }
            else if (stage == StandTest.STANDING) { col = Theme.GREEN; }
            Theme.ring(dc, cx, cy, (w / 2) - 9, 9, frac, Theme.TILE, col);
        }

        if (stage == StandTest.INTRO) {
            dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.20, small, "POTS TEST", Graphics.TEXT_JUSTIFY_CENTER);
            var lines = Theme.wrapLines(dc, w * 0.7, small,
                "5 minutes lying, then 10 standing");
            Theme.drawLines(dc, cx, cy - (lines.size() * smallH) / 2, small,
                lines, Theme.INK);
            Theme.pillLabel(dc, cx, h * 0.70, w * 0.44, h * 0.125,
                Theme.ACCENT, Theme.INK, small, "START");
            return;
        }

        if (stage == StandTest.PROMPT) {
            // Its own screen: the only thing that matters now is that the user
            // stands, so the delta and the timer would only compete with it.
            dc.setColor(Theme.ACCENT, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.20, small, "Stand up", Graphics.TEXT_JUSTIFY_CENTER);
            Theme.arrowUp(dc, cx, cy - h * 0.04, h * 0.11, Theme.ACCENT);
            Theme.pillLabel(dc, cx, h * 0.70, w * 0.5, h * 0.125,
                Theme.ACCENT, Theme.INK, small, "I'M STANDING");
            return;
        }

        if (stage == StandTest.COMPLETE) {
            Theme.completion(dc, w, h, cx, cy, small,
                "Check the Autonomic app for details on your results", "DONE");
            return;
        }

        // Live stages. Everything flows from the label with tight gaps: the
        // value used to be positioned by its own fraction of the screen, which
        // left a large dead band under the instruction.
        var gap = h * 0.012;
        var y = h * 0.195;
        dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, y, small, _t.stageName(), Graphics.TEXT_JUSTIFY_CENTER);
        y = y + smallH + gap;

        // "00" rather than a dash: a zero reads as a value not yet moved, where
        // a dash reads as something broken. No "baseline pending" line — the
        // baseline is machinery, and naming it invites the user to wonder
        // whether the test is working.
        var d = _t.delta();
        dc.setColor(d == null ? Theme.DIM : Theme.deltaColor(d), Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, y, num, d == null ? "00" : d.format("%+.0f"),
            Graphics.TEXT_JUSTIFY_CENTER);

        // Pulled UP into the number's own descender space. FONT_NUMBER_HOT
        // carries a lot of internal leading, so flowing off getFontHeight()
        // left a gap that looked deliberate and pushed the timer down near the
        // button.
        var timerY = y + numH - h * 0.055;
        Theme.boldText(dc, cx, timerY, small, Theme.clock(_t.stageElapsed()),
            Graphics.TEXT_JUSTIFY_CENTER, Theme.INK);

        // Secondary actions use the same dark pill as every other button in the
        // app; the outlined variant made them look disabled. Placed off the
        // timer with real breathing room rather than at a fixed fraction, which
        // crowded it.
        var btnY = timerY + smallH + h * 0.06;
        // Published so the hit test uses what was actually drawn. The button
        // moved when the spacing changed and a hard-coded threshold in the
        // delegate would have silently gone stale.
        _btnTop = btnY;
        if (stage == StandTest.RESTING) {
            Theme.pillLabel(dc, cx, btnY, w * 0.4, h * 0.125,
                Theme.CARD, Theme.INK, small, "SKIP");
        } else if (stage == StandTest.STANDING) {
            Theme.pillLabel(dc, cx, btnY, w * 0.4, h * 0.125,
                Theme.CARD, Theme.INK, small, "FINISH");
        }
    }

    hidden function drawLink(dc, cx, y, font) {
        if (!_link.state().equals("sent")) { return; }
        dc.setColor(Theme.GREEN, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, y, font, "synced", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class StandTestDelegate extends WatchUi.BehaviorDelegate {

    hidden var _t;
    hidden var _app;

    function initialize(test, app) {
        BehaviorDelegate.initialize();
        _t = test;
        _app = app;
    }

    function onTap(evt) { return act(evt); }

    // onSelect is deliberately NOT overridden: on a touch Garmin a tap raises
    // it as a behaviour, ahead of onTap, so acting on it would fire the footer
    // button wherever on the screen the user happened to touch. The physical
    // button comes through onKey instead.
    function onKey(evt) {
        var k = evt.getKey();
        if (k == WatchUi.KEY_ENTER || k == WatchUi.KEY_START) { return act(null); }
        return false;
    }

    hidden function act(evt) {
        var stage = _t.stage();
        if (stage == StandTest.INTRO) {
            _t.start();
        } else if (stage == StandTest.PROMPT) {
            _t.confirmStanding();
        } else if (stage == StandTest.RESTING) {
            if (inFooter(evt)) { _t.skipToStanding(); }
        } else if (stage == StandTest.STANDING) {
            if (inFooter(evt)) { _t.finishNow(); }
        } else if (stage == StandTest.COMPLETE) {
            _app.submit(_t.result());
            _app.goHome();
        }
        WatchUi.requestUpdate();
        return true;
    }

    // A null event means the physical button, which is always the footer
    // action for the stage it is pressed in.
    hidden function inFooter(evt) {
        if (evt == null) { return true; }
        if (StandTestView._btnTop <= 0) { return false; }
        return evt.getCoordinates()[1] >= StandTestView._btnTop;
    }

    // Back abandons, but only from a stage where nothing is lost.
    function onBack() {
        if (_t.stage() == StandTest.INTRO || _t.stage() == StandTest.COMPLETE) {
            _app.goHome();
            return true;
        }
        return true;   // swallow: a stray swipe must not bin a running test
    }
}

// -------------------------------------------------------- Episode

class EpisodeView extends WatchUi.View {

    // Button geometry as drawn, for the delegate's hit test.
    static var _btnTop = 0;

    hidden var _e;
    hidden var _link;

    function initialize(ev, link) {
        View.initialize();
        _e = ev;
        _link = link;
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
        var smallH = dc.getFontHeight(small);
        var numH = dc.getFontHeight(num);

        var stage = _e.stage();
        _btnTop = 0;

        if (stage == Orthostatic.COMPLETE) {
            Theme.completion(dc, w, h, cx, cy, small,
                "Check the Autonomic app for details on your results", "DONE");
            return;
        }

        // Only the recovery is timed, so only it gets a ring.
        var dur = _e.stageDuration();
        if (dur > 0) {
            Theme.ring(dc, cx, cy, (w / 2) - 9, 9,
                _e.stageElapsed() * 1.0 / dur, Theme.TILE, Theme.PURPLE);
        }

        if (stage == Orthostatic.INTRO) {
            dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.20, small, "POTS EPISODE",
                Graphics.TEXT_JUSTIFY_CENTER);
            var lines = Theme.wrapLines(dc, w * 0.72, small,
                "First we'll capture your heart rate before the transition.");
            Theme.drawLines(dc, cx, cy - (lines.size() * smallH) / 2, small,
                lines, Theme.INK);
            _btnTop = h * 0.70;
            Theme.pillLabel(dc, cx, _btnTop, w * 0.42, h * 0.125,
                Theme.PURPLE, Theme.INK, small, "START");
            return;
        }

        // Baseline, transition and recovery share one readout: label, live HR,
        // then the single action for that stage.
        var gap = h * 0.012;
        var y = h * 0.185;
        var lines2 = Theme.wrapLines(dc, w * 0.72, small, _e.stageName());
        y = Theme.drawLines(dc, cx, y, small, lines2, Theme.DIM) + gap;

        var hr = _e.lastHr();
        var d = _e.delta();
        dc.setColor(hr == null ? Theme.DIM : Theme.INK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, y, num, hr == null ? "00" : hr.format("%d"),
            Graphics.TEXT_JUSTIFY_CENTER);

        var belowNum = y + numH - h * 0.055;
        if (stage == Orthostatic.RECOVERY) {
            Theme.boldText(dc, cx, belowNum, small,
                Theme.clock(dur - _e.stageElapsed()) + " left",
                Graphics.TEXT_JUSTIFY_CENTER, Theme.INK);
        } else if (d != null) {
            Theme.boldText(dc, cx, belowNum, small,
                (d >= 0 ? "+" : "") + d.format("%.0f"),
                Graphics.TEXT_JUSTIFY_CENTER, Theme.deltaColor(d));
        }

        // Per-stage action. The recovery has none: it ends itself, and the only
        // thing being asked of the user is to keep still.
        var btnY = belowNum + smallH + h * 0.055;
        if (stage == Orthostatic.BASELINE) {
            _btnTop = btnY;
            Theme.pillLabel(dc, cx, btnY, w * 0.42, h * 0.125,
                Theme.CARD, Theme.INK, small, _e.startButton());
        } else if (stage == Orthostatic.DURING) {
            _btnTop = btnY;
            Theme.pillLabel(dc, cx, btnY, w * 0.42, h * 0.125,
                Theme.PURPLE, Theme.INK, small, _e.doneButton());
        }
    }
}

class EpisodeDelegate extends WatchUi.BehaviorDelegate {

    hidden var _e;
    hidden var _app;

    function initialize(ev, app) {
        BehaviorDelegate.initialize();
        _e = ev;
        _app = app;
    }

    // onSelect is deliberately not overridden — a tap raises it as a behaviour
    // ahead of onTap, which would fire the stage's action wherever the user
    // touched. See the same note in HrMonitor and RrView.
    function onKey(evt) {
        var k = evt.getKey();
        if (k == WatchUi.KEY_ENTER || k == WatchUi.KEY_START) { return act(); }
        return false;
    }

    // The gate is "is there a button to miss", not "is there a button".
    // _btnTop is 0 on the completion and recovery screens: completion has a
    // button drawn by the shared helper at a y this view does not know, and
    // recovery has none at all. Bailing out on 0 swallowed the DONE tap and
    // stranded the user on the results screen.
    function onTap(evt) {
        if (EpisodeView._btnTop > 0
            && evt.getCoordinates()[1] < EpisodeView._btnTop) {
            return true;   // a live stage, and this was not the button
        }
        return act();
    }

    hidden function act() {
        var stage = _e.stage();
        if (stage == Orthostatic.INTRO) {
            _e.start();
        } else if (stage == Orthostatic.BASELINE) {
            _e.beginTransition();
        } else if (stage == Orthostatic.DURING) {
            _e.endTransition();
        } else if (stage == Orthostatic.COMPLETE) {
            _app.submit(_e.result());
            _app.goHome();
        }
        WatchUi.requestUpdate();
        return true;
    }

    function onBack() {
        // Complete: leave. Mid-capture: swallowed, so a stray swipe cannot bin
        // a transition the user has already made.
        if (_e.stage() == Orthostatic.COMPLETE) {
            _app.submit(_e.result());
            _app.goHome();
        }
        return true;
    }
}

// ------------------------------------------------- Episode picker
//
// A CustomMenu, for the same reason the home screen is one: three rows of a
// tappable size do not fit a 454px face, and a plain View would clip the last
// of them with no way to reach it.
//
// Choosing a row STARTS the capture. There is no separate Start button because
// there is nothing left to decide once the transition type is chosen, and a
// second tap on a confirmation screen is a step that only exists to be got
// through.

class EpisodeItem extends WatchUi.CustomMenuItem {

    hidden var _title;

    function initialize(id, title) {
        CustomMenuItem.initialize(id, {});
        _title = title;
    }

    function draw(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var pad = w * 0.06;

        Theme.pill(dc, pad, 2, w - pad * 2, h - 4,
            isSelected() ? Theme.CARD : Theme.TILE);

        var font = Graphics.FONT_XTINY;
        Theme.boldText(dc, pad + w * 0.06, (h - dc.getFontHeight(font)) / 2,
            font, _title, Graphics.TEXT_JUSTIFY_LEFT, Theme.INK);
        Theme.chevron(dc, w - pad - w * 0.05, h / 2, h * 0.10, Theme.DIM);
    }
}

class EpisodeTitle extends WatchUi.Drawable {

    function initialize() {
        Drawable.initialize({});
    }

    function draw(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Theme.BG, Theme.BG);
        dc.clear();
        var font = Graphics.FONT_XTINY;
        dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h - dc.getFontHeight(font) - h * 0.05, font,
            "POTS EPISODE", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

// Deliberately blank: it exists purely as scroll headroom under the last row.
class EpisodeFooter extends WatchUi.Drawable {

    function initialize() {
        Drawable.initialize({});
    }

    function draw(dc) {
        dc.setColor(Theme.BG, Theme.BG);
        dc.clear();
    }
}

class EpisodeMenuDelegate extends WatchUi.Menu2InputDelegate {

    hidden var _app;

    function initialize(app) {
        Menu2InputDelegate.initialize();
        _app = app;
    }

    function onSelect(item) {
        _app.startEpisode(item.getId());
    }
}

module EpisodeMenu {

    function menu(deviceHeight) {
        var m = new WatchUi.CustomMenu(
            (deviceHeight * 0.21).toNumber(),
            Theme.BG,
            {
                :title => new EpisodeTitle(),
                // A tall empty footer is what lets the LAST row scroll up into
                // the middle of the face. Without it the list stops with the
                // final item pinned to the bottom, where the round bezel eats
                // its edges and it is awkward to hit.
                :footer => new EpisodeFooter(),
                :footerItemHeight => (deviceHeight * 0.30).toNumber()
            }
        );
        for (var i = 0; i < Orthostatic.TYPES.size(); i = i + 1) {
            m.addItem(new EpisodeItem(i, Orthostatic.TYPES[i][1]));
        }
        return m;
    }
}
