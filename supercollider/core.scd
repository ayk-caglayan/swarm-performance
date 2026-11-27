// Pure controller state: no MIDI, GUI, audio server, or network side effects.
(
~swarmDefaults = (pitch: 440.0, gain: 0.05, gate: 0, size: 0.2, speed: 0.0, hue: 40.0, x: 0.5, y: 0.5);
~swarmLimits = (pitch: [220, 1760], gain: [0, 0.15], gate: [0, 1], size: [0.05, 0.5], speed: [0, 2], hue: [0, 360], x: [0, 1], y: [0, 1]);
~swarmFields = [\pitch, \gain, \gate, \size, \speed, \hue, \x, \y];
~swarmClients = Dictionary.new;
~swarmTarget = "*";
~swarmRevision = 0;
~swarmEvent = 0;
~swarmPads = Array.fill(8, false);
~swarmHeld = [];
~swarmEmit = { |address, args| };
~swarmFinite = { |v| v.isNumber and: { v.isNaN.not and: { v.abs < inf } } };
~swarmTargets = { |target|
    var selection = target ? ~swarmTarget;
    if(selection == "*") { ~swarmClients.keys.asArray } {
        if(~swarmClients.includesKey(selection)) { [selection] } { [] }
    }
};
~swarmJoin = { |id|
    if(~swarmClients.includesKey(id).not) {
        ~swarmClients[id] = (state: ~swarmDefaults.copy.put(\gate, 0), ready: 0, muted: 0, visible: 1, fps: 0, revision: -1, rtt: -1, audio: "not-enabled");
    };
};
~swarmSet = { |key, value, target|
    var limits = ~swarmLimits[key], selection = target ? ~swarmTarget;
    if(limits.notNil and: { ~swarmFinite.value(value) }) {
        value = value.clip(limits[0], limits[1]);
        if(key == \gate) { value = value.round.asInteger };
        if((selection == "*") and: { key != \gate }) { ~swarmDefaults[key] = value };
        ~swarmTargets.value(selection).do { |id| ~swarmClients[id][\state][key] = value };
        ~swarmRevision = ~swarmRevision + 1;
    };
};
~swarmSendStates = {
    ~swarmClients.keysValuesDo { |id, client|
        ~swarmEmit.value("/swarm/state", [id, ~swarmRevision] ++ ~swarmFields.collect { |key| client[\state][key] });
    };
};
~swarmBeep = {
    ~swarmEvent = ~swarmEvent + 1;
    // Send parameters first so a beep immediately after a knob edit uses them.
    ~swarmSendStates.value;
    ~swarmTargets.value.do { |id| ~swarmEmit.value("/swarm/beep", [id, ~swarmEvent]) };
};
~swarmPanic = {
    ~swarmClients.values.do { |client| client[\state][\gate] = 0 };
    ~swarmHeld = [];
    ~swarmRevision = ~swarmRevision + 1;
    ~swarmEmit.value("/swarm/panic", []);
};
~swarmKnob = { |index, raw|
    var key, u, value;
    if((index >= 0) and: { (index < 5) and: { ~swarmFinite.value(raw) } }) {
        key = [\pitch, \gain, \size, \speed, \hue][index];
        u = raw.clip(0, 127) / 127;
        value = if(index == 0) { u.linexp(0, 1, 220, 1760) } { u.linlin(0, 1, ~swarmLimits[key][0], ~swarmLimits[key][1]) };
        ~swarmSet.value(key, value);
    };
};
~swarmPad = { |index, raw|
    var down;
    if((index >= 0) and: { (index < 8) and: { ~swarmFinite.value(raw) and: { (raw >= 0) and: { raw <= 1 } } } }) {
        down = raw > 0;
        if(down != ~swarmPads[index]) {
            ~swarmPads[index] = down;
            if(index == 0) {
                if(down) {
                    ~swarmHeld = ~swarmTargets.value.copy;
                    ~swarmHeld.do { |id| ~swarmSet.value(\gate, 1, id) };
                } {
                    ~swarmHeld.do { |id| ~swarmSet.value(\gate, 0, id) };
                    ~swarmHeld = [];
                };
            };
            if((index == 1) and: { down }) { ~swarmBeep.value };
            if((index == 7) and: { down }) { ~swarmPanic.value };
        };
    };
};
)
