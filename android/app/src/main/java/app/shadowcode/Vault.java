package app.shadowcode;

import android.content.Context;
import android.util.Base64;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * PIN-encrypted key vault.
 *
 * The PIN never leaves the device. A 256-bit key is derived with
 * PBKDF2-HMAC-SHA256 (210 000 iterations, 16-byte random salt) and the payload
 * is sealed with AES-256-GCM. The derived key lives in memory only while the
 * vault is unlocked; the ciphertext sits in app-private storage.
 */
public final class Vault {

    private static final int ITERATIONS = 210_000;
    private static final int KEY_BITS = 256;
    private static final int SALT_BYTES = 16;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final File file;
    private final SecureRandom rng = new SecureRandom();

    private byte[] key;      // derived key, memory only
    private byte[] salt;     // salt that produced `key`
    private String plain;    // last decrypted payload (for re-encryption / PIN change)

    public Vault(Context ctx) {
        this.file = new File(ctx.getFilesDir(), "vault.bin");
    }

    public synchronized boolean exists() {
        return file.exists() && file.length() > 0;
    }

    public synchronized boolean unlocked() {
        return key != null;
    }

    public synchronized boolean create(String pin, String json) {
        if (exists()) return false;
        try {
            salt = random(SALT_BYTES);
            key = derive(pin, salt);
            plain = json;
            write(json);
            return true;
        } catch (Exception e) {
            key = null;
            return false;
        }
    }

    /** Returns the decrypted payload, or null when the PIN is wrong. */
    public synchronized String unlock(String pin) {
        if (!exists()) return null;
        try {
            JSONObject o = read();
            byte[] s = Base64.decode(o.getString("salt"), Base64.NO_WRAP);
            byte[] iv = Base64.decode(o.getString("iv"), Base64.NO_WRAP);
            byte[] ct = Base64.decode(o.getString("ct"), Base64.NO_WRAP);
            byte[] k = derive(pin, s);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(k, "AES"), new GCMParameterSpec(TAG_BITS, iv));
            byte[] pt = c.doFinal(ct);
            String json = new String(pt, StandardCharsets.UTF_8);
            key = k;
            salt = s;
            plain = json;
            return json;
        } catch (Exception e) {
            key = null;
            return null;
        }
    }

    public synchronized boolean save(String json) {
        if (key == null || salt == null) return false;
        try {
            write(json);
            plain = json;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public synchronized boolean changePin(String newPin) {
        if (key == null || plain == null) return false;
        try {
            byte[] s = random(SALT_BYTES);
            byte[] k = derive(newPin, s);
            salt = s;
            key = k;
            write(plain);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public synchronized void lock() {
        if (key != null) java.util.Arrays.fill(key, (byte) 0);
        key = null;
        salt = null;
        plain = null;
    }

    public synchronized void wipe() {
        lock();
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    /* --------------------------------------------------------------- internals */

    private void write(String json) throws Exception {
        byte[] iv = random(IV_BYTES);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, iv));
        byte[] ct = c.doFinal(json.getBytes(StandardCharsets.UTF_8));
        JSONObject o = new JSONObject();
        o.put("v", 1);
        o.put("kdf", "PBKDF2-SHA256");
        o.put("iter", ITERATIONS);
        o.put("salt", Base64.encodeToString(salt, Base64.NO_WRAP));
        o.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP));
        o.put("ct", Base64.encodeToString(ct, Base64.NO_WRAP));
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(o.toString().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
    }

    private JSONObject read() throws Exception {
        byte[] buf;
        try (FileInputStream in = new FileInputStream(file)) {
            buf = new byte[(int) file.length()];
            int off = 0;
            while (off < buf.length) {
                int r = in.read(buf, off, buf.length - off);
                if (r < 0) break;
                off += r;
            }
        }
        return new JSONObject(new String(buf, StandardCharsets.UTF_8));
    }

    private byte[] derive(String pin, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pin.toCharArray(), salt, ITERATIONS, KEY_BITS);
        SecretKeyFactory f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
        byte[] k = f.generateSecret(spec).getEncoded();
        spec.clearPassword();
        return k;
    }

    private byte[] random(int n) {
        byte[] b = new byte[n];
        rng.nextBytes(b);
        return b;
    }
}
