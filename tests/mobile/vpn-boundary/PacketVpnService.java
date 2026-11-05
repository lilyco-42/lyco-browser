package top.lain42.lycovpnboundary;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import java.util.TreeMap;
import org.json.JSONObject;

/** Captures/discards owned packets; never forwards or protects an outbound socket. */
public final class PacketVpnService extends VpnService {
    private static final Object LOCK = new Object();
    private static volatile boolean active;
    private static ParcelFileDescriptor tunnel;
    private static long packets;
    private static long stun;
    private static boolean revoked;
    private static String error = "";
    private static final TreeMap<Integer, Long> ports = new TreeMap<>();

    static JSONObject snapshot(Context context) {
        synchronized (LOCK) {
            try {
                ConnectivityManager manager = (ConnectivityManager) context.getSystemService(CONNECTIVITY_SERVICE);
                NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
                JSONObject counts = new JSONObject();
                for (Integer port : ports.keySet()) counts.put(String.valueOf(port), ports.get(port));
                return new JSONObject().put("active", active).put("fdValid", tunnel != null && tunnel.getFileDescriptor().valid())
                    .put("transportVpn", capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN))
                    .put("packets", packets).put("stunPackets", stun).put("stunDestinationPorts", counts)
                    .put("revoked", revoked).put("error", error).put("upstreamForwarding", false);
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (active) return START_NOT_STICKY;
        try {
            if (prepare(this) != null) throw new IllegalStateException("VPN consent missing");
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            manager.createNotificationChannel(new NotificationChannel("owned-vpn", "Owned VPN diagnostic", NotificationManager.IMPORTANCE_LOW));
            Notification notification = new Notification.Builder(this, "owned-vpn").setContentTitle("LYCO owned VPN probe")
                .setSmallIcon(android.R.drawable.stat_sys_warning).setOngoing(true).build();
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED);
            final ParcelFileDescriptor descriptor = new Builder().setSession("LYCO owned packet diagnostic")
                .addAddress("192.0.2.2", 32).addAddress("2001:db8::2", 128)
                .addRoute("0.0.0.0", 0).addRoute("::", 0)
                .addAllowedApplication(getPackageName()).setBlocking(false).establish();
            if (descriptor == null) throw new IllegalStateException("VPN establish returned null");
            synchronized (LOCK) { tunnel = descriptor; active = true; }
            Thread reader = new Thread(() -> readPackets(descriptor), "owned-tun-reader");
            reader.setDaemon(true);
            reader.start();
        } catch (Exception exception) {
            synchronized (LOCK) { error = exception.getClass().getSimpleName() + ": " + exception.getMessage(); }
            closeTunnel();
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void readPackets(ParcelFileDescriptor descriptor) {
        byte[] bytes = new byte[65535];
        while (active) {
            try {
                int length = Os.read(descriptor.getFileDescriptor(), bytes, 0, bytes.length);
                if (length <= 0) continue;
                synchronized (LOCK) {
                    packets++;
                    int version = (bytes[0] & 255) >>> 4;
                    int header = version == 4 ? (bytes[0] & 15) * 4 : 40;
                    int protocol = version == 4 && length > 9 ? bytes[9] & 255 : (length > 6 ? bytes[6] & 255 : -1);
                    int payload = header + 8;
                    if ((version == 4 || version == 6) && protocol == 17 && length >= payload + 20
                            && bytes[payload] == 0 && bytes[payload + 1] == 1
                            && (bytes[payload + 4] & 255) == 0x21 && (bytes[payload + 5] & 255) == 0x12
                            && (bytes[payload + 6] & 255) == 0xa4 && (bytes[payload + 7] & 255) == 0x42) {
                        int port = ((bytes[header + 2] & 255) << 8) | (bytes[header + 3] & 255);
                        stun++;
                        ports.put(port, ports.getOrDefault(port, 0L) + 1);
                    }
                }
            } catch (ErrnoException exception) {
                if (!active) return;
                if (exception.errno != OsConstants.EAGAIN && exception.errno != OsConstants.EINTR) {
                    synchronized (LOCK) { error = exception.getMessage(); }
                    return;
                }
                try { Thread.sleep(10); } catch (InterruptedException interrupted) { return; }
            } catch (java.io.InterruptedIOException exception) {
                if (active) synchronized (LOCK) { error = exception.getMessage(); }
                return;
            }
        }
    }

    private static void closeTunnel() {
        synchronized (LOCK) {
            active = false;
            if (tunnel != null) {
                try { tunnel.close(); } catch (Exception ignored) { }
                tunnel = null;
            }
        }
    }

    @Override public void onRevoke() {
        synchronized (LOCK) { revoked = true; }
        closeTunnel();
        stopSelf();
    }

    @Override public void onDestroy() {
        closeTunnel();
        super.onDestroy();
    }
}
