/* Untukmu — enkripsi sisi klien.
 *
 * Model dua tingkat (lihat catatan di README):
 *   privat            → AES-256-GCM dengan Master Key turunan kata sandi pengguna.
 *                       Server/penyimpanan tidak punya kuncinya. Model zero-knowledge.
 *   publik/unlisted   → AES-256-GCM dengan "kunci bersama", yaitu kunci yang juga
 *                       dipegang sistem. Ini memodelkan kenyataan bahwa pesan yang
 *                       harus bisa dibaca orang lain (dan dimoderasi) tidak mungkin
 *                       end-to-end. Ditandai jujur di UI.
 *
 * CATATAN KDF — baca sebelum produksi:
 * PRD §10.1 meminta Argon2id. Argon2id TIDAK tersedia di Web Crypto API; ia butuh
 * pustaka WASM (mis. hash-wasm) yang harus di-vendor lokal. Berkas ini karena itu
 * memakai PBKDF2-HMAC-SHA256 bawaan peramban — nol dependensi, tetap berjalan
 * offline — dan menyediakan KDF yang bisa ditukar:
 *
 *     UM.crypto.setKdf(fn)   // fn(password, saltBuffer, iterations) -> Promise<ArrayBuffer>
 *
 * Begitu hash-wasm tersedia, cukup setel KDF baru tanpa mengubah sisa aplikasi.
 * Format rekaman kunci menyimpan medan `kdf`, jadi berkas lama tetap terbaca.
 */
window.UM = window.UM || {};

UM.crypto = (function () {
  var ITER = 600000;             // PBKDF2-HMAC-SHA256; Argon2id akan menggantikan angka ini
  var KDF_ID = 'PBKDF2-SHA256';
  var SHARE_SECRET = 'untukmu.share.v1'; // kunci sistem: sengaja publik, hanya untuk tier publik

  /* ── status sesi (hanya di memori — tidak pernah dipersistensikan) ────────── */
  var masterKey = null;   // CryptoKey AES-GCM milik pengguna
  var shareKey = null;    // CryptoKey AES-GCM "kunci bersama"

  function subtle() {
    return (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  }
  function available() {
    return !!subtle() && (typeof isSecureContext === 'undefined' ? true : isSecureContext);
  }
  function unlocked() { return !!masterKey; }
  function reason() {
    if (typeof crypto === 'undefined' || !crypto.subtle) return 'no-webcrypto';
    if (typeof isSecureContext !== 'undefined' && !isSecureContext) return 'not-secure-context';
    return null;
  }

  /* ── utilitas biner ──────────────────────────────────────────────────────── */

  function rand(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

  function b64(buf) {
    var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(str) {
    var raw = atob(str), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function utf8(text) { return new TextEncoder().encode(text); }

  /* ── KDF yang bisa ditukar ───────────────────────────────────────────────── */

  var kdfImpl = null; // null = pakai PBKDF2 bawaan

  function setKdf(fn, id, iterations) {
    kdfImpl = fn || null;
    if (id) KDF_ID = id;
    if (iterations) ITER = iterations;
  }
  function kdfId() { return KDF_ID; }
  function iterations() { return ITER; }

  function deriveBits(password, salt, iter) {
    var iters = iter || ITER;
    if (kdfImpl) return Promise.resolve(kdfImpl(password, salt, iters));
    return subtle().importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (base) {
        return subtle().deriveBits({ name: 'PBKDF2', salt: salt, iterations: iters, hash: 'SHA-256' }, base, 256);
      });
  }
  function aesKeyFromBits(bits, usage) {
    return subtle().importKey('raw', bits, { name: 'AES-GCM' }, false, usage);
  }

  /* ── pembungkus Master Key ───────────────────────────────────────────────── */

  function wrapRaw(rawKeyBytes, kek) {
    var iv = rand(12);
    return subtle().encrypt({ name: 'AES-GCM', iv: iv }, kek, rawKeyBytes)
      .then(function (ct) { return { v: 1, iv: b64(iv), ct: b64(ct) }; });
  }
  function unwrapRaw(payload, kek) {
    return subtle().decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, kek, unb64(payload.ct))
      .then(function (raw) { return new Uint8Array(raw); });
  }

  /* ── kode pemulihan (4 kelompok × 5 karakter base32 = 100 bit) ───────────── */

  var B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // 30 karakter — tanpa I/L/O/0/1 agar tidak tertukar saat ditulis tangan
  function makeRecoveryCode() {
    var bytes = rand(20), out = '';
    for (var i = 0; i < 20; i++) {
      // penting: modulo panjang alfabet, bukan 32 — panjangnya 30, dan
      // charAt di luar rentang mengembalikan string kosong (kode jadi bolong)
      out += B32.charAt(bytes[i] % B32.length);
      if (i === 4 || i === 9 || i === 14) out += '-';
    }
    return out;
  }
  function normalizeRecovery(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* ── penyiapan & pembukaan ───────────────────────────────────────────────── */

  /* Membuat rekaman kunci baru. Mengembalikan { record, recoveryCode }.
     recoveryCode ditampilkan SEKALI ke pengguna dan tidak pernah disimpan. */
  function setup(password) {
    if (!available()) return Promise.reject(new Error('crypto-unavailable'));
    if (typeof password !== 'string' || password.length < 8) return Promise.reject(new Error('weak-password'));

    var salt = rand(16);
    var recovery = makeRecoveryCode();
    var raw = rand(32); // Master Key

    return deriveBits(password, salt).then(function (bits) {
      return aesKeyFromBits(bits, ['encrypt', 'decrypt']);
    }).then(function (kek) {
      return wrapRaw(raw, kek);
    }).then(function (wrapped) {
      return deriveBits(normalizeRecovery(recovery), salt).then(function (rbits) {
        return aesKeyFromBits(rbits, ['encrypt', 'decrypt']);
      }).then(function (rkek) {
        return wrapRaw(raw, rkek);
      }).then(function (rwrapped) {
        return aesKeyFromBits(raw, ['encrypt', 'decrypt']).then(function (key) {
          masterKey = key;
          return {
            record: {
              v: 1, kdf: KDF_ID, iter: ITER,
              salt: b64(salt), wrapped: wrapped, wrappedRecovery: rwrapped,
              dibuat: Date.now()
            },
            recoveryCode: recovery
          };
        });
      });
    });
  }

  function openWith(secret, pick) {
    if (!available()) return Promise.reject(new Error('crypto-unavailable'));
    return UM.store.getMeta('kunci').then(function (record) {
      if (!record) throw new Error('no-key-record');
      var payload = pick(record);
      if (!payload) throw new Error('no-escrow');
      return deriveBits(secret, unb64(record.salt), record.iter).then(function (bits) {
        return aesKeyFromBits(bits, ['encrypt', 'decrypt']);
      }).then(function (kek) {
        return unwrapRaw(payload, kek);
      }).then(function (raw) {
        return aesKeyFromBits(raw, ['encrypt', 'decrypt']);
      }).then(function (key) {
        masterKey = key;
        return true;
      }).catch(function (err) {
        if (err && (err.name === 'OperationError' || err.message === 'no-key-record')) throw new Error('wrong-password');
        throw err;
      });
    });
  }

  function unlock(password) {
    return openWith(password, function (r) { return r.wrapped; });
  }
  function unlockWithRecovery(code) {
    return openWith(normalizeRecovery(code), function (r) { return r.wrappedRecovery; });
  }
  function lock() { masterKey = null; }

  /* ── enkripsi isi pesan ──────────────────────────────────────────────────── */

  function encryptWith(key, text, mark) {
    var iv = rand(12);
    return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, utf8(text)).then(function (ct) {
      var payload = { v: 1, iv: b64(iv), ct: b64(ct) };
      payload[mark] = 1;
      return payload;
    });
  }
  function decryptWith(key, payload) {
    return subtle().decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.ct))
      .then(function (buf) { return new TextDecoder().decode(buf); });
  }

  /* Kunci bersama untuk tier publik. Tidak rahasia — memang begitu modelnya. */
  function ensureShareKey() {
    if (shareKey) return Promise.resolve(shareKey);
    return subtle().digest('SHA-256', utf8(SHARE_SECRET)).then(function (digest) {
      return aesKeyFromBits(new Uint8Array(digest), ['encrypt', 'decrypt']);
    }).then(function (key) { shareKey = key; return key; });
  }

  /* privasi: 'privat' | 'publik' | 'unlisted' */
  function encryptPesan(text, privasi) {
    if (!available()) return Promise.resolve({ v: 1, plain: String(text) });
    if (privasi === 'privat') {
      if (!masterKey) return Promise.reject(new Error('locked'));
      return encryptWith(masterKey, text, 'zk');
    }
    return ensureShareKey().then(function (key) { return encryptWith(key, text, 'sh'); });
  }

  /* Mengembalikan isi pesan, ATAU null bila tidak bisa dibuka (privat & terkunci). */
  function decryptPesan(payload) {
    if (!payload) return Promise.resolve(null);
    if (payload.plain != null) return Promise.resolve(String(payload.plain));
    if (payload.zk) {
      if (!masterKey) return Promise.resolve(null); // terkunci — bukan galat, hanya belum bisa dibuka
      return decryptWith(masterKey, payload).catch(function () { return null; });
    }
    if (payload.sh) {
      return ensureShareKey().then(function (key) {
        return decryptWith(key, payload).catch(function () { return null; });
      });
    }
    return Promise.resolve(null);
  }

  return {
    available: available, reason: reason, unlocked: unlocked,
    setup: setup, unlock: unlock, unlockWithRecovery: unlockWithRecovery, lock: lock,
    encryptPesan: encryptPesan, decryptPesan: decryptPesan,
    setKdf: setKdf, kdfId: kdfId, iterations: iterations,
    makeRecoveryCode: makeRecoveryCode, normalizeRecovery: normalizeRecovery,
    b64: b64, unb64: unb64
  };
})();
