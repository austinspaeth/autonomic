using Toybox.Graphics;
using Toybox.Math;
using Toybox.System;
using Toybox.WatchUi;

// Design tokens ported from the Apple Watch app's DesignSystem.swift so the
// two companions read as the same product. Colours are the same hex values.
//
// The shape language is deliberately DIFFERENT from the Apple Watch's rounded
// rectangles: everything here is a full pill (corner radius = half the height)
// or a circle. On a 454px round AMOLED the corners are unusable anyway, so a
// pill echoes the bezel instead of fighting it.
module Theme {


    const ACCENT   = 0xe03127;   // red — primary action, high delta
    const BLUE     = 0x4aa3f0;
    const AMBER    = 0xe0a030;   // caution delta
    const GREEN    = 0x3ec46d;   // healthy delta
    const PURPLE   = 0x9d6bf5;   // orthostatic events
    const CARD     = 0x161618;
    const TILE     = 0x131315;
    const DIM      = 0x8a8a92;
    const INK      = 0xffffff;
    const BG       = 0x000000;

    // Shared delta colour rule, identical to DS.deltaColor:
    // <20 green - 20..29 amber - >=30 red.
    function deltaColor(delta) {
        if (delta >= 30) { return ACCENT; }
        if (delta >= 20) { return AMBER; }
        return GREEN;
    }

    // A pill: radius is always half the height, so it can never read as a
    // rounded rectangle no matter what width it is given.
    function pill(dc, x, y, w, h, color) {
        var r = h / 2;
        if (r > w / 2) { r = w / 2; }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y, w, h, r);
    }

    // Pill with a centred label. The `w` passed in is a MINIMUM: the pill
    // grows to fit its text plus padding, so a longer label can never spill
    // outside its own bounds. Callers sizing buttons by a fraction of the
    // screen were silently relying on their labels being short.
    //
    // The label is always bold: it is the one thing on the screen that can be
    // pressed, and it should not read at the same weight as a caption.
    function pillLabel(dc, cx, y, w, h, fill, ink, font, text) {
        var needed = dc.getTextWidthInPixels(text, font) + h * 1.1;
        if (needed > w) { w = needed; }
        pill(dc, cx - w / 2, y, w, h, fill);
        boldText(dc, cx, y + (h - dc.getFontHeight(font)) / 2, font, text,
            Graphics.TEXT_JUSTIFY_CENTER, ink);
        return y + h;
    }

    // Outlined pill, for secondary actions that must not compete with the
    // primary. Drawn as a filled pill under a background-coloured inset.
    function pillOutline(dc, cx, y, w, h, color, ink, font, text) {
        pill(dc, cx - w / 2, y, w, h, color);
        pill(dc, cx - w / 2 + 2, y + 2, w - 4, h - 4, BG);
        dc.setColor(ink, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, y + (h - dc.getFontHeight(font)) / 2, font, text,
            Graphics.TEXT_JUSTIFY_CENTER);
        return y + h;
    }

    // A row on the home screen: full-width pill, label left, chevron right.
    function row(dc, cx, y, w, h, fill, ink, font, text, locked) {
        pill(dc, cx - w / 2, y, w, h, fill);
        dc.setColor(ink, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx - w / 2 + h * 0.42, y + (h - dc.getFontHeight(font)) / 2,
            font, text, Graphics.TEXT_JUSTIFY_LEFT);
        chevron(dc, cx + w / 2 - h * 0.44, y + h / 2, h * 0.12,
            locked ? DIM : ink);
        return y + h;
    }

    // A drawn chevron rather than a ">" glyph. The text form is a typographic
    // character with its own baseline and side bearings, so it sits off-centre
    // in a pill and reads as punctuation; two strokes read as an affordance.
    function chevron(dc, x, cy, size, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);
        dc.drawLine(x - size * 0.5, cy - size, x + size * 0.5, cy);
        dc.drawLine(x + size * 0.5, cy, x - size * 0.5, cy + size);
        dc.setPenWidth(1);
    }

    // Faux-bold: Connect IQ ships no bold system face, so the glyphs are drawn
    // twice a pixel apart. Cheaper and sharper than bundling a custom bitmap
    // font purely for one word.
    function boldText(dc, x, y, font, text, justify, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, font, text, justify);
        dc.drawText(x + 1, y, font, text, justify);
    }

    // Circular progress ring, used by the stand test's stage timer. Drawn with
    // arcs rather than a bitmap so it costs no resource memory.
    function ring(dc, cx, cy, radius, thickness, fraction, track, color) {
        dc.setPenWidth(thickness);
        dc.setColor(track, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, radius);
        if (fraction <= 0) { dc.setPenWidth(1); return; }
        if (fraction > 1.0) { fraction = 1.0; }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        // Degrees run counter-clockwise from 3 o'clock; start at 12.
        var end = 90 - (360 * fraction);
        dc.drawArc(cx, cy, radius, Graphics.ARC_CLOCKWISE, 90, end);
        dc.setPenWidth(1);
    }

    // A tint at low intensity, for an icon's circular backing. Connect IQ has
    // no alpha, so the blend against black is done arithmetically.
    function soft(color) {
        var r = (((color >> 16) & 0xff) * 18) / 100;
        var g = (((color >> 8) & 0xff) * 18) / 100;
        var b = ((color & 0xff) * 18) / 100;
        return (r << 16) | (g << 8) | b;
    }

    // Round icon badge: tinted disc with a glyph on it. Round, not a rounded
    // square as on the Apple Watch — the whole shape language here is circular
    // because the screen is.
    function iconDisc(dc, cx, cy, r, tint) {
        dc.setColor(soft(tint), Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r);
    }

    // Glyphs are drawn, not bundled: these three are simple enough that
    // primitives cost nothing and stay sharp at any size.
    // The heart is a BITMAP, not a polygon.
    //
    // It was drawn as a 40-segment polygon and still read as jagged, because
    // Connect IQ does not anti-alias primitives at all — more facets cannot fix
    // a hard-edged fill. A PNG carries its own alpha, so the edge stays smooth
    // at any size, and drawScaledBitmap lets one asset per colour serve every
    // size the app draws it at.
    //
    // Two colours are baked because Connect IQ cannot tint a bitmap: live
    // (accent) and held/no-signal (dim). Those are the only two states the
    // heart has anywhere in the app.
    var _heart = null;
    var _heartDim = null;

    function heart(dc, cx, cy, r, color) {
        var bmp;
        if (color == DIM) {
            if (_heartDim == null) { _heartDim = WatchUi.loadResource(Rez.Drawables.HeartDim); }
            bmp = _heartDim;
        } else {
            if (_heart == null) { _heart = WatchUi.loadResource(Rez.Drawables.Heart); }
            bmp = _heart;
        }
        var d = (r * 2).toNumber();
        dc.drawScaledBitmap(cx - r, cy - r, d, d, bmp);
    }

    function pulseLine(dc, cx, cy, r, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);
        dc.drawLine(cx - r, cy, cx - r * 0.45, cy);
        dc.drawLine(cx - r * 0.45, cy, cx - r * 0.2, cy - r * 0.75);
        dc.drawLine(cx - r * 0.2, cy - r * 0.75, cx + r * 0.1, cy + r * 0.7);
        dc.drawLine(cx + r * 0.1, cy + r * 0.7, cx + r * 0.35, cy);
        dc.drawLine(cx + r * 0.35, cy, cx + r, cy);
        dc.setPenWidth(1);
    }

    // An upward arrow, for the "stand up" prompt. Straight strokes, so no
    // bitmap is needed.
    function arrowUp(dc, cx, cy, r, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(5);
        dc.drawLine(cx, cy + r, cx, cy - r);
        dc.drawLine(cx, cy - r, cx - r * 0.62, cy - r * 0.34);
        dc.drawLine(cx, cy - r, cx + r * 0.62, cy - r * 0.34);
        dc.setPenWidth(1);
    }

    function personStanding(dc, cx, cy, r, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy - r * 0.62, r * 0.26);
        dc.setPenWidth(3);
        dc.drawLine(cx, cy - r * 0.3, cx, cy + r * 0.22);      // torso
        dc.drawLine(cx - r * 0.55, cy - r * 0.1, cx + r * 0.55, cy - r * 0.1); // arms
        dc.drawLine(cx, cy + r * 0.22, cx - r * 0.38, cy + r * 0.9);  // legs
        dc.drawLine(cx, cy + r * 0.22, cx + r * 0.38, cy + r * 0.9);
        dc.setPenWidth(1);
    }

    function stairs(dc, cx, cy, r, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);
        var x = cx - r * 0.85;
        var y = cy + r * 0.75;
        var step = r * 0.56;
        for (var i = 0; i < 3; i = i + 1) {
            dc.drawLine(x, y, x + step, y);            // tread
            dc.drawLine(x + step, y, x + step, y - step); // riser
            x = x + step;
            y = y - step;
        }
        dc.setPenWidth(1);
    }

    // The completion badge: red disc with a white tick, as ONE bitmap.
    // Drawing it with primitives aliased twice over — Connect IQ anti-aliases
    // neither a filled circle nor the thick diagonal strokes of a check.
    var _check = null;

    function checkBadge(dc, cx, cy, r) {
        if (_check == null) { _check = WatchUi.loadResource(Rez.Drawables.CheckBadge); }
        var d = (r * 2).toNumber();
        dc.drawScaledBitmap(cx - r, cy - r, d, d, _check);
    }

    // Word wrap. Connect IQ's drawText does not wrap — it draws one line and
    // lets it run past the edge of the screen — so any string that is not a
    // fixed label has to be broken up by hand.
    //
    // Split from the drawing so a caller can MEASURE first: centring a block
    // vertically needs its height, and its height depends on how many lines the
    // text took.
    function wrapLines(dc, maxW, font, text) {
        var lines = [];
        var line = "";
        var rest = text;
        while (rest != null) {
            var word;
            var sp = rest.find(" ");
            if (sp == null) {
                word = rest;
                rest = null;
            } else {
                word = rest.substring(0, sp);
                rest = rest.substring(sp + 1, rest.length());
            }
            var probe = line.equals("") ? word : line + " " + word;
            if (!line.equals("") && dc.getTextWidthInPixels(probe, font) > maxW) {
                lines.add(line);
                line = word;
            } else {
                line = probe;
            }
        }
        if (!line.equals("")) { lines.add(line); }
        return lines;
    }

    // Draw pre-wrapped lines centred on cx. Returns the y below the last one.
    function drawLines(dc, cx, y, font, lines, color) {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        var lh = dc.getFontHeight(font);
        for (var i = 0; i < lines.size(); i = i + 1) {
            dc.drawText(cx, y, font, lines[i], Graphics.TEXT_JUSTIFY_CENTER);
            y = y + lh;
        }
        return y;
    }

    function wrapText(dc, cx, y, maxW, font, text, color) {
        return drawLines(dc, cx, y, font, wrapLines(dc, maxW, font, text), color);
    }

    // The completion screen, shared by every capture.
    //
    // NO findings are shown. The watch has no room to explain a number, and a
    // bare figure on the wrist invites the user to interpret it without the
    // context the phone gives it — which for someone tracking a chronic illness
    // is the difference between information and alarm. The watch's job ends at
    // "it worked, go and look".
    //
    // The block is measured before it is drawn so the whole group sits centred
    // in the ring however many lines the message takes.
    function completion(dc, w, h, cx, cy, font, message, buttonLabel) {
        ring(dc, cx, cy, (w / 2) - 9, 9, 1.0, TILE, ACCENT);

        var r = h * 0.052;
        var lh = dc.getFontHeight(font);
        var btnH = h * 0.125;
        var gapA = h * 0.035;
        var gapB = h * 0.04;

        var lines = wrapLines(dc, w * 0.74, font, message);
        var total = (r * 2) + gapA + (lines.size() * lh) + gapB + btnH;
        var top = cy - total / 2;

        var label = "Complete";
        var lw = dc.getTextWidthInPixels(label, font);
        var pad = w * 0.03;
        var gx = cx - ((r * 2) + pad + lw) / 2;

        checkBadge(dc, gx + r, top + r, r);
        boldText(dc, gx + r * 2 + pad, top + r - lh / 2, font, label,
            Graphics.TEXT_JUSTIFY_LEFT, INK);

        var after = drawLines(dc, cx, top + (r * 2) + gapA, font, lines, DIM);
        pillLabel(dc, cx, after + gapB, w * 0.4, btnH, CARD, INK, font, buttonLabel);
    }

    // Three dots with one lit, cycling. Stands in for the countdown while the
    // sensor is still finding a pulse: a frozen "--:--" reads as broken, where
    // movement reads as working. Driven off the wall clock rather than a frame
    // counter, so it cannot drift or stall if a redraw is skipped.
    function loadingDots(dc, cx, cy, r, dim, bright) {
        var step = (System.getTimer() / 350) % 3;
        var gap = r * 3;
        for (var i = 0; i < 3; i = i + 1) {
            dc.setColor(i == step ? bright : dim, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(cx + (i - 1) * gap, cy, r);
        }
    }

    // mm:ss
    function clock(sec) {
        var m = sec / 60;
        var s = sec % 60;
        return m.format("%d") + ":" + s.format("%02d");
    }
}
