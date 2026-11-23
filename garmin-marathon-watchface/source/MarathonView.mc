import Toybox.Activity;
import Toybox.ActivityMonitor;
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// Race-clock style watch face for Instinct 2S:
//  - big seven-segment HH:MM like a finish-line clock
//  - seconds in the round subscreen, ringed by today's distance
//    as progress towards a marathon (42.195 km / 26.2 mi)
//  - checkered finish strip, date, heart rate and battery
class MarathonView extends WatchUi.WatchFace {

    // Segment bit masks for 0-9 (a=1 b=2 c=4 d=8 e=16 f=32 g=64)
    private const DIGITS as Array<Number> = [63, 6, 91, 79, 102, 109, 125, 7, 127, 111];

    private const MARATHON_KM as Float = 42.195;
    private const MARATHON_MI as Float = 26.219;

    private var _fg as Number = Graphics.COLOR_WHITE;
    private var _bg as Number = Graphics.COLOR_BLACK;
    private var _showSeconds as Boolean = true;

    private var _isAwake as Boolean = true;
    private var _partialAllowed as Boolean = false;

    private var _banner as String = "MARATHON";
    private var _bannerShort as String = "42K";

    // Layout (computed in onLayout)
    private var _w as Number = 156;
    private var _h as Number = 156;
    private var _ssX as Number = 99;
    private var _ssY as Number = 0;
    private var _ssW as Number = 57;
    private var _ssH as Number = 57;
    private var _digH as Number = 46;
    private var _digW as Number = 25;
    private var _digT as Number = 6;
    private var _digY as Number = 60;

    function initialize() {
        WatchFace.initialize();
        _partialAllowed = (WatchUi.WatchFace has :onPartialUpdate);
        loadSettings();
    }

    function loadSettings() as Void {
        var invert = Application.Properties.getValue("InvertColors");
        var secs = Application.Properties.getValue("ShowSeconds");
        if (invert instanceof Boolean && invert) {
            _fg = Graphics.COLOR_BLACK;
            _bg = Graphics.COLOR_WHITE;
        } else {
            _fg = Graphics.COLOR_WHITE;
            _bg = Graphics.COLOR_BLACK;
        }
        _showSeconds = !(secs instanceof Boolean) || secs;
    }

    function disablePartialUpdates() as Void {
        _partialAllowed = false;
    }

    function onLayout(dc as Dc) as Void {
        _w = dc.getWidth();
        _h = dc.getHeight();
        _banner = WatchUi.loadResource(Rez.Strings.Banner) as String;
        _bannerShort = WatchUi.loadResource(Rez.Strings.BannerShort) as String;

        // Subscreen (the small round window top right)
        var box = null;
        if (WatchUi has :getSubscreen) {
            box = WatchUi.getSubscreen();
        }
        if (box != null && box.x != null && box.y != null) {
            _ssX = box.x as Number;
            _ssY = box.y as Number;
            _ssW = box.width;
            _ssH = box.height;
        } else {
            _ssW = (_w * 0.365).toNumber();
            _ssH = _ssW;
            _ssX = _w - _ssW;
            _ssY = 0;
        }

        // Big digits sized from screen height
        _digH = (_h * 0.30).toNumber();
        _digW = (_digH * 0.55).toNumber();
        _digT = _digH / 8;
        if (_digT < 3) {
            _digT = 3;
        }
        _digY = _ssY + _ssH + 3;
    }

    function onUpdate(dc as Dc) as Void {
        dc.clearClip();
        dc.setColor(_fg, _bg);
        dc.clear();

        var clock = System.getClockTime();
        drawBanner(dc);
        drawDate(dc);
        drawTime(dc, clock);
        var stripBottom = drawFinishStrip(dc);
        drawStats(dc, stripBottom);
        drawSubscreen(dc, clock);
    }

    // Redraw only the subscreen once per second (seconds counter)
    function onPartialUpdate(dc as Dc) as Void {
        if (!_showSeconds) {
            return;
        }
        dc.setClip(_ssX, _ssY, _ssW, _ssH);
        dc.setColor(_fg, _bg);
        dc.clear();
        drawSubscreen(dc, System.getClockTime());
        dc.clearClip();
    }

    function onExitSleep() as Void {
        _isAwake = true;
        WatchUi.requestUpdate();
    }

    function onEnterSleep() as Void {
        _isAwake = false;
        WatchUi.requestUpdate();
    }

    // ---------------------------------------------------------------
    // Sections
    // ---------------------------------------------------------------

    // Inverted "MARATHON" banner left of the subscreen, like a finish banner
    private function drawBanner(dc as Dc) as Void {
        var font = Graphics.FONT_XTINY;
        var fh = dc.getFontHeight(font);
        var top = _ssY + 6;
        var left = chordLeft(top) + 2;
        var right = _ssX - 4;
        var text = _banner;
        if (dc.getTextWidthInPixels(text, font) + 6 > right - left) {
            text = _bannerShort;   // "MARATHON" doesn't fit next to the subscreen
        }
        var cx = (left + right) / 2;
        dc.setColor(_fg, _fg);
        dc.fillRoundedRectangle(left, top, right - left, fh, 3);
        dc.setColor(_bg, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, top, font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    private function drawDate(dc as Dc) as Void {
        var info = Gregorian.info(Time.now(), Time.FORMAT_MEDIUM);
        var text = (info.day_of_week as String).toUpper() + " " + info.day.format("%d");
        var font = Graphics.FONT_TINY;
        var top = _ssY + 6 + dc.getFontHeight(Graphics.FONT_XTINY) + 2;
        var left = chordLeft(top + dc.getFontHeight(font) / 2);
        var cx = (left + _ssX - 4) / 2;
        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, top, font, text, Graphics.TEXT_JUSTIFY_CENTER);
    }

    private function drawTime(dc as Dc, clock as ClockTime) as Void {
        var hour = clock.hour;
        var is24 = System.getDeviceSettings().is24Hour;
        if (!is24) {
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }
        var pairGap = _digT / 2 + 2;
        var colonGap = _digT;
        var total = 4 * _digW + 2 * pairGap + 2 * colonGap + _digT;
        var x = (_w - total) / 2;

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        // Hours: leading zero in 24h mode, blank in 12h mode
        if (hour >= 10 || is24) {
            drawDigit(dc, x, _digY, _digW, _digH, _digT, hour / 10);
        }
        x += _digW + pairGap;
        drawDigit(dc, x, _digY, _digW, _digH, _digT, hour % 10);
        x += _digW + colonGap;

        // Colon: two square dots
        var dot = _digT;
        dc.fillRectangle(x, _digY + _digH / 3 - dot / 2, dot, dot);
        dc.fillRectangle(x, _digY + (_digH * 2) / 3 - dot / 2, dot, dot);
        x += dot + colonGap;

        drawDigit(dc, x, _digY, _digW, _digH, _digT, clock.min / 10);
        x += _digW + pairGap;
        drawDigit(dc, x, _digY, _digW, _digH, _digT, clock.min % 10);
    }

    // Checkered finish-line strip under the clock. Returns its bottom y.
    private function drawFinishStrip(dc as Dc) as Number {
        var sq = _h / 39;
        if (sq < 3) {
            sq = 3;
        }
        var top = _digY + _digH + sq + 1;
        var left = chordLeft(top + 2 * sq) + 4;
        var right = _w - left;
        var cols = (right - left) / sq;
        left = (_w - cols * sq) / 2;

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        for (var c = 0; c < cols; c++) {
            for (var r = 0; r < 2; r++) {
                if ((c + r) % 2 == 0) {
                    dc.fillRectangle(left + c * sq, top + r * sq, sq, sq);
                }
            }
        }
        dc.drawRectangle(left, top, cols * sq, 2 * sq);
        return top + 2 * sq;
    }

    // Heart rate + distance on one row, battery below
    private function drawStats(dc as Dc, top as Number) as Void {
        var font = Graphics.FONT_XTINY;
        var fh = dc.getFontHeight(font);
        var y = top + 2;
        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);

        // Heart rate (left of centre)
        var hr = getHeartRate();
        var hrText = (hr != null) ? hr.format("%d") : "--";
        var hx = _w / 2 - 6;
        var iconSize = fh / 2;
        var hrW = dc.getTextWidthInPixels(hrText, font);
        dc.drawText(hx, y, font, hrText, Graphics.TEXT_JUSTIFY_RIGHT);
        drawHeart(dc, hx - hrW - iconSize - 3, y + fh / 2 - iconSize / 2, iconSize);

        // Distance today (right of centre)
        var dist = getDistance();
        var distText = dist.format("%.1f") + (isMetric() ? "km" : "mi");
        dc.drawText(_w / 2 + 6, y, font, distText, Graphics.TEXT_JUSTIFY_LEFT);

        // Battery (centred, next row) if it fits inside the round screen
        var by = y + fh;
        if (by + fh <= _h - 2) {
            var batt = System.getSystemStats().battery;
            var bText = batt.format("%d") + "%";
            var bw = dc.getTextWidthInPixels(bText, font);
            var iconW = fh;
            var iconH = fh / 2;
            var startX = (_w - (iconW + 3 + bw)) / 2;
            drawBattery(dc, startX, by + fh / 2 - iconH / 2, iconW, iconH, batt);
            dc.drawText(startX + iconW + 3, by, font, bText, Graphics.TEXT_JUSTIFY_LEFT);
        }
    }

    // Seconds (seven-segment) ringed by marathon progress
    private function drawSubscreen(dc as Dc, clock as ClockTime) as Void {
        var cx = _ssX + _ssW / 2;
        var cy = _ssY + _ssH / 2;
        var r = (_ssW < _ssH ? _ssW : _ssH) / 2 - 3;

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawCircle(cx, cy, r);

        var progress = getDistance() / (isMetric() ? MARATHON_KM : MARATHON_MI);
        if (progress > 1.0) {
            progress = 1.0;
        }
        if (progress > 0.0) {
            dc.setPenWidth(3);
            var start = 90;
            var end = 90 - (progress * 360).toNumber();
            if (progress >= 1.0) {
                dc.drawCircle(cx, cy, r);
                dc.drawCircle(cx, cy, r - 1);
                dc.drawCircle(cx, cy, r + 1);
            } else if (end != start) {
                dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, start, end);
            }
            dc.setPenWidth(1);
        }

        if (_showSeconds && (_isAwake || _partialAllowed)) {
            var h = (_ssH * 0.40).toNumber();
            var w = (h * 0.55).toNumber();
            var t = h / 7;
            if (t < 2) {
                t = 2;
            }
            var gap = t + 1;
            var x = cx - w - gap / 2;
            var y = cy - h / 2;
            drawDigit(dc, x, y, w, h, t, clock.sec / 10);
            drawDigit(dc, x + w + gap, y, w, h, t, clock.sec % 10);
        } else {
            // Without seconds: show marathon progress in percent
            var pct = (progress * 100).toNumber().format("%d") + "%";
            dc.drawText(cx, cy, Graphics.FONT_XTINY, pct,
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    // ---------------------------------------------------------------
    // Drawing helpers
    // ---------------------------------------------------------------

    // Seven-segment digit with bevelled segments, top-left at (x, y)
    private function drawDigit(dc as Dc, x as Number, y as Number, w as Number,
                               h as Number, t as Number, digit as Number) as Void {
        var mask = DIGITS[digit];
        var g = 1;                 // gap between segments
        var ht = t / 2;
        var xl = x + ht;           // centre line of left verticals
        var xr = x + w - ht;       // centre line of right verticals
        var yt = y + ht;           // centre line of top horizontal
        var ym = y + h / 2;        // centre line of middle horizontal
        var yb = y + h - ht;       // centre line of bottom horizontal

        if ((mask & 1) != 0)  { hSeg(dc, xl + g, xr - g, yt, ht); }   // a
        if ((mask & 2) != 0)  { vSeg(dc, xr, yt + g, ym - g, ht); }   // b
        if ((mask & 4) != 0)  { vSeg(dc, xr, ym + g, yb - g, ht); }   // c
        if ((mask & 8) != 0)  { hSeg(dc, xl + g, xr - g, yb, ht); }   // d
        if ((mask & 16) != 0) { vSeg(dc, xl, ym + g, yb - g, ht); }   // e
        if ((mask & 32) != 0) { vSeg(dc, xl, yt + g, ym - g, ht); }   // f
        if ((mask & 64) != 0) { hSeg(dc, xl + g, xr - g, ym, ht); }   // g
    }

    private function hSeg(dc as Dc, x1 as Number, x2 as Number, y as Number, ht as Number) as Void {
        dc.fillPolygon([
            [x1, y], [x1 + ht, y - ht], [x2 - ht, y - ht],
            [x2, y], [x2 - ht, y + ht], [x1 + ht, y + ht]
        ]);
    }

    private function vSeg(dc as Dc, x as Number, y1 as Number, y2 as Number, ht as Number) as Void {
        dc.fillPolygon([
            [x, y1], [x + ht, y1 + ht], [x + ht, y2 - ht],
            [x, y2], [x - ht, y2 - ht], [x - ht, y1 + ht]
        ]);
    }

    private function drawHeart(dc as Dc, x as Number, y as Number, s as Number) as Void {
        var r = s / 4 + 1;
        dc.fillCircle(x + r, y + r, r);
        dc.fillCircle(x + s - r, y + r, r);
        dc.fillPolygon([[x, y + r], [x + s, y + r], [x + s / 2, y + s]]);
    }

    private function drawBattery(dc as Dc, x as Number, y as Number, w as Number,
                                 h as Number, pct as Float) as Void {
        dc.drawRectangle(x, y, w - 2, h);
        dc.fillRectangle(x + w - 2, y + h / 4, 2, h / 2);
        var fill = ((w - 6) * pct / 100.0).toNumber();
        if (fill > 0) {
            dc.fillRectangle(x + 2, y + 2, fill, h - 4);
        }
    }

    // Left x of the visible (round) screen at height y
    private function chordLeft(y as Number) as Number {
        var r = _w / 2.0;
        var dy = y - _h / 2.0;
        var sq = r * r - dy * dy;
        if (sq <= 0) {
            return (_w / 2).toNumber();
        }
        return (r - Math.sqrt(sq)).toNumber();
    }

    // ---------------------------------------------------------------
    // Data
    // ---------------------------------------------------------------

    private function isMetric() as Boolean {
        return System.getDeviceSettings().distanceUnits != System.UNIT_STATUTE;
    }

    // Today's distance in km or miles
    private function getDistance() as Float {
        var info = ActivityMonitor.getInfo();
        var cm = info.distance;
        if (cm == null) {
            return 0.0;
        }
        var km = cm / 100000.0;
        return isMetric() ? km.toFloat() : (km / 1.609344).toFloat();
    }

    private function getHeartRate() as Number? {
        var act = Activity.getActivityInfo();
        if (act != null && act.currentHeartRate != null) {
            return act.currentHeartRate;
        }
        if (ActivityMonitor has :getHeartRateHistory) {
            var it = ActivityMonitor.getHeartRateHistory(1, true);
            var sample = it.next();
            if (sample != null && sample.heartRate != null
                    && sample.heartRate != ActivityMonitor.INVALID_HR_SAMPLE) {
                return sample.heartRate;
            }
        }
        return null;
    }
}
