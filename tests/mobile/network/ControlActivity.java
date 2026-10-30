package top.lain42.lyconetworkcontrol;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** CI positive control only. Not packaged in or callable by the product. */
public final class ControlActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        String url = getIntent().getDataString();
        if (url == null || !url.startsWith("http://10.0.2.2:18080/rtc?phase=control")) {
            finish(); return;
        }
        WebView view = new WebView(this);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.setWebViewClient(new WebViewClient());
        setContentView(view);
        view.loadUrl(url);
    }
}
