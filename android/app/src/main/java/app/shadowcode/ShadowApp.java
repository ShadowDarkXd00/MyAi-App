package app.shadowcode;

import android.app.Application;
import android.os.Build;
import android.util.Log;
import android.webkit.WebSettings;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Process-wide crash capture and a small in-memory log ring that the web layer can
 * read from Settings → Diagnostics. If ShadowCode ever dies on a device, the next
 * launch can show exactly what happened.
 */
public class ShadowApp extends Application {

    private static final String TAG = "ShadowCode";
    private static final int LOG_LIMIT = 40000;
    private static ShadowApp instance;
    private static final StringBuilder LOG = new StringBuilder();
    private static volatile String lastFatal = null;

    public static ShadowApp get() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        installCrashHandler();
        log("info", "app started · SDK " + Build.VERSION.SDK_INT + " · " + Build.MANUFACTURER + " " + Build.MODEL);
    }

    public static void log(String level, String message) {
        String line = new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date())
                + " [" + level + "] " + message + "\n";
        synchronized (LOG) {
            LOG.append(line);
            if (LOG.length() > LOG_LIMIT) LOG.delete(0, LOG.length() - LOG_LIMIT);
        }
        Log.println(level.equals("error") ? Log.ERROR : Log.INFO, TAG, message);
    }

    public static String getLog() {
        synchronized (LOG) {
            return LOG.toString();
        }
    }

    public static void clearLog() {
        synchronized (LOG) {
            LOG.setLength(0);
        }
    }

    private void installCrashHandler() {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                writeCrash(thread, error);
            } catch (Throwable ignored) {
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    private void writeCrash(Thread thread, Throwable error) {
        String report = buildReport(thread, error);
        lastFatal = report;
        log("error", "FATAL: " + error);
        try {
            File f = new File(getFilesDir(), "last-crash.txt");
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(report.getBytes(StandardCharsets.UTF_8));
            }
        } catch (Throwable ignored) {
        }
    }

    private String buildReport(Thread thread, Throwable error) {
        String ua = "unknown";
        try {
            ua = WebSettings.getDefaultUserAgent(this);
        } catch (Throwable ignored) {
        }
        return "ShadowCode crash report\n"
                + "when: " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()) + "\n"
                + "thread: " + (thread == null ? "?" : thread.getName()) + "\n"
                + "device: " + Build.MANUFACTURER + " " + Build.MODEL + "\n"
                + "android: " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")\n"
                + "webview: " + ua + "\n\n"
                + Log.getStackTraceString(error);
    }

    public static String readLastCrash() {
        if (lastFatal != null) return lastFatal;
        try {
            File f = new File(instance.getFilesDir(), "last-crash.txt");
            if (!f.exists()) return "";
            byte[] buf = new byte[(int) f.length()];
            try (InputStream in = new FileInputStream(f)) {
                int off = 0;
                while (off < buf.length) {
                    int r = in.read(buf, off, buf.length - off);
                    if (r < 0) break;
                    off += r;
                }
            }
            lastFatal = new String(buf, StandardCharsets.UTF_8);
            return lastFatal;
        } catch (Throwable e) {
            return "";
        }
    }

    public static void clearCrash() {
        lastFatal = null;
        try {
            new File(instance.getFilesDir(), "last-crash.txt").delete();
        } catch (Throwable ignored) {
        }
    }

    static String readAsset(Application app, String name) {
        try (InputStream in = app.getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
            return out.toString("UTF-8");
        } catch (Throwable e) {
            return "";
        }
    }
}
