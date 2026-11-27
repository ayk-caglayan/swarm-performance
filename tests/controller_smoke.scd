(
var root = PathName(thisProcess.nowExecutingPath).pathOnly.dirname;
var assert = { |condition, label| if(condition.not) { Error("FAIL: " ++ label).throw } };
var sent = List.new;
try {
(root +/+ "supercollider/core.scd").load;
~swarmEmit = { |address, args| sent.add([address, args]) };
~swarmJoin.value("aaaaaaaaaaaa"); ~swarmJoin.value("bbbbbbbbbbbb");
~swarmKnob.value(0, -500);
assert.value(~swarmClients["aaaaaaaaaaaa"][\state][\pitch] == 220, "negative relative knob clamps");
~swarmKnob.value(1, 900);
assert.value((~swarmClients["aaaaaaaaaaaa"][\state][\gain] - 0.15).abs < 0.0001, "upper knob clamps");
~swarmTarget = "aaaaaaaaaaaa";
~swarmSet.value(\pitch, 880);
assert.value(~swarmClients["bbbbbbbbbbbb"][\state][\pitch] == 220, "individual isolation");
~swarmPad.value(0, 1);
~swarmTarget = "bbbbbbbbbbbb";
~swarmPad.value(0, 0);
assert.value(~swarmClients["aaaaaaaaaaaa"][\state][\gate] == 0, "release retains original target");
sent.clear;
~swarmPad.value(1, 0.5); ~swarmPad.value(1, 0.8);
assert.value(sent.select { |entry| entry[0] == "/swarm/beep" }.size == 1, "pressure does not repeat beep");
~swarmPad.value(1, 0); ~swarmPad.value(1, 1);
assert.value(sent.select { |entry| entry[0] == "/swarm/beep" }.size == 2, "next press beeps");
~swarmSet.value(\gate, 1, "*");
~swarmJoin.value("cccccccccccc");
assert.value(~swarmClients["cccccccccccc"][\state][\gate] == 0, "new clients start silent");
assert.value(~swarmClients["cccccccccccc"][\state][\pitch] == 220, "new clients inherit broadcast defaults");
~swarmPanic.value;
assert.value(~swarmClients.values.every { |c| c[\state][\gate] == 0 }, "panic clears all gates");
assert.value(sent.last[0] == "/swarm/panic", "panic emits immediately");
assert.value(~swarmFields.size == 8, "OSC state field count");
"PASS: controller mapping, routing, pad edges, defaults, panic".postln;
0.exit;
} { |error| error.reportError; 1.exit };
)
