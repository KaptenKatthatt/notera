import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// Classic cartoon-character watch for Instinct 2S: a cat in a captain's
// cap stands in the middle of the dial and points out the time with its
// arms (short arm = hours, long arm = minutes). Weekday and date are in
// the round subscreen; a thin seconds hand shows while the watch is awake.
class CatView extends WatchUi.WatchFace {

    private var _fg as Number = Graphics.COLOR_BLACK;
    private var _bg as Number = Graphics.COLOR_WHITE;
    private var _awake as Boolean = true;

    // Geometry is designed for 156 px and scaled by _k
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
    private var _dateFont as FontDefinition = Graphics.FONT_SMALL;

    function initialize() {
        WatchFace.initialize();
        loadSettings();
    }

    function loadSettings() as Void {
        var invert = Application.Properties.getValue("InvertColors");
        if (invert instanceof Boolean && invert) {
            _fg = Graphics.COLOR_WHITE;
            _bg = Graphics.COLOR_BLACK;
        } else {
            _fg = Graphics.COLOR_BLACK;
            _bg = Graphics.COLOR_WHITE;
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

        _numFont = pickFont(dc, [Graphics.FONT_SMALL, Graphics.FONT_TINY, Graphics.FONT_XTINY], (_h * 0.15).toNumber());
        _dateFont = pickFont(dc, [Graphics.FONT_MEDIUM, Graphics.FONT_SMALL, Graphics.FONT_TINY], (_ssH * 0.42).toNumber());
    }

    function onUpdate(dc as Dc) as Void {
        dc.clearClip();
        dc.setColor(_fg, _bg);
        dc.clear();
        if (dc has :setAntiAlias) {
            dc.setAntiAlias(true);
        }

        drawDial(dc);
        drawCat(dc);
        drawDate(dc);

        var clock = System.getClockTime();
        var hourAngle = ((clock.hour % 12) + clock.min / 60.0) * Math.PI / 6.0;
        var minAngle = (clock.min + clock.sec / 60.0) * Math.PI / 30.0;
        drawArm(dc, hourAngle, 30.0);
        drawArm(dc, minAngle, 40.0);

        if (_awake) {
            var a = clock.sec * Math.PI / 30.0;
            var sx = Math.sin(a);
            var sy = -Math.cos(a);
            dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(1);
            dc.drawLine(_cx - sx * 12 * _k, _cy - sy * 12 * _k, _cx + sx * 66 * _k, _cy + sy * 66 * _k);
        }

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(_cx, _cy, 3 * _k);
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
        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < 60; i++) {
            var a = i * Math.PI / 30.0;
            var o = polar(a, 76);
            var n = polar(a, i % 5 == 0 ? 71 : 74);
            if (inSub(n, 3)) {
                continue;
            }
            dc.setPenWidth(i % 5 == 0 ? px(2) : 1);
            dc.drawLine(o[0], o[1], n[0], n[1]);
        }
        dc.setPenWidth(1);

        var just = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;
        for (var n = 1; n <= 12; n++) {
            var p = polar(n * Math.PI / 6.0, 61);
            if (!inSub(p, 6)) {
                dc.drawText(p[0], p[1], _numFont, n.toString(), just);
            }
        }
    }

    // The cat: shoulders sit on the dial centre so the arms can turn from there
    private function drawCat(dc as Dc) as Void {
        var fg = _fg;
        var bg = _bg;
        dc.setColor(fg, Graphics.COLOR_TRANSPARENT);

        // Tail
        dc.setPenWidth(px(3));
        dc.drawArc(x(17), y(18), 13 * _k, Graphics.ARC_COUNTER_CLOCKWISE, 270, 90);

        // Legs
        dc.setPenWidth(px(4));
        dc.drawLine(x(-6), y(18), x(-10), y(34));
        dc.drawLine(x(6), y(18), x(10), y(34));
        dc.setPenWidth(1);

        // Body with a light belly
        dc.fillEllipse(x(0), y(9), 12 * _k, 15 * _k);
        dc.setColor(bg, Graphics.COLOR_TRANSPARENT);
        dc.fillEllipse(x(0), y(12), 6 * _k, 9 * _k);

        // Shoes (outlined ovals)
        outlinedEllipse(dc, x(-14), y(37), 8, 4);
        outlinedEllipse(dc, x(14), y(37), 8, 4);

        // Ears
        dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[x(-16), y(-27)], [x(-18), y(-46)], [x(-7), y(-37)]]);
        dc.fillPolygon([[x(16), y(-27)], [x(18), y(-46)], [x(7), y(-37)]]);

        // Head (outlined circle)
        dc.fillCircle(x(0), y(-23), 17 * _k);
        dc.setColor(bg, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x(0), y(-23), 15 * _k);

        // Captain's cap with badge
        dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[x(-9), y(-36)], [x(9), y(-36)], [x(11), y(-44)], [x(-11), y(-44)]]);
        dc.fillRectangle(x(-11), y(-37), 22 * _k, 3 * _k);
        dc.setColor(bg, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x(0), y(-41), 2 * _k);

        // Eyes with a highlight
        dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
        dc.fillEllipse(x(-6), y(-25), 2.5 * _k, 4 * _k);
        dc.fillEllipse(x(6), y(-25), 2.5 * _k, 4 * _k);
        dc.setColor(bg, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x(-5.5), y(-26.5), 1);
        dc.fillCircle(x(6.5), y(-26.5), 1);

        // Nose, smile and whiskers
        dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([[x(-3), y(-19)], [x(3), y(-19)], [x(0), y(-16)]]);
        dc.setPenWidth(1);
        dc.drawArc(x(-2.5), y(-16), 2.5 * _k, Graphics.ARC_COUNTER_CLOCKWISE, 200, 340);
        dc.drawArc(x(2.5), y(-16), 2.5 * _k, Graphics.ARC_COUNTER_CLOCKWISE, 200, 340);
        dc.drawLine(x(-8), y(-17), x(-19), y(-19));
        dc.drawLine(x(-8), y(-17), x(-19), y(-13));
        dc.drawLine(x(8), y(-17), x(19), y(-19));
        dc.drawLine(x(8), y(-17), x(19), y(-13));
    }

    // Arm from the shoulders ending in a pointing glove
    private function drawArm(dc as Dc, angle as Numeric, length as Numeric) as Void {
        var sx = Math.sin(angle);
        var sy = -Math.cos(angle);
        var l = length * _k;

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(px(4));
        dc.drawLine(_cx, _cy, _cx + sx * l, _cy + sy * l);

        // Cuff
        var c = (length - 5) * _k;
        var cw = 4 * _k;
        dc.setPenWidth(px(2));
        dc.drawLine(_cx + sx * c - sy * cw, _cy + sy * c + sx * cw, _cx + sx * c + sy * cw, _cy + sy * c - sx * cw);
        dc.setPenWidth(1);

        // Glove: black silhouette, then a smaller white fill -> outlined glove
        var g = (length + 2) * _k;
        var gx = _cx + sx * g;
        var gy = _cy + sy * g;
        drawGlove(dc, gx, gy, sx, sy, 7.0, 3.2, _fg);
        drawGlove(dc, gx, gy, sx, sy, 5.5, 1.8, _bg);
    }

    private function drawGlove(dc as Dc, gx as Numeric, gy as Numeric, sx as Numeric, sy as Numeric,
                               palm as Numeric, finger as Numeric, color as Number) as Void {
        var f = 11 * _k;
        var w = finger * _k;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(gx, gy, palm * _k);
        dc.fillPolygon([
            [gx - sy * w, gy + sx * w],
            [gx + sx * f - sy * w, gy + sy * f + sx * w],
            [gx + sx * f + sy * w, gy + sy * f - sx * w],
            [gx + sy * w, gy - sx * w]
        ]);
        dc.fillCircle(gx + sx * f, gy + sy * f, w);
    }

    // Weekday + day of month in the subscreen
    private function drawDate(dc as Dc) as Void {
        var info = Gregorian.info(Time.now(), Time.FORMAT_MEDIUM);
        var scx = _ssX + _ssW / 2.0;
        var scy = _ssY + _ssH / 2.0;
        var r = (_ssW < _ssH ? _ssW : _ssH) / 2.0;
        var just = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;

        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawCircle(scx, scy, r - 3);
        dc.drawText(scx, scy - r * 0.38, Graphics.FONT_XTINY, (info.day_of_week as String).toUpper(), just);
        dc.drawText(scx, scy + r * 0.22, _dateFont, info.day.format("%d"), just);
    }

    // ---------------------------------------------------------------

    private function outlinedEllipse(dc as Dc, ex as Numeric, ey as Numeric, rx as Numeric, ry as Numeric) as Void {
        dc.setColor(_fg, Graphics.COLOR_TRANSPARENT);
        dc.fillEllipse(ex, ey, (rx + 1) * _k, (ry + 1) * _k);
        dc.setColor(_bg, Graphics.COLOR_TRANSPARENT);
        dc.fillEllipse(ex, ey, (rx - 1) * _k, (ry - 1) * _k);
    }

    private function x(v as Numeric) as Float {
        return (_cx + v * _k).toFloat();
    }

    private function y(v as Numeric) as Float {
        return (_cy + v * _k).toFloat();
    }

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
