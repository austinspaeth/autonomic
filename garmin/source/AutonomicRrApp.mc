using Toybox.Application;
using Toybox.WatchUi;
using Toybox.Communications;
using Toybox.System;
using Toybox.Time;
using Toybox.Lang;

// Mode router + owner of the shared services. Deliberately flat: one view at a
// time, pushed and popped, with no navigation stack to get lost in.
class AutonomicRrApp extends Application.AppBase {

    hidden var _link;
    hidden var _collector;
    hidden var _monitor;
    hidden var _seq;

    function initialize() {
        AppBase.initialize();
        _link = new Link(null);
        _collector = new RrCollector();
        _monitor = new HrMonitor();
        _seq = 0;
    }

    function link() { return _link; }

    function getInitialView() {

        listenForAcks();
        // Anything left unacknowledged from a previous run goes out now. Self-
        // guards on phoneConnected, so this is a no-op with the phone away.
        _link.flush();
        var h = System.getDeviceSettings().screenHeight;
        return [Home.menu(h), new HomeMenuDelegate(self)];
    }

    // Called when the app is closing, including when it is replaced by a new
    // sideload. Without this a reading in progress leaves its activity
    // recording behind, which then blocks every later reading.

    function onStop(state) {
        _collector.stop();
        _collector.release();
        _monitor.stop();
        // Belt to the braces above: whichever mode was running has already
        // discarded its session, and this catches one that did not get the
        // chance. A session left open blocks every later reading.
        Recording.end();
    }

    // The ONE way a reading ends — the five-minute clock, the button, back, or
    // the collector giving up on the sensor. A reading with enough beats goes
    // to the journal. One without goes nowhere as a reading, because the phone
    // would refuse it, but a failed attempt the sensor was given a fair chance
    // at is REPORTED in its place, so a watch that cannot get a signal shows
    // up on the dashboard instead of in a support email months later.
    function finishReading(reason) {
        if (!_collector.isRunning()) { return; }
        _collector.stop();
        if (_collector.worthSending()) {
            submit(_collector.payload());
        } else if (_collector.worthReporting()) {
            submit(_collector.diagPayload(reason));
        }
        WatchUi.requestUpdate();
    }

    // The phone acks by sending a message back. Registered unconditionally: it
    // is a listener, not a send, and it must be in place for the ack of a
    // reading that drains the moment the phone reconnects.
    function listenForAcks() {
        Communications.registerForPhoneAppMessages(method(:onPhoneMessage));
    }


    // The phone confirms an id it has stored. Until this arrives the reading
    // stays queued on the watch.
    function onPhoneMessage(msg as Communications.PhoneAppMessage) as Void {
        var d = msg.data;
        if (d == null) { return; }
        if (d instanceof Lang.Dictionary && d.hasKey("ack")) {
            _link.ack(d["ack"]);
        }
    }

    // Every payload gets a unique id so delivery can be acknowledged exactly
    // once. Time alone is not enough: two readings can finish in one second.
    hidden function nextId() {
        _seq = _seq + 1;
        return "" + Time.now().value() + "-" + _seq;
    }

    function submit(payload) {
        if (payload == null) { return; }
        payload["id"] = nextId();
        
        _link.enqueue(payload);
    }

    // ---- navigation ----

    function goHome() {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }

    function openHrv() {
        WatchUi.pushView(new RrView(self, _collector, _link),
            new RrDelegate(self, _collector, _link), WatchUi.SLIDE_LEFT);
    }

    function openMonitor() {
        WatchUi.pushView(new HrMonitorView(_monitor),
            new HrMonitorDelegate(_monitor, self), WatchUi.SLIDE_LEFT);
    }


}
