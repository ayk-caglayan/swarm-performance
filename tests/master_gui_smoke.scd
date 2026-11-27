(
var root = PathName(thisProcess.nowExecutingPath).pathOnly.dirname;
(root +/+ "supercollider/master.scd").load;
Routine({
    try {
    1.wait;
    if(~swarmStop.isNil or: { OSCdef.all[\swarm_knob0].isNil }) { Error("FAIL: master did not load").throw };
    // OSC text arrives as Symbols in sclang, including epochs and device IDs.
    // Isolate test replies from a gateway already running on the Mac.
    OSCdef(\swarm_gateway, OSCdef.all[\swarm_gateway].func, nil, NetAddr("127.0.0.1", NetAddr.langPort));
    OSCdef(\swarm_client, OSCdef.all[\swarm_client].func, nil, NetAddr("127.0.0.1", NetAddr.langPort));
    NetAddr("127.0.0.1", NetAddr.langPort).sendMsg("/swarm/gateway", "testepoch");
    NetAddr("127.0.0.1", NetAddr.langPort).sendMsg("/swarm/client", "aaaaaaaaaaaa", 1, 0, 0, 1, 30, -1, 2, "not-enabled");
    0.1.wait;
    if(~swarmClients["aaaaaaaaaaaa"].isNil) { Error("FAIL: OSC Symbol device ID ignored").throw };
    NetAddr("127.0.0.1", NetAddr.langPort).sendMsg("/akai/knob/1", 127);
    0.6.wait;
    if((~swarmDefaults[\pitch] - 1760).abs > 0.01) { Error("FAIL: OSC knob mapping").throw };
    if(~swarmClients["aaaaaaaaaaaa"].isNil) { Error("FAIL: gateway acknowledgment ignored; client expired").throw };
    ~swarmStop.value;
    if(OSCdef.all[\swarm_knob0].notNil) { Error("FAIL: responder leaked").throw };
    "PASS: master GUI, refresh and cleanup".postln;
    0.exit;
    } { |error| error.reportError; 1.exit };
}).play(AppClock);
)
