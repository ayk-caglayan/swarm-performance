// Standalone projection controller. Evaluate this whole block; no phones/master changes.
(
if(~plantRoutine.notNil) { ~plantRoutine.stop };
~plantTargets = [NetAddr("127.0.0.1", 57122), NetAddr("127.0.0.1", 57123)];
~plantState = [0.8, 0.8, 0.25, 0.65, 0.85]; // growth, bloom, wind, density, light
~plantSend = { |address, args = #[]| ~plantTargets.do { |target| target.sendMsg(address, *args) } };
~plantSend.value("/plant/blackout", [0]);
~plantSend.value("/plant/reset", [1847]);
~plantRoutine = Routine({
    loop {
        ~plantSend.value("/plant/state", ~plantState.collect(_.asFloat));
        ~plantSend.value("/plant/heartbeat");
        0.1.wait;
    };
}).play(SystemClock);
~plantStop = {
    if(~plantRoutine.notNil) { ~plantRoutine.stop; ~plantRoutine = nil };
    ~plantSend.value("/plant/blackout", [1]);
};
)

// Evaluate individual lines as needed:
// ~plantState = [0.95, 0.95, 0.3, 0.8, 0.85];
// ~plantSend.value("/plant/hit", [0.8]);
// ~plantTargets = [NetAddr("127.0.0.1", 57122)]; // BranchingGarden only
// ~plantTargets = [NetAddr("127.0.0.1", 57123)]; // BloomColony only
// ~plantStop.value;
// In an existing SC master, use the same NetAddr/sendMsg calls on this separate branch.
// Match its shutdown hook with ~plantStop; do not tie plant blackout to phone gateway recovery.
