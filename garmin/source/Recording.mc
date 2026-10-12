using Toybox.ActivityRecording;
using Toybox.Activity;
using Toybox.System;
using Toybox.Lang;

// A throwaway activity session, held open for exactly as long as a capture
// runs and DISCARDED on the way out, so nothing ever lands in the user's
// activity history.
//
// WHY IT EXISTS. The optical sensor has two modes. Between activities the
// watch samples it at a low, power-saving cadence that is enough for the
// heart-rate number on the watch face and not enough for beat-to-beat;
// during an activity it runs flat out. A Connect IQ app asking for
// SENSOR_ONBOARD_HEARTRATE is SUPPOSED to switch it to the fast mode, and on
// some devices and firmware it does not: Garmin's own tracker carries an
// acknowledged report (Elevate 5, fenix 7 / epix 2) of the sensor staying in
// its two-LED low-power mode for Connect IQ apps whenever the watch's Wrist
// Heart Rate setting is Auto, with the full sensor only coming on when that
// setting is OFF. That is a watch producing a live pulse and an empty interval
// array for the whole of a reading — exactly the "stuck on Getting a signal"
// report — on some users' watches and never on others, depending on firmware
// and a setting nobody changes.
//
// Recording an activity is the one documented, device-independent way to put
// the sensor into activity mode: it is the path Garmin's native apps take, and
// the SDK's own registerSensorDataListener example pairs the listener with a
// session. It also keeps the app in the foreground under the activity display
// timeout rather than the watch-face one, which is the keep-awake the HR
// monitor needs and `Attention.backlight` cannot provide.
//
// It is a HELPER, never a precondition: every call is wrapped, and a watch
// that refuses the session (another activity already recording, a device
// without the permission honoured) simply runs the capture the way it always
// did. `createSession` returns the EXISTING session if one is still open, so
// end() always discards rather than leaving one behind to block the next.
module Recording {

    var _session = null;

    function isRecording() {
        return _session != null && _session.isRecording();
    }

    // Start a generic session under the given name. Returns true when the
    // watch confirms it is recording.
    function begin(name as Lang.String) as Lang.Boolean {
        if (!(Toybox has :ActivityRecording)) { return false; }
        try {
            if (_session == null) {
                _session = ActivityRecording.createSession({
                    :name => name,
                    :sport => Activity.SPORT_GENERIC,
                    :subSport => Activity.SUB_SPORT_GENERIC
                });
            }
            if (_session != null && !_session.isRecording()) {
                _session.start();
            }
            return isRecording();
        } catch (ex) {
            _session = null;
            return false;
        }
    }

    // Stop and DISCARD. Nothing this app records is an activity the user
    // chose to log, so it must never appear in Garmin Connect.
    function end() as Void {
        if (_session == null) { return; }
        try {
            if (_session.isRecording()) { _session.stop(); }
            _session.discard();
        } catch (ex) {
            // Already gone; nothing to hold on to.
        }
        _session = null;
    }
}
