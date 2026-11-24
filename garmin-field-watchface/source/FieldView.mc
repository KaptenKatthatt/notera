import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// Military field-watch style analog face for Instinct 2S:
// 12-hour numerals, hollow "lume" hour bars,
// hollow baton hands, arrow-tipped seconds hand (while awake)
// and the date window in the round subscreen.
class FieldView extends WatchUi.WatchFace {

    private var _fg as Number = Graphics.COLOR_WHITE;
    private var _bg as Number = Graphics.COLOR_BLACK;
    private var _awake as Boolean = true;

    // Layout (computed in onLayout); geometry is designed for 156 px and scaled by _k
    private var _w as Number = 156;
    private var _h as Number = 156;
    private var _k as Float = 1.0;
    private var _cx as Float = 78.0;
    private var _cy as Float = 78.0;
    private var _ssX as Number = 99;
    private var _ssY as Number = 0;
    private var _ssW as Number = 57;
    private var _ssH as Number = 57;
    private var _numFont as FontDefinition = Graphics.FONT_TINY;
    private var _dateFont as FontDefinition = Graphics.FONT_TINY;

    function initialize() {
        WatchFace.initialize();
        loadSettings();
    }

    function loadSettings() as Void {
        var invert = Application.Properties.getValue("InvertColors");
        if (invert instanceof Boolean && invert) {
            _fg = Graphics.COLOR_BLACK;
            _bg = Graphics.COLOR_WHITE;
        } else {
            _fg = Graphics.COLOR_WHITE;
            _bg = Graphics.COLOR_BLACK;
        }
    }

    function onLayout(dc as Dc) as Void {
        _w = dc.getWidth();
        _h = dc.getHeight();
        _k = _w / 156.0;
        _cx = _w / 2.0;
        _cy = _h / 2.0;

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

        _numFont = pickFont(dc, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], (_h * 0.17).toNumber());
        _dateFont = pickFont(dc, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], (_ssH * 0.36).toNumber());
    }

    function onUpdate(dc as Dc) as Void {
        dc.clearClip();
        dc.setColor(_fg, _bg);
        dc.clear();
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(true);
        }

        drawDial(dc);
        drawDate(dc);

        var clock = System.getClockTime();
        var hourAngle = ((clock.hour % 12) + clock.min / 60.0) * Math.PI / 6.0;
        var minAngle = (clock.min + clock.sec / 60.0) * Math.PI / 30.0;
        drawBaton(dc, hourAngle, 36.0, 7.0);
        drawBaton(dc, minAngle, 56.0, 6.0);
        if (_awake) {
            drawSeconds(dc, clock.sec * Math.PI / 30.0);
        }

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(_cx, _cy, 4.5 * _k);
        dc.setColor(_bg, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(_cx, _cy, 1.5 * _k);
    }

    function onExitSleep() as Void {
        _awake = true;
        WatchUi.requestUpdate();
    }

    function onEnterSleep() as Void {
        _awake = false;
        WatchUi.requestUpdate();
    }

    // ---------------------------------------------------------------

    private function drawDial(dc as Dc) as Void {
        for (var i = 0; i < 60; i++) {
            var a = i * Math.PI / 30.0;
            if (i % 5 == 0) {
                // Hollow lume bar: thick bar with a thin black core
                var o = polar(a, 76.0);
                var n = polar(a, 67.0);
                if (inSub(n, 3.0)) {
                    continue;
                }
                dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(px(4.5));
                dc.drawLine(o[0], o[1], n[0], n[1]);
                var o2 = polar(a, 74.5);
                var n2 = polar(a, 68.5);
                dc.setColor(_bg, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(px(1.6));
                dc.drawLine(o2[0], o2[1], n2[0], n2[1]);
            } else {
                var o = polar(a, 77.0);
                var n = polar(a, 72.0);
                if (inSub(n, 2.0)) {
                    continue;
                }
                dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
                dc.setPenWidth(1);
                dc.drawLine(o[0], o[1], n[0], n[1]);
            }
        }
        dc.setPenWidth(1);

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        var just = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        for (var n = 1; n <= 12; n++) {
            var a = n * Math.PI / 6.0;
            var p = polar(a, 55.0);
            if (!inSub(p, 7.0)) {
                dc.drawText(p[0], p[1], _numFont, n.toString(), just);
            }
        }
    }

    // Weekday + white date window in the subscreen
    private function drawDate(dc as Dc) as Void {
        var info = Gregorian.info(Time.now(), Time.FORMAT_MEDIUM);
        var scx = _ssX + _ssW / 2.0;
        var scy = _ssY + _ssH / 2.0;
        var r = (_ssW < _ssH ? _ssW : _ssH) / 2.0;

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawCircle(scx, scy, r - 3);

        var just = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        dc.drawText(scx, scy - r * 0.42, Graphics.FONT_XTINY, (info.day_of_week as String).toUpper(), just);

        var dayText = info.day.format("%d");
        var bw = (r * 0.85).toNumber();
        var bh = (r * 0.64).toNumber();
        var bx = (scx - bw / 2.0).toNumber();
        var by = (scy - r * 0.14).toNumber();
        dc.fillRectangle(bx, by, bw, bh);
        dc.setColor(_bg, Graphics.COLOR_TRANSPARENT);
        dc.drawText(scx, by + bh / 2.0, _dateFont, dayText, just);
    }

    // Baton hand: white sword shape with a black "lume tube" core
    private function drawBaton(dc as Dc, angle as Numeric, length as Numeric, width as Numeric) as Void {
        var sx = Math.sin(angle);
        var sy = -Math.cos(angle);
        var hw = width / 2.0;
        var sh = length - width * 1.4;
        var l = length * _k;
        var s = sh * _k;
        var h = hw * _k;

        // Black halo so the hand stays readable over numerals
        dc.setColor(_bg, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(px(width + 3.0));
        dc.drawLine(_cx, _cy, _cx + sx * l, _cy + sy * l);

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([
            [_cx - sy * h, _cy + sx * h],
            [_cx + sx * s - sy * h, _cy + sy * s + sx * h],
            [_cx + sx * l, _cy + sy * l],
            [_cx + sx * s + sy * h, _cy + sy * s - sx * h],
            [_cx + sy * h, _cy - sx * h]
        ]);

        var c1 = 9.0 * _k;
        var c2 = (sh - 3.0) * _k;
        var core = width - 3.5;
        if (core < 1.5) {
            core = 1.5;
        }
        dc.setColor(_bg, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(px(core));
        dc.drawLine(_cx + sx * c1, _cy + sy * c1, _cx + sx * c2, _cy + sy * c2);
        dc.setPenWidth(1);
    }

    // Thin seconds hand with an arrow head
    private function drawSeconds(dc as Dc, angle as Numeric) as Void {
        var sx = Math.sin(angle);
        var sy = -Math.cos(angle);
        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawLine(_cx - sx * 16 * _k, _cy - sy * 16 * _k, _cx + sx * 72 * _k, _cy + sy * 72 * _k);
        var ar = 54.0 * _k;
        var tip = 61.0 * _k;
        var w = 3.5 * _k;
        dc.fillPolygon([
            [_cx + sx * tip, _cy + sy * tip],
            [_cx + sx * ar - sy * w, _cy + sy * ar + sx * w],
            [_cx + sx * ar + sy * w, _cy + sy * ar - sx * w]
        ]);
    }

    // ---------------------------------------------------------------

    private function polar(angle as Numeric, r as Numeric) as [Numeric, Numeric] {
        return [_cx + r * _k * Math.sin(angle), _cy - r * _k * Math.cos(angle)];
    }

    private function inSub(p as [Numeric, Numeric], pad as Numeric) as Boolean {
        var scx = _ssX + _ssW / 2.0;
        var scy = _ssY + _ssH / 2.0;
        var r = (_ssW < _ssH ? _ssW : _ssH) / 2.0;
        var dx = p[0] - scx;
        var dy = p[1] - scy;
        var lim = r + pad * _k;
        return dx * dx + dy * dy < lim * lim;
    }

    private function px(v as Numeric) as Number {
        var n = (v * _k + 0.5).toNumber();
        return n < 1 ? 1 : n;
    }

    private function pickFont(dc as Dc, fonts as Array<FontDefinition>, maxH as Number) as FontDefinition {
        for (var i = 0; i < fonts.size(); i++) {
            if (dc.getFontHeight(fonts[i]) <= maxH) {
                return fonts[i];
            }
        }
        return fonts[fonts.size() - 1];
    }
}
