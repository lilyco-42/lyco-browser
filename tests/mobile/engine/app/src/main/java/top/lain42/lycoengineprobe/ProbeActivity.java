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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Standalone capability experiment. Never included in the LYCO product. */
public final class ProbeActivity extends Activity {
    private GeckoSession session;
    private GeckoRuntime runtime;
    private TextView status;
    private String baseUrl;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this);
        status.setText("Native engine experiment starting");
        layout.addView(status);
        setContentView(layout);
        try {
            baseUrl = getIntent().getDataString();
            String mode = getIntent().getStringExtra("mode");
            if (baseUrl == null || !baseUrl.matches("http://10\\.0\\.2\\.2:18080/rtc\\?phase=(control|lyco|control-after)")) {
                throw new IllegalArgumentException("Only owned fixture URLs are accepted");
            }
            if (!"direct".equals(mode) && !"policy".equals(mode)) throw new IllegalArgumentException("Invalid experiment mode");
            boolean policy = "policy".equals(mode);
            JSONObject prefs = new JSONObject();
            prefs.put("network.proxy.type", policy ? 1 : 0);
            prefs.put("network.proxy.http", "127.0.0.1");
            prefs.put("network.proxy.http_port", 18081);
            prefs.put("network.proxy.ssl", "127.0.0.1");
            prefs.put("network.proxy.ssl_port", 18081);
            prefs.put("network.proxy.share_proxy_settings", true);
            prefs.put("network.proxy.no_proxies_on", "");
            prefs.put("network.proxy.failover_direct", false);
            prefs.put("network.proxy.allow_hijacking_localhost", true);
            // This is the native preference used by Mozilla's documented
            // privacy.network.webRTCIPHandlingPolicy=proxy_only implementation.
            prefs.put("media.peerconnection.ice.proxy_only", policy);
            File configuration = new File(getFilesDir(), "owned-" + mode + ".json");
            Files.write(configuration.toPath(), new JSONObject().put("prefs", prefs).toString().getBytes(StandardCharsets.UTF_8));
            GeckoRuntimeSettings settings = new GeckoRuntimeSettings.Builder()
                .configFilePath(configuration.getAbsolutePath())
                .arguments(new String[] {"-profile", getDir("engine-" + mode, MODE_PRIVATE).getAbsolutePath()})
                .aboutConfigEnabled(false).remoteDebuggingEnabled(false).build();
            boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            if (debuggable) throw new IllegalStateException("The release experiment must not be debuggable");
            Log.i("LYCO_ENGINE_CONFIG", new JSONObject().put("mode", mode).put("debuggable", debuggable)
                .put("requestedNativePreferences", prefs).put("pagePolicyScript", false).toString());
            runtime = GeckoRuntime.create(getApplicationContext(), settings);
            session = new GeckoSession();
            session.setContentDelegate(new GeckoSession.ContentDelegate() {
                @Override public void onTitleChange(GeckoSession source, String title) {
                    // Actual document metadata, not a manufactured RTC result.
                    status.setText("ENGINE TITLE: " + title);
                }
            });
            GeckoView view = new GeckoView(this);
            session.open(runtime);
            view.setSession(session);
            layout.addView(view, new LinearLayout.LayoutParams(-1, 0, 1));
            session.loadUri(baseUrl);
        } catch (Exception error) {
            status.setText("ENGINE ERROR: " + error.getClass().getSimpleName());
            Log.e("LYCO_ENGINE_ERROR", "Native capability experiment failed", error);
        }
    }

    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (session == null) return;
        String action = intent.getStringExtra("action");
        // Ordinary fragment navigation in the owned fixture triggers its next
        // phase. No evaluateJavascript, page bridge, RTC shim or injected data.
        if ("stopped".equals(action) || "upload".equals(action)) session.loadUri(baseUrl + "#" + action);
    }

    @Override public void onDestroy() {
        if (session != null) session.close();
        if (runtime != null) runtime.shutdown();
        super.onDestroy();
    }
}
