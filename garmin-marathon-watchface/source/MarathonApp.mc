import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class MarathonApp extends Application.AppBase {

    private var _view as MarathonView?;

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        var view = new MarathonView();
        _view = view;
        if (WatchUi has :WatchFaceDelegate) {
            return [view, new MarathonDelegate(view)];
        }
        return [view];
    }

    // Called when the user changes settings in Garmin Connect / Connect IQ
    function onSettingsChanged() as Void {
        var view = _view;
        if (view != null) {
            view.loadSettings();
        }
        WatchUi.requestUpdate();
    }
}

class MarathonDelegate extends WatchUi.WatchFaceDelegate {

    private var _view as MarathonView;

    function initialize(view as MarathonView) {
        WatchFaceDelegate.initialize();
        _view = view;
    }

    // The system stops calling onPartialUpdate if we use too much power.
    // Seconds are then only shown while the watch is awake.
    function onPowerBudgetExceeded(powerInfo as WatchFacePowerInfo) as Void {
        _view.disablePartialUpdates();
    }
}
