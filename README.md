# Nervengarten

Nervengarten is an audiovisual performance conceived for a gallery and the pavement outside it. The gallery sound system carries the music. Older mobile devices add voices and points of light throughout the room, each through its own speaker and screen. Visitors can join with the phones they already carry. Wherever the gallery Wi-Fi reaches, including on the pavement, their devices can extend the performance into the street.

The piece puts idle devices back to work as instruments and makes social connection part of the music. People inside and outside the gallery can add a voice to the same piece, here and now. Plant growth and formal systems such as L-systems freely inspire rhythmic pyramids and the repetition and branching of the projected forms.

![Preview of Nervengarten’s performance cues](assets/performance-cues.gif)

## What runs today

- **Phone instrument.** SuperCollider sends Open Sound Control (OSC) cues to a Node.js gateway on the same computer. The gateway sends control messages over WebSockets on the local WLAN. Each browser synthesizes its own tones and beeps with Web Audio and draws its own graphics with p5.js. [Gateway](server.js) · [Browser instrument](public/) · [SuperCollider controls](supercollider/)
- **Projection studies.** Two Processing sketches explore how forms grow, branch, and open in response to live OSC controls. Both can also run in a standalone demo mode. [Sketch controls and OSC reference](processing/README.md)

| [Bloom Colony](processing/BloomColony/) | [Branching Garden](processing/BranchingGarden/) |
| --- | --- |
| ![Bloom Colony with flowers opening on curved stems](assets/bloom-colony.png) | ![Branching Garden with fronds fanning out from a shared root](assets/branching-garden.png) |

The gallery-speaker composition and synchronized score are planned. Outdoor participation, phone audibility, and alignment between sound and projection need venue rehearsal.

## Try the prototypes

### Phones over local Wi-Fi

1. Connect your computer and phone to the same WLAN. The network must allow devices to reach each other.
2. From the repository root, run the following with Node.js 22 or newer.

   ```sh
   npm ci
   npm start
   ```

3. In SuperCollider, open `supercollider/master.scd` and evaluate the entire file.
4. Open the printed **Phone URL** on the phone. Keep the tab in the foreground, start with low device volume, and tap **Enable sound** once the controller connects.
5. In the SuperCollider window, select **All devices** and press **Beep**. The window also provides pitch, tone, and graphics controls. An Akai controller is optional for this test.

The default gateway serves HTTP on port 8081 and listens for OSC on loopback UDP port 57121. After dependency installation, the local HTTP rehearsal can run without internet access. Automatic screen wake requires trusted HTTPS. For a local HTTPS rehearsal, run `npm run setup:https`, install and trust the generated `.certs/swarm-ca.crt` on the rehearsal phone, then restart the gateway and open its printed keep-awake URL. [Local HTTPS setup script](scripts/setup-https.js)

### Projected plants

Open `processing/BloomColony/BloomColony.pde` or `processing/BranchingGarden/BranchingGarden.pde` in Processing 4 (Java Mode) and press **Run**. Keep each sketch folder intact so Processing can find the other tabs and the bundled oscP5 library. Use the arrow keys to change growth and opening, or evaluate the first block in `processing/plants-control.scd` in SuperCollider to send OSC controls. [Projection guide](processing/README.md)

## Checks

Run `npm test` from the repository root for the gateway, browser modules, and HTTPS tests. On macOS with Processing installed in Applications, run `sh processing/check.sh` to build both sketches and exercise their OSC controls.
