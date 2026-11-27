Frond[] garden = new Frond[9];

void settings() {
  size(1280, 800, P3D);
  smooth(4);
}

void setup() {
  surface.setTitle("Nervengarten / Branching Garden");
  frameRate(60);
  setupPerformance(57122);
  regenerate();
}

void regenerate() {
  randomSeed(plantSeed);
  float[] spread = { -28, 112, -142, 215, -225, 65, -85, 170, -175 };
  for (int i = 0; i < garden.length; i++) {
    garden[i] = new Frond(i, spread[i]);
    for (int j = 0; j <= 36; j++) {
      PVector p = garden[i].point(j / 36.0, 0);
      if (!Float.isFinite(p.x + p.y + p.z) || p.mag() > 700)
        throw new IllegalStateException("Plant geometry exceeds its finite 700-unit envelope");
    }
  }
}

void draw() {
  updatePerformance();
  background(0);
  if (!blackout && lightLevel > 0) {
    float illumination = constrain(lightLevel, 0, 1);
    ambientLight(75 * illumination, 75 * illumination, 75 * illumination);
    directionalLight(225 * illumination, 225 * illumination, 225 * illumination, -0.5, 0.35, -1);
    directionalLight(70 * illumination, 70 * illumination, 70 * illumination, 0.7, -0.2, 0.5);
    specular(100);
    shininess(18);
    pushMatrix();
    translate(width * 0.5, height * 0.85, 0);
    rotateX(tilt);
    rotateY(orbit);
    int count = round(lerp(3, garden.length, constrain(density, 0, 1)));
    for (int i = count - 1; i >= 0; i--) garden[i].render();
    popMatrix();
    noLights();
  }
  drawOverlay();
}

class Frond {
  int index;
  float reach, heightOfStem, depth, twist, delay, phase;
  float[] leafLength = new float[13];
  float[] leafTwist = new float[13];

  Frond(int number, float spread) {
    index = number;
    reach = spread;
    heightOfStem = 505 - abs(spread) * 0.6 + random(-20, 20);
    depth = random(-100, 85);
    twist = random(-0.55, 0.55);
    delay = number * 0.025;
    phase = random(TWO_PI);
    for (int j = 0; j < leafLength.length; j++) {
      float t = j / float(leafLength.length - 1);
      leafLength[j] = (27 + 49 * pow(sin(PI * (0.18 + t * 0.78)), 0.8)) * random(0.86, 1.12);
      leafTwist[j] = random(-0.15, 0.15);
      if (!(leafLength[j] > 0 && leafLength[j] < 90))
        throw new IllegalStateException("Leaf length is outside the bounded generation range");
    }
  }

  PVector point(float t, float sway) {
    float bend = pow(t, 1.65);
    return new PVector(reach * bend + sway * t * t,
      -heightOfStem * (t + 0.07 * sin(PI * t)),
      depth * bend + 14 * sin(PI * t));
  }

  void render() {
    float extent = constrain((growth - delay) / (1 - delay), 0, 1);
    if (extent <= 0) return;
    float sway = wind * (12 * sin(sceneTime * 0.8 + phase) + 5 * sin(sceneTime * 1.7 + phase));
    sway += hit * (index % 2 == 0 ? 17 : -17);
    float silver = 205 + index % 3 * 12;
    noStroke();
    fill(silver);
    stem(extent, sway);
    for (int j = 0; j < leafLength.length; j++) {
      float at = lerp(0.19, 0.95, j / float(leafLength.length - 1));
      float emerge = constrain((extent - at) * 9, 0, 1);
      if (emerge <= 0) continue;
      PVector position = point(at, sway);
      float openness = constrain(bloom, 0, 1) * emerge;
      for (int side = -1; side <= 1; side += 2) {
        pushMatrix();
        translate(position.x, position.y + side * 2.5, position.z);
        rotateY(twist + leafTwist[j] + side * 0.12);
        scale(side, 1, 1);
        rotateZ(lerp(-1.35, -0.28, openness) + wind * 0.025 * sin(sceneTime * 1.5 + j));
        float length = leafLength[j] * emerge * (side < 0 ? 0.94 : 1);
        leaf(length, openness, silver - j * 1.3);
        popMatrix();
      }
    }
    // A small furled tip makes an unfinished frond read as living growth.
    if (extent > 0.05) {
      PVector tip = point(extent, sway);
      pushMatrix();
      translate(tip.x, tip.y, tip.z);
      noFill();
      stroke(155 * lightLevel);
      strokeWeight(1.3);
      beginShape();
      float radius = 6 * (1 - constrain(bloom, 0, 1) * 0.6);
      for (int j = 0; j <= 20; j++) {
        float a = j / 20.0 * PI * 1.55;
        vertex(radius * (1 - cos(a)), -radius * sin(a), 0);
      }
      endShape();
      noStroke();
      popMatrix();
    }
  }

  void stem(float extent, float sway) {
    for (int j = 0; j < 32; j++) {
      float a = extent * j / 32.0;
      float b = extent * (j + 1) / 32.0;
      PVector p = point(a, sway), q = point(b, sway);
      beginShape(TRIANGLE_STRIP);
      for (int k = 0; k <= 7; k++) {
        float angle = TWO_PI * k / 7.0;
        float nx = cos(angle), nz = sin(angle);
        normal(nx, 0, nz);
        float ra = lerp(2.1, 0.38, a), rb = lerp(2.1, 0.38, b);
        vertex(p.x + nx * ra, p.y, p.z + nz * ra);
        vertex(q.x + nx * rb, q.y, q.z + nz * rb);
      }
      endShape();
    }
  }
}

PVector leafPoint(float length, float u, float edge, float openness) {
  float width = length * 0.155 * pow(max(0, sin(PI * u)), 0.85) * lerp(0.12, 1, openness);
  float curl = pow(u, 5);
  return new PVector(length * (u - 0.14 * curl),
    -length * (0.11 * sin(PI * u) + 0.16 * curl) + edge * width,
    length * (0.065 * sin(PI * u) + 0.11 * curl * (1 - openness)) - abs(edge) * width * 0.25);
}

void leaf(float length, float openness, float silver) {
  noStroke();
  for (int side = -1; side <= 1; side += 2) {
    fill(silver + (side < 0 ? 4 : -12));
    beginShape(TRIANGLE_STRIP);
    for (int j = 0; j <= 16; j++) {
      float u = j / 16.0;
      PVector center = leafPoint(length, u, 0, openness);
      PVector edge = leafPoint(length, u, side, openness);
      normal(0, side * 0.24, 0.97);
      vertex(center.x, center.y, center.z);
      vertex(edge.x, edge.y, edge.z);
    }
    endShape();
  }
  noFill();
  stroke(silver * 0.61 * lightLevel);
  strokeWeight(0.65);
  beginShape();
  for (int j = 0; j <= 16; j++) {
    PVector p = leafPoint(length, j / 16.0, 0, openness);
    vertex(p.x, p.y, p.z + 0.35);
  }
  endShape();
  noStroke();
}
