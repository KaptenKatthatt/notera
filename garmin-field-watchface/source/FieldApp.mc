import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class FieldApp extends Application.AppBase {

    private var _view as FieldView?;

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        var view = new FieldView();
        _view = view;
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
