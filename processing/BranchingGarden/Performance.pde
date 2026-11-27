import oscP5.*;
import java.util.concurrent.ArrayBlockingQueue;

float growth = .8, bloom = .8, wind = .25, density = .65, lightLevel = .85;
float sceneTime = 0, hit = 0, orbit = 0, tilt = 0;
boolean blackout = false;
int plantSeed = 1847;
boolean demo = true, paused = false, showHelp = false;
boolean explicitBlackout = false, remote = false, remoteFresh = false;
long previousTick, lastControl;
int plantPort;
String capturePath = null;
OscP5 plantOSC;
final ArrayBlockingQueue<PlantCommand> plantCommands = new ArrayBlockingQueue<PlantCommand>(64);

class PlantCommand {
  final String address;
  final Object[] values;
  final long received;
  PlantCommand(String a, Object[] v) { address = a; values = v.clone(); received = System.nanoTime(); }
}

void setupPerformance(int port) {
  PlantProtocol.selfTest();
  plantPort = port;
  if (args != null) for (String argument : args)
    if (argument.startsWith("--capture=")) capturePath = argument.substring(10);
  if (capturePath != null && !new java.io.File(capturePath).isAbsolute())
    throw new IllegalArgumentException("Capture path must be absolute");
  previousTick = System.nanoTime();
  if (capturePath != null) { demo = false; growth = .9; bloom = .9; sceneTime = 7.5; }
  else {
    OscProperties properties = new OscProperties();
    properties.setHost("127.0.0.1"); properties.setPort(port);
    properties.setDatagramSize(1024);
    // oscP5 registers its dispose callback with this PApplet and closes its socket on exit.
    plantOSC = new OscP5(this, properties);
    println("Plant controls: H for help; OSC 127.0.0.1:" + port);
  }
}

void oscEvent(OscMessage message) {
  Object[] values = message.arguments();
  if (!PlantProtocol.valid(message.addrPattern(), message.typetag(), values)) return;
  PlantCommand command = new PlantCommand(message.addrPattern(), values);
  // Bound memory under a burst; obsolete control messages yield to the newest messages.
  if (!plantCommands.offer(command)) { plantCommands.poll(); plantCommands.offer(command); }
}

void updatePerformance() {
  long now = System.nanoTime();
  float dt = min(.1, (now - previousTick) / 1e9f);
  previousTick = now;
  if (capturePath != null) return;
  for (int i = 0; i < 64; i++) {
    PlantCommand command = plantCommands.poll();
    if (command == null) break;
    Object[] v = command.values;
    if (now - command.received > 3000000000L) continue;
    if (command.address.equals("/plant/state")) {
      growth = (Float)v[0]; bloom = (Float)v[1]; wind = (Float)v[2];
      density = (Float)v[3]; lightLevel = (Float)v[4];
      demo = false; remote = true; remoteFresh = true; lastControl = command.received;
    } else if (command.address.equals("/plant/heartbeat")) lastControl = command.received;
    else if (command.address.equals("/plant/hit")) hit = (Float)v[0];
    else if (command.address.equals("/plant/blackout")) explicitBlackout = (Integer)v[0] == 1;
    else if (command.address.equals("/plant/reset")) { plantSeed = (Integer)v[0]; regenerate(); }
  }
  if (remote && now - lastControl > 3000000000L) remoteFresh = false;
  blackout = explicitBlackout || (remote && !remoteFresh);
  if (!paused) {
    sceneTime += dt;
    hit *= exp(-dt * 5);
    if (demo) {
      growth = .8 + .15 * sin(sceneTime * .13);
      bloom = .8 + .18 * sin(sceneTime * .17);
    }
  }
}

void keyPressed() {
  if (capturePath != null) return;
  if (key == CODED) {
    if (keyCode == UP || keyCode == DOWN || keyCode == LEFT || keyCode == RIGHT) {
      demo = false; remote = false;
      if (keyCode == UP) growth = min(1, growth + .05);
      if (keyCode == DOWN) growth = max(0, growth - .05);
      if (keyCode == RIGHT) bloom = min(1, bloom + .05);
      if (keyCode == LEFT) bloom = max(0, bloom - .05);
    }
    return;
  }
  switch (Character.toLowerCase(key)) {
    case ' ': hit = 1; break;
    case 'd': demo = !demo; remote = false; break;
    case 'r': plantSeed++; regenerate(); break;
    case 'b': explicitBlackout = !explicitBlackout; break;
    case 'h': showHelp = !showHelp; break;
    case 'p': paused = !paused; break;
    case 's': saveFrame("captures/plant-####.png"); break;
  }
}

void mouseDragged() {
  if (capturePath != null) return;
  orbit += (mouseX - pmouseX) * .008;
  tilt = constrain(tilt + (mouseY - pmouseY) * .006, -.6, .6);
}

void drawOverlay() {
  if (showHelp && !blackout) {
    hint(DISABLE_DEPTH_TEST); pushStyle(); pushMatrix(); camera();
    noLights(); fill(0, 210); noStroke(); rect(16, 16, 570, 112);
    fill(235); textSize(13);
    text("Drag: orbit / tilt     Arrows: growth / bloom     Space: pulse", 30, 42);
    text("D demo   R new seed   B blackout   P pause   S capture   H help", 30, 65);
    text("OSC 127.0.0.1:" + plantPort + "   " + (remote ? "REMOTE" : demo ? "DEMO" : "MANUAL")
      + "   growth " + nf(growth, 1, 2) + "   bloom " + nf(bloom, 1, 2), 30, 88);
    text("Control loss: black after 3 seconds; a fresh state restores the image.", 30, 111);
    popMatrix(); popStyle(); hint(ENABLE_DEPTH_TEST);
  }
  if (capturePath != null && frameCount >= 90) { save(capturePath); exit(); }
}
