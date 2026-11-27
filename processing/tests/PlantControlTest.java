import java.net.*;
import oscP5.*;
public class PlantControlTest {
  static void check(boolean v, String label) { if (!v) throw new AssertionError(label); }
  static void send(DatagramSocket socket, int port, OscMessage m) throws Exception {
    byte[] bytes=m.getBytes(); socket.send(new DatagramPacket(bytes,bytes.length,InetAddress.getLoopbackAddress(),port)); Thread.sleep(80);
  }
  public static void main(String[] args) throws Exception {
    BranchingGarden p=new BranchingGarden();
    int port;
    try(DatagramSocket reserve=new DatagramSocket(0,InetAddress.getLoopbackAddress())) { port=reserve.getLocalPort(); }
    p.setupPerformance(port); p.regenerate(); Thread.sleep(200);
    try(DatagramSocket sender=new DatagramSocket()) {
      send(sender,port,new OscMessage("/plant/state").add(.4f).add(.6f).add(.2f).add(.5f).add(.7f));
      p.updatePerformance(); check(p.remote && !p.demo && p.growth==.4f,"UDP state");
      send(sender,port,new OscMessage("/plant/hit").add(Float.NaN)); p.updatePerformance(); check(p.hit==0,"reject NaN");
      send(sender,port,new OscMessage("/plant/blackout").add(1)); p.updatePerformance(); check(p.blackout,"blackout");
      send(sender,port,new OscMessage("/plant/blackout").add(0)); p.updatePerformance(); check(!p.blackout,"unblackout");
      send(sender,port,new OscMessage("/plant/hit").add(.8f)); p.updatePerformance(); check(p.hit>0,"hit");
      p.lastControl=System.nanoTime()-4000000000L; p.updatePerformance(); check(p.blackout,"stale control");
      send(sender,port,new OscMessage("/plant/heartbeat")); p.updatePerformance(); check(p.blackout,"heartbeat alone cannot rearm");
      send(sender,port,new OscMessage("/plant/state").add(.7f).add(.6f).add(.2f).add(.5f).add(.7f)); p.updatePerformance(); check(!p.blackout,"fresh state restores");
      for(int seed: new int[]{0,42,-1,1847}) { p.plantSeed=seed; p.regenerate(); }
      BloomColony flowers=new BloomColony();
      for(int seed: new int[]{0,42,-1,1847}) { flowers.plantSeed=seed; flowers.regenerate(); }
      System.out.println("PASS: real UDP control, rejection, blackout, expiry, recovery and seeds");
    } finally { p.plantOSC.dispose(); }
  }
}
