package app.shadowcode;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Reader;
import java.io.Writer;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.HttpsURLConnection;

/**
 * The native half of ShadowCode. Every method here is callable from the web layer
 * through `window.ShadowNative`.
 */
public class Bridge {

    private static final String TAG = "ShadowCodeBridge";
    public static final int REQ_BRIDGE_PICK = 9002;

    private final Activity activity;
    private final WebView web;
    private final Vault vault;
    private final File home;
    private final ExecutorService pool = Executors.newFixedThreadPool(6);
    private final Map<String, HttpURLConnection> streams = new ConcurrentHashMap<>();
    private final Map<String, Process> procs = new ConcurrentHashMap<>();
    private String pickerId = null;

    public Bridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        this.vault = new Vault(activity);

        File base = null;
        try {
            base = activity.getExternalFilesDir(null);
        } catch (Throwable ignored) {
        }
        if (base == null) base = activity.getFilesDir();
        this.home = new File(base, "workspace");
        try {
            //noinspection ResultOfMethodCallIgnored
            home.mkdirs();
            ensureDirs();
        } catch (Throwable t) {
            ShadowApp.log("error", "workspace init: " + t);
        }
    }

    private void ensureDirs() {
        new File(home, ".shadowcode/chats").mkdirs();
        new File(home, "bin").mkdirs();
    }

    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_BRIDGE_PICK) return;
        final String id = pickerId;
        pickerId = null;
        if (data == null || data.getData() == null) {
            replyPick(id, null);
            return;
        }
        final Uri uri = data.getData();
        pool.submit(() -> {
            try {
                InputStream in = activity.getContentResolver().openInputStream(uri);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int r;
                int total = 0;
                while (in != null && (r = in.read(buf)) > 0) {
                    total += r;
                    if (total > 4 * 1024 * 1024) break;
                    bo.write(buf, 0, r);
                }
                if (in != null) in.close();
                String name = uri.getLastPathSegment();
                JSONObject o = new JSONObject();
                o.put("name", name == null ? "import.txt" : name.replaceAll(".*/", ""));
                o.put("content", bo.toString(StandardCharsets.UTF_8.name()));
                replyPick(id, o.toString());
            } catch (Exception e) {
                replyPick(id, null);
            }
        });
    }

    public void setPickerId(String id) {
        pickerId = id;
    }

    private void replyPick(String id, String json) {
        if (id == null) return;
        callJs("window.__scPick && window.__scPick(" + JSONObject.quote(json == null ? "null" : json) + ")");
    }

    public void shutdown() {
        for (HttpURLConnection c : streams.values()) {
            try {
                c.disconnect();
            } catch (Exception ignored) {
            }
        }
        streams.clear();
        for (Process p : procs.values()) {
            try {
                p.destroy();
            } catch (Exception ignored) {
            }
        }
        procs.clear();
        pool.shutdownNow();
        vault.lock();
    }

    /* ------------------------------------------------------------------ js */

    /** UI-thread work must never escape as an exception — that kills the process. */
    private void safe(Runnable r) {
        activity.runOnUiThread(() -> {
            try {
                r.run();
            } catch (Throwable t) {
                ShadowApp.log("error", "ui action failed: " + t);
            }
        });
    }

    private void callJs(String js) {
        if (web == null) return;
        web.post(() -> {
            try {
                WebView w = web;
                if (w != null) w.evaluateJavascript(js, null);
            } catch (Exception e) {
                Log.w(TAG, "js call failed: " + e.getMessage());
            }
        });
    }

    private static String esc(String s) {
        return JSONObject.quote(s == null ? "" : s);
    }

    /* -------------------------------------------------------------- device */

    @JavascriptInterface
    public String ping() {
        return "pong";
    }

    @JavascriptInterface
    public String deviceInfo() {
        JSONObject o = new JSONObject();
        try {
            PackageInfo pi = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            o.put("model", (Build.MANUFACTURER + " " + Build.MODEL).trim());
            o.put("android", Build.VERSION.RELEASE);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("pkg", activity.getPackageName());
            o.put("version", pi.versionName == null ? "1.0.0" : pi.versionName);
            o.put("native", true);
            o.put("home", home.getAbsolutePath());
        } catch (Exception e) {
            try {
                o.put("native", true);
                o.put("home", home.getAbsolutePath());
                o.put("model", Build.MODEL);
                o.put("android", Build.VERSION.RELEASE);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("pkg", activity.getPackageName());
            } catch (Exception ignored) {
            }
        }
        return o.toString();
    }

    @JavascriptInterface
    public String homePath() {
        return home.getAbsolutePath();
    }

    @JavascriptInterface
    public void toast(final String msg) {
        safe(() -> Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(Math.max(4, Math.min(ms, 80)), VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(Math.max(4, Math.min(ms, 80)));
            }
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void copy(String text) {
        safe(() -> {
            ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("ShadowCode", text));
        });
    }

    @JavascriptInterface
    public void share(String text) {
        safe(() -> {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, text);
            activity.startActivity(Intent.createChooser(i, "Share from ShadowCode"));
        });
    }

    @JavascriptInterface
    public void openUrl(String url) {
        safe(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
        });
    }

    @JavascriptInterface
    public void keepAwake(final boolean on) {
        safe(() -> {
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    @JavascriptInterface
    public void setSystemBars(String theme) {
        safe(() -> {
            if (activity instanceof MainActivity) ((MainActivity) activity).applyBarsFromBridge(theme);
        });
    }

    @JavascriptInterface
    public void exitApp() {
        safe(() -> {
            if (activity instanceof MainActivity) ((MainActivity) activity).closeApp();
        });
    }

    @JavascriptInterface
    public void pickFile(String id) {
        safe(() -> {
            if (activity instanceof MainActivity) ((MainActivity) activity).pickFileForBridge(id);
        });
    }

    /** Writes a file into the public Downloads folder so it survives the app. */
    @JavascriptInterface
    public boolean saveFile(String name, String content) {
        String safe = name == null ? "shadowcode-export.json" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ShadowCode");
                Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri != null) {
                    OutputStream os = activity.getContentResolver().openOutputStream(uri);
                    if (os != null) {
                        os.write(content.getBytes(StandardCharsets.UTF_8));
                        os.close();
                    }
                    toast("Saved to Downloads/ShadowCode/" + safe);
                    return true;
                }
            }
            File dir = new File(home, "exports");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File f = new File(dir, safe);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
            }
            toast("Saved to " + f.getAbsolutePath());
            return true;
        } catch (Exception e) {
            toast("Export failed: " + e.getMessage());
            return false;
        }
    }

    @JavascriptInterface
    public void requestAllFiles() {
        safe(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    i.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(i);
                } else {
                    toast("Full storage access already granted");
                }
            } catch (Exception e) {
                toast("Open Settings → Apps → ShadowCode → Permissions");
            }
        });
    }

    /* --------------------------------------------------------------- files */

    private File guard(String path) {
        File f = new File(path == null ? home.getAbsolutePath() : path);
        if (!f.isAbsolute()) f = new File(home, path);
        return f;
    }

    @JavascriptInterface
    public String fsList(String dir) {
        JSONArray arr = new JSONArray();
        try {
            File d = guard(dir);
            if (!d.exists()) return arr.toString();
            File[] items = d.listFiles();
            if (items == null) return arr.toString();
            Arrays.sort(items, new Comparator<File>() {
                @Override
                public int compare(File a, File b) {
                    if (a.isDirectory() != b.isDirectory()) return a.isDirectory() ? -1 : 1;
                    return a.getName().compareToIgnoreCase(b.getName());
                }
            });
            for (File f : items) {
                JSONObject o = new JSONObject();
                o.put("name", f.getName());
                o.put("path", f.getAbsolutePath());
                o.put("dir", f.isDirectory());
                o.put("size", f.length());
                o.put("mtime", f.lastModified());
                arr.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "fsList " + e.getMessage());
        }
        return arr.toString();
    }

    @JavascriptInterface
    public String fsRead(String path) {
        try {
            File f = guard(path);
            if (!f.exists() || f.isDirectory()) return "";
            if (f.length() > 12L * 1024 * 1024) return "";
            byte[] data = new byte[(int) f.length()];
            try (FileInputStream in = new FileInputStream(f)) {
                int off = 0;
                while (off < data.length) {
                    int r = in.read(data, off, data.length - off);
                    if (r < 0) break;
                    off += r;
                }
            }
            return new String(data, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    @JavascriptInterface
    public boolean fsWrite(String path, String data) {
        try {
            File f = guard(path);
            File parent = f.getParentFile();
            if (parent != null && !parent.exists()) //noinspection ResultOfMethodCallIgnored
                parent.mkdirs();
            try (Writer w = new OutputStreamWriter(new FileOutputStream(f), StandardCharsets.UTF_8)) {
                w.write(data == null ? "" : data);
            }
            return true;
        } catch (Exception e) {
            Log.w(TAG, "fsWrite " + e.getMessage());
            return false;
        }
    }

    @JavascriptInterface
    public boolean fsDelete(String path) {
        try {
            File f = guard(path);
            if (f.equals(home)) return false;
            return deleteRecursive(f);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        return f.delete();
    }

    @JavascriptInterface
    public boolean fsMkdir(String path) {
        try {
            return guard(path).mkdirs() || guard(path).isDirectory();
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean fsRename(String from, String to) {
        try {
            File a = guard(from);
            File b = guard(to);
            File parent = b.getParentFile();
            if (parent != null && !parent.exists()) //noinspection ResultOfMethodCallIgnored
                parent.mkdirs();
            return a.renameTo(b);
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public boolean fsExists(String path) {
        try {
            return guard(path).exists();
        } catch (Exception e) {
            return false;
        }
    }

    /* --------------------------------------------------------------- shell */

    @JavascriptInterface
    public void exec(final String id, final String command, final String cwd, final int timeoutMs) {
        pool.submit(() -> {
            JSONObject res = new JSONObject();
            StringBuilder out = new StringBuilder();
            int code = 1;
            File dir = guard(cwd);
            if (!dir.isDirectory()) dir = home;
            Process p = null;
            try {
                ProcessBuilder pb = new ProcessBuilder("/system/bin/sh", "-c", command);
                pb.directory(dir);
                pb.redirectErrorStream(true);
                Map<String, String> env = pb.environment();
                env.put("HOME", home.getAbsolutePath());
                env.put("PWD", dir.getAbsolutePath());
                env.put("TMPDIR", activity.getCacheDir().getAbsolutePath());
                env.put("TERM", "xterm-256color");
                env.put("PATH", home.getAbsolutePath() + "/bin:/sbin:/system/sbin:/system/bin:/system/xbin:/vendor/bin:/vendor/xbin");
                env.put("LANG", "en_US.UTF-8");
                p = pb.start();
                procs.put(id, p);
                p.getOutputStream().close();

                final Process proc = p;
                final AtomicBoolean killed = new AtomicBoolean(false);
                Thread killer = new Thread(() -> {
                    try {
                        Thread.sleep(Math.max(1000, timeoutMs));
                        if (proc.isAlive()) {
                            killed.set(true);
                            proc.destroy();
                        }
                    } catch (InterruptedException ignored) {
                    }
                });
                killer.setDaemon(true);
                killer.start();

                InputStream in = p.getInputStream();
                byte[] buf = new byte[8192];
                int r;
                while ((r = in.read(buf)) > 0) {
                    out.append(new String(buf, 0, r, StandardCharsets.UTF_8));
                    if (out.length() > 400_000) break;
                }
                code = p.waitFor();
                if (killed.get()) code = 124;
                killer.interrupt();
            } catch (Exception e) {
                out.append(e.getClass().getSimpleName()).append(": ").append(e.getMessage());
                code = 1;
            } finally {
                procs.remove(id);
                if (p != null) p.destroy();
            }
            try {
                res.put("code", code);
                res.put("out", out.toString());
            } catch (Exception ignored) {
            }
            callJs("window.__scExec && window.__scExec(" + esc(id) + "," + esc(res.toString()) + ")");
        });
    }

    /* ---------------------------------------------------------------- http */

    @JavascriptInterface
    public void httpStream(final String id, final String requestJson) {
        pool.submit(() -> {
            HttpURLConnection conn = null;
            try {
                JSONObject req = new JSONObject(requestJson);
                String url = req.optString("url");
                String method = req.optString("method", "POST");
                String body = req.optString("body", null);
                int timeout = req.optInt("timeoutMs", 180000);

                conn = open(url, method, req.optJSONObject("headers"), body, timeout);
                streams.put(id, conn);
                int status = conn.getResponseCode();
                if (status >= 400) {
                    String err = readAll(conn.getErrorStream());
                    JSONObject o = new JSONObject();
                    o.put("status", status);
                    o.put("body", err);
                    callJs("window.__scStream && window.__scStream(" + esc(id) + ",'error'," + esc(o.toString()) + ")");
                    return;
                }
                Reader reader = new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8);
                char[] buf = new char[4096];
                StringBuilder pending = new StringBuilder();
                long last = 0;
                int r;
                while ((r = reader.read(buf)) != -1) {
                    pending.append(buf, 0, r);
                    long now = System.currentTimeMillis();
                    if (now - last > 28 || pending.length() > 8192) {
                        emitChunk(id, pending.toString());
                        pending.setLength(0);
                        last = now;
                    }
                }
                if (pending.length() > 0) emitChunk(id, pending.toString());
                reader.close();
                callJs("window.__scStream && window.__scStream(" + esc(id) + ",'end','')");
            } catch (Exception e) {
                String msg = e.getClass().getSimpleName() + ": " + (e.getMessage() == null ? "stream failed" : e.getMessage());
                callJs("window.__scStream && window.__scStream(" + esc(id) + ",'error'," + esc(msg) + ")");
            } finally {
                streams.remove(id);
                if (conn != null) conn.disconnect();
            }
        });
    }

    private void emitChunk(String id, String chunk) {
        callJs("window.__scStream && window.__scStream(" + esc(id) + ",'chunk'," + esc(chunk) + ")");
    }

    @JavascriptInterface
    public void httpStop(String id) {
        HttpURLConnection c = streams.remove(id);
        if (c != null) {
            try {
                c.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    @JavascriptInterface
    public void httpRequest(final String id, final String requestJson) {
        pool.submit(() -> {
            HttpURLConnection conn = null;
            JSONObject res = new JSONObject();
            try {
                JSONObject req = new JSONObject(requestJson);
                int timeout = req.optInt("timeoutMs", 30000);
                conn = open(req.optString("url"), req.optString("method", "GET"), req.optJSONObject("headers"), req.optString("body", null), timeout);
                int status = conn.getResponseCode();
                InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                String body = readAll(in);
                JSONObject headers = new JSONObject();
                for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                    if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                    headers.put(e.getKey().toLowerCase(), e.getValue().get(0));
                }
                res.put("status", status);
                res.put("headers", headers);
                res.put("body", body);
            } catch (Exception e) {
                try {
                    res.put("status", 0);
                    res.put("headers", new JSONObject());
                    res.put("body", e.getClass().getSimpleName() + ": " + (e.getMessage() == null ? "request failed" : e.getMessage()));
                } catch (Exception ignored) {
                }
            } finally {
                if (conn != null) conn.disconnect();
            }
            callJs("window.__scHttp && window.__scHttp(" + esc(id) + "," + esc(res.toString()) + ")");
        });
    }

    private HttpURLConnection open(String url, String method, JSONObject headers, String body, int timeoutMs) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        if (conn instanceof HttpsURLConnection) {
            // default trust store — no custom CAs, no pinning bypass
        }
        conn.setRequestMethod(method == null || method.isEmpty() ? "GET" : method.toUpperCase());
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(Math.max(20000, timeoutMs));
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("Accept-Encoding", "identity");
        if (headers != null) {
            Iterator<String> it = headers.keys();
            while (it.hasNext()) {
                String k = it.next();
                try {
                    conn.setRequestProperty(k, headers.optString(k));
                } catch (Exception ignored) {
                }
            }
        }
        if (body != null && !"GET".equalsIgnoreCase(method)) {
            conn.setDoOutput(true);
            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(payload.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload);
            }
        }
        return conn;
    }

    private String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int r;
        int total = 0;
        while ((r = in.read(buf)) > 0) {
            total += r;
            if (total > 8 * 1024 * 1024) break;
            bo.write(buf, 0, r);
        }
        in.close();
        return bo.toString(StandardCharsets.UTF_8.name());
    }

    /* --------------------------------------------------------- diagnostics */

    @JavascriptInterface
    public void jsLog(String level, String msg) {
        try {
            ShadowApp.log("error".equals(level) ? "error" : "info", "web: " + (msg == null ? "" : msg));
        } catch (Throwable ignored) {
        }
    }

    @JavascriptInterface
    public String crashLog() {
        try {
            return ShadowApp.readLastCrash();
        } catch (Throwable t) {
            return "";
        }
    }

    @JavascriptInterface
    public void clearCrashLog() {
        try {
            ShadowApp.clearCrash();
        } catch (Throwable ignored) {
        }
    }

    @JavascriptInterface
    public String runtimeLog() {
        try {
            return ShadowApp.getLog();
        } catch (Throwable t) {
            return "";
        }
    }

    @JavascriptInterface
    public String webViewInfo() {
        try {
            return WebSettings.getDefaultUserAgent(activity);
        } catch (Throwable t) {
            return "unknown";
        }
    }

    @JavascriptInterface
    public String diagnostics() {
        JSONObject o = new JSONObject();
        try {
            o.put("device", (Build.MANUFACTURER + " " + Build.MODEL).trim());
            o.put("android", Build.VERSION.RELEASE);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("webview", webViewInfo());
            o.put("home", home.getAbsolutePath());
            o.put("workspaceWritable", home.isDirectory() && home.canWrite());
            o.put("vaultExists", vault.exists());
            o.put("vaultUnlocked", vault.unlocked());
            o.put("package", activity.getPackageName());
            try {
                o.put("version", activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName);
            } catch (Throwable ignored) {
            }
            o.put("crash", ShadowApp.readLastCrash());
            o.put("log", ShadowApp.getLog());
        } catch (Throwable t) {
            return "{\"error\":\"" + t.getClass().getSimpleName() + "\"}";
        }
        return o.toString();
    }

    /* --------------------------------------------------------------- vault */

    @JavascriptInterface
    public boolean vaultExists() {
        return vault.exists();
    }

    @JavascriptInterface
    public boolean vaultCreate(String pin, String json) {
        return vault.create(pin, json);
    }

    @JavascriptInterface
    public String vaultUnlock(String pin) {
        return vault.unlock(pin);
    }

    @JavascriptInterface
    public boolean vaultSave(String json) {
        return vault.save(json);
    }

    @JavascriptInterface
    public boolean vaultChangePin(String pin) {
        return vault.changePin(pin);
    }

    @JavascriptInterface
    public void vaultLock() {
        vault.lock();
    }

    @JavascriptInterface
    public void vaultWipe() {
        vault.wipe();
    }

    @JavascriptInterface
    public String vaultStatus() {
        JSONObject o = new JSONObject();
        try {
            o.put("exists", vault.exists());
            o.put("unlocked", vault.unlocked());
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    /* ------------------------------------------------------------- helpers */

    /** Rough screen metrics so the UI can adapt if it ever needs to. */
    @JavascriptInterface
    public String screenInfo() {
        JSONObject o = new JSONObject();
        try {
            o.put("width", activity.getResources().getDisplayMetrics().widthPixels);
            o.put("height", activity.getResources().getDisplayMetrics().heightPixels);
            o.put("density", activity.getResources().getDisplayMetrics().density);
            AudioManager am = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
            o.put("volume", am == null ? -1 : am.getStreamVolume(AudioManager.STREAM_MUSIC));
        } catch (Exception ignored) {
        }
        return o.toString();
    }
}
