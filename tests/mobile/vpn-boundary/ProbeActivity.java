package top.lain42.lycovpnboundary;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.VpnService;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Owned diagnostic only: native WebView, no page bridge or RTC policy script. */
public final class ProbeActivity extends Activity {
    private WebView view;
    private TextView status;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            status.setText("LYCO_VPN " + PacketVpnService.snapshot(ProbeActivity.this));
            handler.postDelayed(this, 250);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) throw new IllegalStateException("Non-debuggable probe required");
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this);
        layout.addView(status);
        view = new WebView(this);
        view.getSettings().setJavaScriptEnabled(true);
        view.setWebViewClient(new WebViewClient());
        layout.addView(view, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        handler.post(refresh);
        handle(getIntent());
    }

    @Override public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }

    private void handle(Intent intent) {
        String action = intent.getStringExtra("action");
        if ("page".equals(action)) {
            String url = intent.getDataString();
            if (url == null || !url.matches("http://localhost:18080/probe\\?phase=(before|vpn|after)")) throw new IllegalArgumentException("Owned fixture only");
            view.loadUrl(url);
        } else if ("start-vpn".equals(action)) {
            Intent permission = VpnService.prepare(this);
            if (permission == null) startForegroundService(new Intent(this, PacketVpnService.class));
            else startActivityForResult(permission, 17);
        } else if ("stop-vpn".equals(action)) {
            startService(new Intent(this, PacketVpnService.class).setAction(PacketVpnService.STOP));
        }
    }

    @Override public void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 17 && result == RESULT_OK) startForegroundService(new Intent(this, PacketVpnService.class));
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(refresh);
        view.destroy();
        super.onDestroy();
    }
}
