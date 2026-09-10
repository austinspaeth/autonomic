using Toybox.Time;
using Toybox.Time.Gregorian;

// Payload helpers.
//
// The phone already owns a transport-agnostic contract in
// mobile/src/lib/watch/payload.ts — the Apple Watch relay feeds the same
// parser. Garmin therefore emits the SAME shapes rather than growing a parallel
// pipeline, which is why the field names here look like Swift's and not like
// Monkey C's natural style.
module Payload {

    // Must stay <= the phone's supported schema, or mapWatchPayload drops the
    // message wholesale (an old phone build must never half-import a future
    // watch payload).
    const SCHEMA = 1;

    // Local time as "YYYY-MM-DDTHH:MM:SS", with NO timezone suffix on purpose.
    // The phone does `new Date(String(payload.time))` and then reads local
    // getHours(), so a bare date-time is parsed as local on both sides and the
    // logged hour matches the wrist. Appending "Z" here would shift every
    // reading by the user's offset.
    function isoNow() {
        return isoOf(Time.now());
    }

    function isoOf(moment) {
        var g = Gregorian.info(moment, Time.FORMAT_SHORT);
        return g.year.format("%04d") + "-"
            + g.month.format("%02d") + "-"
            + g.day.format("%02d") + "T"
            + g.hour.format("%02d") + ":"
            + g.min.format("%02d") + ":"
            + g.sec.format("%02d");
    }
}
