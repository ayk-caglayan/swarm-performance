final class PlantProtocol {
  static boolean valid(String address, String types, Object[] values) {
    if (address == null || types == null || values == null) return false;
    String expected;
    switch (address) {
      case "/plant/state": expected = "fffff"; break;
      case "/plant/hit": expected = "f"; break;
      case "/plant/blackout": case "/plant/reset": expected = "i"; break;
      case "/plant/heartbeat": expected = ""; break;
      default: return false;
    }
    if (!expected.equals(types) || values.length != expected.length()) return false;
    for (int i = 0; i < values.length; i++) {
      if (expected.charAt(i) == 'f') {
        if (!(values[i] instanceof Float)) return false;
        float v = (Float) values[i];
        if (!Float.isFinite(v) || v < 0 || v > 1) return false;
      } else if (!(values[i] instanceof Integer)) return false;
    }
    return !address.equals("/plant/blackout") || ((Integer) values[0] >= 0 && (Integer) values[0] <= 1);
  }
  static void check(boolean result) { if (!result) throw new AssertionError("Plant OSC validation"); }
  static void selfTest() {
    check(valid("/plant/state", "fffff", new Object[]{0f, 1f, .5f, .6f, .8f}));
    check(!valid("/plant/state", "fffff", new Object[]{0f, 1f}));
    for (float bad : new float[]{Float.NaN, Float.POSITIVE_INFINITY, -.1f, 1.1f})
      check(!valid("/plant/hit", "f", new Object[]{bad}));
    check(!valid("/plant/hit", "i", new Object[]{1}));
    check(!valid("/plant/hit", "f", new Object[]{1}));
    check(valid("/plant/blackout", "i", new Object[]{1}));
    check(!valid("/plant/blackout", "i", new Object[]{2}));
    check(valid("/plant/reset", "i", new Object[]{-42}));
    check(valid("/plant/heartbeat", "", new Object[]{}));
    check(!valid("/plant/heartbeat", "i", new Object[]{0}));
    check(!valid("/unknown", "", new Object[]{}));
  }
}
