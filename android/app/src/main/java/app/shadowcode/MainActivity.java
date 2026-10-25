package app.shadowcode;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

/**
 * ShadowCode — a single-WebView shell around the React app.
 *
 * The web layer owns all UI. This Activity wires the native bridge (shell, files,
 * vault, HTTP) and stays deliberately defensive: any failure is shown on-screen
 * with a copyable report instead of killing the process.
 */
public class MainActivity extends Activity {

    private static final String TAG = "ShadowCode";
    private static final String DOMAIN = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + DOMAIN + "/index.html";
    private static final int REQ_PICK_FILE = 9001;

    private WebView web;
    private Bridge bridge;
    private WebViewAssetLoader assets;
    private ValueCallback<Uri[]> fileCallback;
    private long lastBack = 0L;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean contentShown = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            configureWindow();
            if (ShadowApp.readAsset(getApplication(), "index.html").isEmpty()) {
                showFatal("The web bundle is missing from this APK",
                        "assets/index.html could not be read.\n\nThis build was packaged without the ShadowCode UI. "
                                + "Re-run: npm run build:android && gradle assembleRelease");
                return;
            }
            buildUi();
        } catch (Throwable t) {
            ShadowApp.log("error", "onCreate failed: " + Log.getStackTraceString(t));
            showFatal("ShadowCode could not start", Log.getStackTraceString(t));
        }
    }

    /* ------------------------------------------------------------------ ui */

    private void buildUi() {
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#06070B"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        configureWebView();
        setContentView(web);
        contentShown = true;

        assets = new WebViewAssetLoader.Builder()
                .setDomain(DOMAIN)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    return assets.shouldInterceptRequest(request.getUrl());
                } catch (Throwable t) {
                    ShadowApp.log("error", "asset load failed: " + request.getUrl() + " · " + t);
                    return null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u.getHost() != null && u.getHost().equals(DOMAIN)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                ShadowApp.log("info", "page loaded " + url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request == null || !request.isForMainFrame()) return;
                ShadowApp.log("error", "page error " + error.getErrorCode() + " " + error.getDescription());
                showFatal("The interface failed to load",
                        "URL: " + request.getUrl() + "\nCode: " + error.getErrorCode() + "\n" + error.getDescription()
                                + "\n\nThis is usually a damaged install. Reinstalling the APK fixes it.");
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                ShadowApp.log("error", "renderer gone (crashed=" + detail.didCrash() + ")");
                ui.post(() -> {
                    try {
                        if (web != null) {
                            web.destroy();
                            web = null;
                        }
                    } catch (Throwable ignored) {
                    }
                    buildUi();
                });
                return true; // we handled it — process stays alive
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                String level = m.messageLevel() == ConsoleMessage.MessageLevel.ERROR ? "error" : "info";
                ShadowApp.log(level, "js: " + m.message() + " @" + m.lineNumber());
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(i, REQ_PICK_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        bridge = new Bridge(this, web);
        web.addJavascriptInterface(bridge, "ShadowNative");
        web.loadUrl(START_URL);
        ShadowApp.log("info", "loaded " + START_URL);
    }

    private void configureWindow() {
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        applyBars("dark");
    }

    public void applyBars(String theme) {
        try {
            Window w = getWindow();
            boolean light = "light".equals(theme);
            int color = Color.parseColor(light ? "#F3F4F9" : "#06070B");
            w.setStatusBarColor(color);
            w.setNavigationBarColor(color);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                new BarsApi30().apply(w, light);
            } else {
                int flags = light ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : 0;
                w.getDecorView().setSystemUiVisibility(flags);
            }
        } catch (Throwable t) {
            ShadowApp.log("error", "applyBars: " + t);
        }
    }

    /** Isolated so API 30 classes are never verified on older devices. */
    private static final class BarsApi30 {
        void apply(Window w, boolean light) {
            WindowInsetsController c = w.getInsetsController();
            if (c == null) return;
            int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            c.setSystemBarsAppearance(light ? mask : 0, mask);
        }
    }

    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        String ua = s.getUserAgentString();
        if (ua != null && !ua.contains("ShadowCode")) s.setUserAgentString(ua + " ShadowCode/1.0.2");
        try {
            WebView.setWebContentsDebuggingEnabled(true);
        } catch (Throwable ignored) {
        }
    }

    /* ----------------------------------------------------------- fallbacks */

    private void showFatal(String title, String body) {
        try {
            contentShown = false;
            ShadowApp.log("error", title + " — " + body);
            LinearLayout root = new LinearLayout(this);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setBackgroundColor(Color.parseColor("#06070B"));
            int pad = dp(22);
            root.setPadding(pad, pad + dp(24), pad, pad);

            TextView brand = new TextView(this);
            brand.setText("ShadowCode");
            brand.setTextColor(Color.parseColor("#7C5CFF"));
            brand.setTextSize(13);
            brand.setTypeface(Typeface.DEFAULT_BOLD);
            brand.setLetterSpacing(0.14f);
            root.addView(brand);

            TextView heading = new TextView(this);
            heading.setText(title);
            heading.setTextColor(Color.parseColor("#EEF0F7"));
            heading.setTextSize(22);
            heading.setTypeface(Typeface.DEFAULT_BOLD);
            heading.setPadding(0, dp(10), 0, dp(10));
            root.addView(heading);

            ScrollView scroll = new ScrollView(this);
            LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
            scroll.setLayoutParams(sp);
            TextView report = new TextView(this);
            report.setText(body);
            report.setTextColor(Color.parseColor("#9AA1B4"));
            report.setTextSize(12);
            report.setTypeface(Typeface.MONOSPACE);
            report.setTextIsSelectable(true);
            scroll.addView(report);
            root.addView(scroll);

            Button copy = new Button(this);
            copy.setText("Copy report");
            copy.setAllCaps(false);
            copy.setTextColor(Color.WHITE);
            GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                    new int[]{Color.parseColor("#7C5CFF"), Color.parseColor("#22D3EE")});
            bg.setCornerRadius(dp(26));
            copy.setBackground(bg);
            LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
            bp.topMargin = dp(16);
            copy.setLayoutParams(bp);
            copy.setOnClickListener(v -> {
                try {
                    android.content.ClipboardManager cm = (android.content.ClipboardManager)
                            getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("ShadowCode report", title + "\n\n" + body));
                    Toast.makeText(this, "Copied — send this to the developer", Toast.LENGTH_LONG).show();
                } catch (Throwable ignored) {
                }
            });
            root.addView(copy);

            Button retry = new Button(this);
            retry.setText("Retry");
            retry.setAllCaps(false);
            retry.setTextColor(Color.parseColor("#EEF0F7"));
            retry.setTextSize(14);
            LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
            rp.topMargin = dp(8);
            retry.setLayoutParams(rp);
            retry.setOnClickListener(v -> {
                try {
                    setContentView(new View(this));
                    buildUi();
                } catch (Throwable t) {
                    showFatal("Retry failed", Log.getStackTraceString(t));
                }
            });
            root.addView(retry);

            setContentView(root);
        } catch (Throwable t) {
            Log.e(TAG, "could not render error screen", t);
        }
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    /* --------------------------------------------------------------- events */

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        if (bridge != null) bridge.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web == null || !contentShown) {
            super.onBackPressed();
            return;
        }
        long now = System.currentTimeMillis();
        try {
            web.evaluateJavascript("window.__scBack && window.__scBack()", null);
        } catch (Throwable ignored) {
        }
        if (now - lastBack < 2200) {
            super.onBackPressed();
        } else {
            lastBack = now;
            Toast.makeText(this, "Press back again to leave ShadowCode", Toast.LENGTH_SHORT).show();
        }
    }

    public void pickFileForBridge(String id) {
        if (bridge != null) bridge.setPickerId(id);
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(i, Bridge.REQ_BRIDGE_PICK);
    }

    public void applyBarsFromBridge(String theme) {
        ui.post(() -> applyBars(theme));
    }

    public void closeApp() {
        ui.post(this::finish);
    }

    @Override
    protected void onDestroy() {
        try {
            if (bridge != null) bridge.shutdown();
        } catch (Throwable ignored) {
        }
        try {
            if (web != null) {
                web.removeJavascriptInterface("ShadowNative");
                web.destroy();
                web = null;
            }
        } catch (Throwable ignored) {
        }
        super.onDestroy();
    }
}
