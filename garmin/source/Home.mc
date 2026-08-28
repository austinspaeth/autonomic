using Toybox.WatchUi;
using Toybox.Graphics;

// The home screen is a CustomMenu rather than a plain View.
//
// A View does not scroll: comfortably-tappable rows plus a title and footer do
// not always fit on one 454px face, and the overflow was simply clipped.
// CustomMenu gives
// native scrolling — momentum, edge bounce, the Venu's own touch handling —
// while still letting each row be drawn by hand, so the pill language survives.
// The alternative (a manual scroll offset driven by swipe events) reimplements
// all of that worse.

class HomeItem extends WatchUi.CustomMenuItem {

    hidden var _title;
    hidden var _tint;
    hidden var _glyph;   // :heart | :monitor

    function initialize(id, title, tint, glyph) {
        CustomMenuItem.initialize(id, {});
        _title = title;
        _tint = tint;
        _glyph = glyph;
    }

    function draw(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var pad = w * 0.06;

        // The focused row lifts to CARD; the rest sit on TILE. On an AMOLED
        // that reads as depth without an outline, and it is how the user knows
        // which row the physical button would open.
        Theme.pill(dc, pad, 2, w - pad * 2, h - 4,
            isSelected() ? Theme.CARD : Theme.TILE);

        var r = h * 0.29;
        var icx = pad + r + w * 0.035;
        var icy = h / 2;
        Theme.iconDisc(dc, icx, icy, r, _tint);
        var g = r * 0.56;
        if (_glyph == :heart) { Theme.heart(dc, icx, icy, g, _tint); }
        else { Theme.pulseLine(dc, icx, icy, g, _tint); }

        // Title only: the subtitles restated what the icon and the title
        // already said, and cost the row the height that makes it easy to hit.
        var tx = icx + r + w * 0.035;
        var tf = Graphics.FONT_XTINY;
        Theme.boldText(dc, tx, (h - dc.getFontHeight(tf)) / 2, tf, _title,
            Graphics.TEXT_JUSTIFY_LEFT, Theme.INK);

        Theme.chevron(dc, w - pad - w * 0.05, h / 2, h * 0.10, Theme.DIM);
    }
}

// The menu's title band: the squiggle over the wordmark.
class HomeTitle extends WatchUi.Drawable {

    function initialize() {
        Drawable.initialize({});
    }

    function draw(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        dc.setColor(Theme.BG, Theme.BG);
        dc.clear();

        // Bottom-aligned inside the title band, then lifted by a small gap.
        // The menu fixes the band's height, so where the mark sits inside it is
        // the only control over the distance to the first row.
        var font = Graphics.FONT_XTINY;
        var logo = WatchUi.loadResource(Rez.Drawables.Logo);
        var block = logo.getHeight() + dc.getFontHeight(font) - 4;
        var y = h - block - (h * 0.13);
        if (y < 0) { y = 0; }
        dc.drawBitmap(cx - logo.getWidth() / 2, y, logo);
        Theme.boldText(dc, cx, y + logo.getHeight() - 4, font,
            "Autonomic", Graphics.TEXT_JUSTIFY_CENTER, Theme.INK);
    }
}

// The version, at the foot of the list — the same place the Apple Watch
// companion puts it. Dim and small: it is for a support conversation, not for
// the user's attention.
class HomeFooter extends WatchUi.Drawable {

    function initialize() {
        Drawable.initialize({});
    }

    function draw(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Theme.BG, Theme.BG);
        dc.clear();
        dc.setColor(Theme.DIM, Graphics.COLOR_TRANSPARENT);
        var font = Graphics.FONT_XTINY;
        dc.drawText(w / 2, (h - dc.getFontHeight(font)) / 2, font,
            "v" + WatchUi.loadResource(Rez.Strings.AppVersion),
            Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class HomeMenuDelegate extends WatchUi.Menu2InputDelegate {

    hidden var _app;

    function initialize(app) {
        Menu2InputDelegate.initialize();
        _app = app;
    }

    function onSelect(item) {
        var id = item.getId();
        if (id == :hrv) { _app.openHrv(); }
        else if (id == :monitor) { _app.openMonitor(); }
    }
}

module Home {

    // Icon tints match the Apple Watch companion exactly: heart on accent.
    // Same product, same colour keys.
    function menu(deviceHeight) {
        var m = new WatchUi.CustomMenu(
            (deviceHeight * 0.21).toNumber(),
            Theme.BG,
            {
                :title => new HomeTitle(),
                :footer => new HomeFooter(),
                :footerItemHeight => (deviceHeight * 0.26).toNumber()
            }
        );
        m.addItem(new HomeItem(:hrv, "HRV Reading", Theme.ACCENT, :monitor));
        m.addItem(new HomeItem(:monitor, "HR Monitor", Theme.ACCENT, :heart));
        return m;
    }
}
