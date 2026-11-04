package top.lain42.lycoengineprobe;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.util.Log;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.UUID;

/** Owned CI profiles only. No product storage, web bridge or migration API. */
public final class StorageProbeActivity extends Activity {
    private GeckoRuntime runtime;
    private GeckoSession session;
    private TextView status;
    private String phase;
    private boolean closing;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this);
        layout.addView(status);
        setContentView(layout);
        try {
            if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                throw new IllegalStateException("Non-debuggable experiment required");
            }
            String id = getIntent().getStringExtra("profile");
            if (!"11111111-1111-4111-8111-111111111111".equals(id)
                    && !"22222222-2222-4222-8222-222222222222".equals(id)
                    && !"33333333-3333-4333-8333-333333333333".equals(id)
                    && !"44444444-4444-4444-8444-444444444444".equals(id)) {
                throw new IllegalArgumentException("Only owned CI UUIDs are accepted");
            }
            File base = new File(getNoBackupFilesDir().getCanonicalFile(), "lyco-gecko-data-v1");
            File profile = new File(base, UUID.fromString(id).toString());
            if (Files.isSymbolicLink(base.toPath()) || Files.isSymbolicLink(profile.toPath())
                    || !profile.getCanonicalFile().equals(profile.getAbsoluteFile())) {
                throw new IllegalStateException("Invalid owned profile path");
            }
            if ("clear".equals(getIntent().getStringExtra("action"))) {
                if (Files.exists(profile.toPath(), LinkOption.NOFOLLOW_LINKS)) {
                    Files.walkFileTree(profile.toPath(), new SimpleFileVisitor<Path>() {
                        @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                            Files.delete(file);
                            return FileVisitResult.CONTINUE;
                        }
                        @Override public FileVisitResult postVisitDirectory(Path dir, IOException error) throws IOException {
                            if (error != null) throw error;
                            Files.delete(dir);
                            return FileVisitResult.CONTINUE;
                        }
                    });
                }
                if (Files.exists(profile.toPath(), LinkOption.NOFOLLOW_LINKS)) throw new IOException("Profile remains");
                status.setText("STORAGE CLEARED: " + id);
                return;
            }
            String url = getIntent().getDataString();
            if (url == null || !url.matches("http://localhost:18080/storage\\?phase=[a-z-]{1,40}&action=(seed|read)&value=(A|B|none)")) {
                throw new IllegalArgumentException("Only the owned loopback origin is accepted");
            }
            phase = android.net.Uri.parse(url).getQueryParameter("phase");
            if (!profile.isDirectory() && !profile.mkdirs()) throw new IOException("Profile creation failed");
            JSONObject prefs = new JSONObject().put("network.proxy.type", 1)
                .put("network.proxy.http", "127.0.0.1").put("network.proxy.http_port", 18081)
                .put("network.proxy.ssl", "127.0.0.1").put("network.proxy.ssl_port", 18081)
                .put("network.proxy.share_proxy_settings", true).put("network.proxy.no_proxies_on", "")
                .put("network.proxy.failover_direct", false).put("network.proxy.allow_hijacking_localhost", true)
                .put("media.peerconnection.ice.proxy_only", true);
            File config = new File(getFilesDir(), "owned-storage-config.json");
            Files.write(config.toPath(), new JSONObject().put("prefs", prefs).toString().getBytes(StandardCharsets.UTF_8));
            GeckoRuntimeSettings settings = new GeckoRuntimeSettings.Builder()
                .configFilePath(config.getAbsolutePath())
                .arguments(new String[] {"-profile", profile.getAbsolutePath()})
                .aboutConfigEnabled(false).remoteDebuggingEnabled(false).build();
            runtime = GeckoRuntime.create(getApplicationContext(), settings);
            runtime.setDelegate(() -> {
                // An actual Gecko:Exited callback, never a timer or synthetic success.
                runtime = null;
                status.setText("GECKO SHUTDOWN COMPLETE: " + phase);
                Log.i("LYCO_STORAGE_SHUTDOWN", "Actual Gecko exit: " + phase);
            });
            session = new GeckoSession();
            session.setContentDelegate(new GeckoSession.ContentDelegate() {
                @Override public void onTitleChange(GeckoSession source, String title) { status.setText(title); }
            });
            GeckoView view = new GeckoView(this);
            session.open(runtime);
            view.setSession(session);
            layout.addView(view, new LinearLayout.LayoutParams(-1, 0, 1));
            session.loadUri(url);
        } catch (Exception error) {
            status.setText("STORAGE ERROR: " + error.getClass().getSimpleName());
            Log.e("LYCO_STORAGE_ERROR", "Owned storage experiment failed", error);
        }
    }

    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (!"close".equals(intent.getStringExtra("action")) || closing || runtime == null) return;
        closing = true;
        if (session != null) { session.close(); session = null; }
        runtime.shutdown();
    }

    @Override public void onDestroy() {
        if (session != null) session.close();
        if (runtime != null) runtime.shutdown();
        super.onDestroy();
    }
}
