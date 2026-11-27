// Evaluate this entire file. Stop with ~swarmStop.value or close the panel.
(
var root = PathName(thisProcess.nowExecutingPath).pathOnly;
var env = currentEnvironment;
var gateway = NetAddr("127.0.0.1", 57121);
var keys = List.new, routine, window, selector, status, toneButton;
var sliders = Dictionary.new, values = Dictionary.new;
var names = [], lastGateway = -100.0, gatewayEpoch, session;
var add, refresh, stopping = false;
if(~swarmStop.notNil) { ~swarmStop.value };
(root +/+ "core.scd").load;
session = "sc-" ++ Date.getDate.rawSeconds.asInteger.asString ++ "-" ++ 1000000.rand.asString;
~swarmEmit = { |address, args| gateway.sendMsg(address, *args) };
add = { |name, path, function, source|
    var key = ("swarm_" ++ name).asSymbol;
    OSCdef(key, { |msg, time, sender|
        if(sender.ip == "127.0.0.1") { env.use { function.value(msg) } };
    }, path, source);
    keys.add(key);
};
add.value("gateway", "/swarm/gateway", { |msg|
    // Inbound OSC strings are Symbols in sclang.
    if((msg.size == 2) and: { msg[1].isKindOf(Symbol) or: { msg[1].isString } }) {
        var epoch = msg[1].asString;
        if(gatewayEpoch != epoch) {
            ~swarmPanic.value;
            ~swarmClients.clear;
            gatewayEpoch = epoch;
        };
        lastGateway = Main.elapsedTime;
    };
}, gateway);
add.value("client", "/swarm/client", { |msg|
    if((msg.size == 10) and: { (msg[1].isKindOf(Symbol) or: { msg[1].isString }) and: { msg[1].asString.size == 12 } }) {
        var id = msg[1].asString, client;
        if(msg[2] == 1) {
            ~swarmJoin.value(id);
            client = ~swarmClients[id];
            [\ready, \muted, \visible, \fps, \revision, \rtt, \audio].do { |key, i| client[key] = msg[i + 3] };
        } {
            ~swarmClients.removeAt(id);
        };
    };
}, gateway);
5.do { |i|
    add.value("knob" ++ i, "/akai/knob/" ++ (i + 1), { |msg| if(msg.size == 2) { ~swarmKnob.value(i, msg[1]) } });
};
8.do { |i|
    add.value("pad" ++ i, "/akai/pad/" ++ (i + 1), { |msg| if(msg.size == 2) { ~swarmPad.value(i, msg[1]) } });
};
[\x, \y].do { |axis|
    add.value("stick" ++ axis, "/akai/stick/" ++ axis, { |msg|
        if((msg.size == 2) and: { ~swarmFinite.value(msg[1]) }) { ~swarmSet.value(axis, msg[1].clip(0, 127) / 127) };
    });
};
add.value("panic", "/akai/allNotesOff", { |msg|
    if((msg.size == 2) and: { ~swarmFinite.value(msg[1]) and: { (msg[1] >= 1) and: { msg[1] <= 16 } } }) { ~swarmPanic.value };
});

window = Window("Nervengarten / LAN instrument", Rect(120, 120, 620, 650));
StaticText(window, Rect(20, 14, 580, 24)).string_("SuperCollider master / OSC 57121 / phones on HTTP 8081");
selector = PopUpMenu(window, Rect(20, 48, 580, 30)).items_(["All devices"]).action_({ |view|
    env.use { ~swarmTarget = if(view.value == 0) { "*" } { names[view.value - 1] } };
});
status = StaticText(window, Rect(20, 90, 580, 160)).string_("Waiting for gateway. Start npm start in the project directory.");
[\pitch, \gain, \size, \speed, \hue, \x, \y].do { |key, i|
    var y = 260 + (i * 38);
    StaticText(window, Rect(20, y, 60, 24)).string_(key.asString);
    values[key] = StaticText(window, Rect(495, y, 105, 24));
    sliders[key] = Slider(window, Rect(85, y, 395, 24)).action_({ |view|
        env.use {
            var range = ~swarmLimits[key];
            ~swarmSet.value(key, if(key == \pitch) { view.value.linexp(0, 1, range[0], range[1]) } { view.value.linlin(0, 1, range[0], range[1]) });
        };
    });
};
toneButton = Button(window, Rect(20, 540, 180, 40)).states_([["Tone on"], ["Tone off"]]).action_({ |view| env.use { ~swarmSet.value(\gate, view.value) } });
Button(window, Rect(220, 540, 180, 40)).states_([["Beep"]]).action_({ env.use { ~swarmBeep.value } });
Button(window, Rect(420, 540, 180, 40)).states_([["PANIC / all devices"]]).action_({ env.use { ~swarmPanic.value } });
StaticText(window, Rect(20, 592, 580, 44)).string_("Pads: 1 hold tone / 2 beep / 8 panic. Knobs 1-5: pitch, gain, size, speed, hue.\nPhones must tap Enable sound. Reconnects require Resume.");
refresh = {
    var state, lines, currentNames = ~swarmClients.keys.asArray.sort;
    if(currentNames != names) {
        names = currentNames;
        if((~swarmTarget != "*") and: { names.includes(~swarmTarget).not }) { ~swarmTarget = "*" };
        selector.items_(["All devices"] ++ names);
        selector.value_(if(~swarmTarget == "*") { 0 } { names.indexOf(~swarmTarget) + 1 });
    };
    state = if(~swarmTarget == "*") { ~swarmDefaults } { ~swarmClients[~swarmTarget][\state] };
    sliders.keysValuesDo { |key, slider|
        var range = ~swarmLimits[key], value = state[key];
        slider.value_(if(key == \pitch) { value.explin(range[0], range[1], 0, 1) } { value.linlin(range[0], range[1], 0, 1) });
        values[key].string_(value.round(0.001).asString);
    };
    toneButton.value_(if(~swarmTarget == "*") {
        if(~swarmClients.notEmpty and: { ~swarmClients.values.every { |c| c[\state][\gate] == 1 } }) { 1 } { 0 }
    } { state[\gate] });
    lines = names.collect { |id|
        var c = ~swarmClients[id];
        id ++ "  " ++ if(c[\ready] == 1) { "ready" } { "inactive" }
        ++ if(c[\muted] == 1) { " / muted" } { "" }
        ++ if(c[\visible] == 0) { " / hidden" } { "" }
        ++ "  " ++ c[\audio] ++ "  " ++ c[\fps].round.asString ++ " fps  " ++ c[\rtt].asString ++ " ms RTT"
    };
    status.string_(if(Main.elapsedTime - lastGateway > 3) { "Gateway unavailable. Start npm start." } {
        if(names.isEmpty) { "Gateway connected. Open the printed LAN URL on a phone." } { lines.join("\n") }
    });
};
~swarmStop = {
    if(stopping.not) {
        stopping = true;
        env.use { ~swarmPanic.value };
        if(routine.notNil) { routine.stop };
        keys.do { |key| OSCdef(key).free };
        if(window.isClosed.not) { window.close };
    };
};
window.onClose_({ ~swarmStop.value });
routine = Routine({
    var tick = 0;
    loop {
        if((tick % 10) == 0) { gateway.sendMsg("/swarm/heartbeat", session) };
        if(Main.elapsedTime - lastGateway > 3) {
            if(~swarmClients.notEmpty) { ~swarmPanic.value; ~swarmClients.clear };
        };
        ~swarmSendStates.value;
        if((tick % 5) == 0) { refresh.value };
        tick = tick + 1;
        0.1.wait;
    };
}).play(AppClock);
window.front;
("Nervengarten controller on language port " ++ NetAddr.langPort).postln;
if(NetAddr.langPort != 57120) { "Akai config targets port 57120. Point its target at the language port above, then restart Akai.".warn };
)
