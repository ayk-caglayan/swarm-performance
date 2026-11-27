// A small colony of curved stems and unfolding, layered flowers.
Plant[] plants;
final int STEM_STEPS = 24;

void settings() {
  size(1280, 800, P3D);
  smooth(4);
}

void setup() {
  surface.setTitle("Nervengarten / Bloom Colony");
  frameRate(60);
  sphereDetail(7);
  setupPerformance(57123);
  regenerate();
}

void regenerate() {
  randomSeed(plantSeed);
  plants = new Plant[9];
  float[] positions = {0, -175, 175, -85, 85, -275, 275, -135, 135};
  for (int i = 0; i < plants.length; i++) {
    plants[i] = new Plant(positions[i], i);
    for (int j = 0; j <= STEM_STEPS; j++) {
      checkPoint(plants[i].stemPoint(j / float(STEM_STEPS), 0));
    }
    for (int j = 0; j <= 12; j++) {
      checkPoint(petalPoint(j / 12.0, 1, 92, 27, 1.5, 0.22, 8));
    }
  }
}

void checkPoint(PVector p) {
  if (Float.isNaN(p.x) || Float.isNaN(p.y) || Float.isNaN(p.z)
    || Float.isInfinite(p.x) || Float.isInfinite(p.y) || Float.isInfinite(p.z)
    || abs(p.x) > 1800 || abs(p.y) > 1800 || abs(p.z) > 1800) {
    throw new RuntimeException("Bloom Colony geometry outside finite bounds");
  }
}

void draw() {
  updatePerformance();
  background(0);
  if (!blackout && lightLevel > 0) {
    camera();
    perspective(PI / 3, float(width) / height, 5, 3000);
    float brightness = constrain(lightLevel, 0, 1);
    ambientLight(80 * brightness, 80 * brightness, 80 * brightness);
    directionalLight(235 * brightness, 235 * brightness, 235 * brightness, -0.25, 1, -0.4);
    directionalLight(92 * brightness, 92 * brightness, 92 * brightness, 0.7, -0.2, 0.4);
    specular(100 * brightness);
    shininess(16);
    noStroke();
    pushMatrix();
    translate(width * 0.5, height * 0.57, -65);
    rotateX(-0.3 + tilt);
    rotateY(orbit);
    translate(0, 220, 0);
    int count = constrain(round(lerp(3, 9, constrain(density, 0, 1))), 3, 9);
    for (int i = count - 1; i >= 0; i--) plants[i].display();
    popMatrix();
    noLights();
  }
  drawOverlay();
}

float ease(float edge0, float edge1, float value) {
  float u = constrain((value - edge0) / (edge1 - edge0), 0, 1);
  return u * u * (3 - 2 * u);
}

class Plant {
  float baseX, baseZ, height, leanX, leanZ, curve, phase, flowerSize;
  float[][] lengths = new float[3][10];
  float[] leafAngles = new float[4];

  Plant(float x, int index) {
    baseX = x + random(-12, 12);
    baseZ = random(-95, 105);
    height = random(260, 425);
    if (index == 0) height = 430;
    leanX = random(-42, 42);
    leanZ = random(-26, 26);
    curve = random(-30, 30);
    phase = random(TWO_PI);
    flowerSize = random(0.75, 1.1);
    for (int row = 0; row < 3; row++) {
      for (int i = 0; i < 10; i++) lengths[row][i] = random(0.9, 1.08);
    }
    for (int i = 0; i < 4; i++) leafAngles[i] = phase + i * 2.4 + random(-0.25, 0.25);
  }

  PVector stemPoint(float u, float movement) {
    float sway = constrain(movement, 0, 1) * 19 * u * u;
    return new PVector(
      baseX + leanX * u * u + curve * sin(PI * u) + sway * sin(sceneTime * 0.8 + phase + u),
      -height * u,
      baseZ + leanZ * u * u + 0.4 * curve * sin(PI * u) + sway * cos(sceneTime * 0.63 + phase + u));
  }

  void display() {
    float grown = constrain(growth, 0, 1);
    float reach = ease(0, 0.78, grown);
    if (reach < 0.002) return;
    drawStem(reach);
    for (int i = 0; i < 4; i++) {
      float anchor = 0.2 + i * 0.16;
      float unfold = ease(anchor, anchor + 0.18, reach);
      if (unfold > 0.001) {
        PVector p = stemPoint(anchor, wind);
        pushMatrix();
        translate(p.x, p.y, p.z);
        rotateY(leafAngles[i]);
        rotateZ(-0.27 * (1 - unfold));
        drawLeaf((74 - i * 9) * unfold, (18 - i * 2) * unfold);
        popMatrix();
      }
    }
    float flowerGrowth = ease(0.34, 1, grown);
    if (flowerGrowth > 0.002) {
      PVector tip = stemPoint(reach, wind);
      PVector previous = stemPoint(max(0, reach - 0.015), wind);
      pushMatrix();
      orientFlower(tip, PVector.sub(previous, tip).normalize());
      scale(flowerSize * flowerGrowth);
      drawFlower();
      popMatrix();
    }
  }

  void drawStem(float reach) {
    fill(135);
    for (int step = 0; step < STEM_STEPS; step++) {
      float a = reach * step / STEM_STEPS;
      float b = reach * (step + 1) / STEM_STEPS;
      PVector p = stemPoint(a, wind), q = stemPoint(b, wind);
      PVector tangent = PVector.sub(q, p).normalize();
      PVector side = tangent.cross(new PVector(0, 0, 1)).normalize();
      PVector front = tangent.cross(side).normalize();
      beginShape(QUAD_STRIP);
      for (int k = 0; k <= 8; k++) {
        float angle = TWO_PI * k / 8;
        PVector n = PVector.add(PVector.mult(side, cos(angle)), PVector.mult(front, sin(angle)));
        normal(n.x, n.y, n.z);
        float r = lerp(3.6, 1.3, a);
        vertex(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
        r = lerp(3.6, 1.3, b);
        vertex(q.x + n.x * r, q.y + n.y * r, q.z + n.z * r);
      }
      endShape();
    }
  }

  void drawFlower() {
    float opening = constrain(bloom, 0, 1);
    float flex = constrain(hit, 0, 1) * 0.16;
    for (int row = 0; row < 3; row++) {
      int petals = 9 - row;
      float length = 87 - row * 21;
      float angle = lerp(0.13 + row * 0.06, 1.63 - row * 0.25, opening) + flex;
      for (int i = 0; i < petals; i++) {
        pushMatrix();
        rotateY(TWO_PI * i / petals + row * 0.39 + phase);
        translate(4 + row * 1.2, -row * 3, 0);
        rotateZ(sin(sceneTime * 0.9 + phase + i) * constrain(wind, 0, 1) * 0.018);
        fill(185 + row * 29);
        drawPetal(length * lengths[row][i], 25 - row * 4, angle, 0.1 + opening * 0.18, 7 - row);
        popMatrix();
      }
    }
    // A small upright seed cluster keeps the flower's center legible.
    fill(165);
    pushMatrix();
    translate(0, -8, 0);
    scale(1, 0.7, 1);
    sphere(10);
    popMatrix();
    for (int i = 0; i < 14; i++) {
      float a = i * 2.39996;
      float r = 2 + 5 * sqrt(i / 13.0);
      float h = 10 + 6 * sin(i * 1.9 + phase);
      stroke(130 * lightLevel);
      strokeWeight(0.8);
      line(cos(a) * r, -6, sin(a) * r, cos(a) * r * 1.2, -h, sin(a) * r * 1.2);
      noStroke();
      fill(225);
      pushMatrix();
      translate(cos(a) * r * 1.2, -h, sin(a) * r * 1.2);
      scale(0.7, 1.3, 0.7);
      sphere(1.8);
      popMatrix();
    }
  }
}

void orientFlower(PVector position, PVector down) {
  PVector xAxis = new PVector(1, 0, 0);
  xAxis.sub(PVector.mult(down, xAxis.dot(down))).normalize();
  PVector zAxis = xAxis.cross(down).normalize();
  applyMatrix(xAxis.x, down.x, zAxis.x, position.x,
              xAxis.y, down.y, zAxis.y, position.y,
              xAxis.z, down.z, zAxis.z, position.z,
              0, 0, 0, 1);
}

PVector petalPoint(float u, float v, float length, float width, float angle, float droop, float cup) {
  return new PVector(
    length * (sin(angle) * u + 0.12 * sin(PI * u)),
    -length * cos(angle) * u + length * droop * u * u * u - cup * v * v * sin(PI * u),
    width * sin(PI * u) * v);
}

void petalVertex(float u, float v, float length, float width, float angle, float droop, float cup) {
  float s = sin(PI * u), c = cos(PI * u);
  float dx = length * (sin(angle) + 0.12 * PI * c);
  float dy = -length * cos(angle) + 3 * length * droop * u * u - cup * v * v * PI * c;
  float dz = width * PI * c * v;
  float vy = -2 * cup * v * s, vz = width * s;
  float nx = dy * vz - dz * vy, ny = -dx * vz, nz = dx * vy;
  float magnitude = max(0.0001, sqrt(nx * nx + ny * ny + nz * nz));
  normal(nx / magnitude, ny / magnitude, nz / magnitude);
  vertex(length * (sin(angle) * u + 0.12 * s),
    -length * cos(angle) * u + length * droop * u * u * u - cup * v * v * s,
    width * s * v);
}

void drawPetal(float length, float width, float angle, float droop, float cup) {
  for (int j = 0; j < 14; j++) {
    float a = lerp(0.001, 0.999, j / 14.0);
    float b = lerp(0.001, 0.999, (j + 1) / 14.0);
    beginShape(QUAD_STRIP);
    for (int k = 0; k <= 6; k++) {
      float v = map(k, 0, 6, -1, 1);
      petalVertex(a, v, length, width, angle, droop, cup);
      petalVertex(b, v, length, width, angle, droop, cup);
    }
    endShape();
  }
}

void drawLeaf(float length, float width) {
  fill(150);
  drawPetal(length, width, 0.95, 0.1, 6);
  stroke(185 * lightLevel);
  strokeWeight(0.8);
  noFill();
  beginShape();
  for (int j = 0; j <= 12; j++) {
    PVector p = petalPoint(j / 12.0, 0, length, width, 0.95, 0.1, 6);
    vertex(p.x, p.y - 0.4, p.z);
  }
  endShape();
  noStroke();
}
