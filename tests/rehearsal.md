# Physical acceptance record

Not yet performed. Use 3–5 phones, including iPhone Safari and Android Chrome, for a 20-minute foreground session.

Record date, access point, Mac LAN address, phone model, OS version, browser version, output route (speaker/headphone/Bluetooth), and tester for each device. Start with low hardware volume.

| Check | Expected | Observed / pass or fail |
| --- | --- | --- |
| LAN join and activation | Every phone opens the local page and makes one quiet confirmation beep after tapping Enable sound | |
| Individual identity | Device ID matches master; individual beep is audible/visible only on that phone | |
| Broadcast | Every enabled phone responds | |
| Knobs and joystick | Pitch, gain, size, speed, hue and position follow controls without recurring clicks | |
| Pad pressure and release | One beep per press; tone ends on release, including after changing target | |
| Personal mute | Muted phone stays silent under all master commands | |
| Panic | Every healthy foreground phone begins fading within 500 ms; record external observation/recording, not RTT | |
| Wi-Fi loss | Foreground phone becomes silent within approximately 3.2 s; reconnect needs Resume and does not replay beeps | |
| Master / gateway restart | Gates reset; no unexpected sound; Resume and a new command work | |
| Lock, app switching, interruption | Phone resumes only after returning and tapping Resume; record OS-specific behavior | |
| Rotation / reduced motion | Canvas fits; reduced-motion setting stops oscillation and pulse enlargement | |
| HTTPS and automatic wake | Trusted HTTPS has no certificate warning; enabling sound keeps the screen on past its normal timeout | |
| Domain offline | Fresh load of https://swarm.aykutcaglayan.net with WAN unplugged resolves locally, has no certificate warning, connects WSS, and responds to controls | |
| Wake release / return | Allow screen sleep releases the lock; Keep screen awake reacquires it; returning from another app reacquires wake while audio still needs Resume | |
| Unsupported / denied wake | HTTP, unsupported browser, or battery saver shows an explanation and does not break sound | |
| 20-minute run | Record FPS and RTT ranges, disconnections, audio faults and any resource growth | |

The planned 500 ms panic response is a test target, not a browser/network guarantee. Record audible/visible timing separately from acknowledgment RTT. Browser-reported readiness does not prove the speaker is audible. Do not claim 20–50-device capacity from this rehearsal.
