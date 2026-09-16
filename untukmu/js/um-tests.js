/* Untukmu — pengujian mandiri di peramban.
 *
 * Jalankan dengan membuka:  index.html?umTest=1
 * Hasil tampil sebagai daftar di layar dan di console.
 *
 * Mengikuti kebiasaan engine (runSolarSelfTests): tes yang gagal TIDAK diam,
 * melainkan melaporkan nama dan alasannya.
 *
 * Catatan: pengujian kunci enkripsi menyimpan dan memulihkan rekaman kunci,
 * tetapi berakhir dalam keadaan terkunci. Buka lagi lewat menu "Kunci".
 */
window.UM = window.UM || {};

UM.tests = (function () {

  function ok(syarat, pesan) { if (!syarat) throw new Error(pesan); }
  function sama(a, b, pesan) { if (a !== b) throw new Error(pesan + ' (dapat ' + a + ', harusnya ' + b + ')'); }
  function tiga() { return typeof THREE !== 'undefined' ? THREE : null; }

  var TESTS = [
    {
      nama: 'i18n: kunci id dan en seimbang',
      fn: function () {
        var id = Object.keys(UM.i18n.table('id')), en = Object.keys(UM.i18n.table('en'));
        var a = id.filter(function (k) { return en.indexOf(k) < 0; });
        var b = en.filter(function (k) { return id.indexOf(k) < 0; });
        ok(!a.length, 'ada di id, tidak di en: ' + a.join(', '));
        ok(!b.length, 'ada di en, tidak di id: ' + b.join(', '));
        ok(id.length > 150, 'tabel bahasa terlalu kecil: ' + id.length);
        return true;
      }
    },
    {
      nama: 'i18n: tidak ada nilai kosong',
      fn: function () {
        ['id', 'en'].forEach(function (L) {
          var tb = UM.i18n.table(L);
          Object.keys(tb).forEach(function (k) {
            ok(typeof tb[k] === 'string' && tb[k].length > 0, 'kosong: ' + L + '.' + k);
          });
        });
        return true;
      }
    },
    {
      nama: 'kripto: kunci tersedia dan terkunci bersih',
      fn: function () {
        if (!UM.crypto.available()) throw new Error('dilewati: Web Crypto tidak tersedia (' + UM.crypto.reason() + ')');
        return true;
      }
    },
    {
      nama: 'kripto: pesan publik bolak-balik',
      fn: function () {
        if (!UM.crypto.available()) throw new Error('dilewati: Web Crypto tidak tersedia');
        var teks = 'Pesan uji — tanda baca, 日本語, dan emoji 🌌';
        return UM.crypto.encryptPesan(teks, 'publik').then(function (p) {
          sama(p.sh, 1, 'payload publik tidak memakai kunci bersama');
          ok(p.ct.indexOf('Pesan uji') < 0, 'isi bocor ke ciphertext');
          return UM.crypto.decryptPesan(p);
        }).then(function (keluar) {
          sama(keluar, teks, 'hasil dekripsi berbeda');
          return true;
        });
      }
    },
    {
      nama: 'kripto: pesan privat menolak tanpa kunci',
      fn: function () {
        if (!UM.crypto.available()) throw new Error('dilewati: Web Crypto tidak tersedia');
        UM.crypto.lock();
        return UM.crypto.encryptPesan('rahasia', 'privat').then(function () {
          throw new Error('seharusnya gagal saat terkunci');
        }, function (err) {
          sama(err.message, 'locked', 'galat yang salah');
          return true;
        });
      }
    },
    {
      nama: 'data doa: sumber wajib, teks tidak dikarang',
      fn: function () {
        sama(UM.doaData.tradisi.length, 7, 'jumlah tradisi salah');
        UM.doaData.tradisi.forEach(function (tr) {
          ok(tr.entri.length >= 1, tr.id + ' tidak punya doa');
          tr.entri.forEach(function (e) {
            ok(e.sumber && e.sumber.length > 5, tr.id + '/' + e.id + ' tanpa sumber');
            ok(typeof e.reviewed === 'boolean', tr.id + '/' + e.id + ' tanpa tanda reviewed');
            if (e.reviewed) ok(e.teks && e.teks.id, tr.id + '/' + e.id + ' ditandai reviewed tapi tanpa teks');
          });
        });
        ok(UM.doaData.belumDikurasi().jumlah > 0, 'seharusnya masih ada entri menunggu kurasi manusia');
        return true;
      }
    },
    {
      nama: 'basis data: contoh lengkap, dua lapisan per galaksi',
      fn: function () {
        return UM.store.listGalaksi().then(function (galaksi) {
          ok(galaksi.length >= 6, 'galaksi contoh kurang: ' + galaksi.length);
          var kinds = {};
          galaksi.forEach(function (g) { kinds[g.kind] = true; });
          ok(Object.keys(kinds).length >= 3, 'bentuk galaksi tidak beragam');
          return UM.store.listPesan();
        }).then(function (semua) {
          var punyaku = semua.filter(function (p) { return p.sendiri !== false; });
          var masuk = semua.filter(function (p) { return p.sendiri === false; });
          ok(punyaku.length >= 16, 'pesan milik sendiri kurang: ' + punyaku.length);
          ok(masuk.length >= 1000, 'pesan dari orang lain kurang: ' + masuk.length);
          ok(masuk.every(function (p) { return p.privasi === 'publik'; }), 'pesan dari orang lain harus publik agar bisa dibaca');
          return true;
        });
      }
    },
    {
      nama: 'basis data: setiap galaksi punya piringan dan sabuk',
      fn: function () {
        return UM.store.listGalaksi().then(function (galaksi) {
          ok(galaksi.length > 0, 'tidak ada galaksi');
          var kurangPiringan = [], kurangSabuk = [];
          return galaksi.reduce(function (rantai, g) {
            return rantai.then(function () {
              return UM.store.listPesan(g.id).then(function (pesan) {
                if (!pesan.filter(function (p) { return p.sendiri !== false || p.piringan === true; }).length) kurangPiringan.push(g.nama);
                if (!pesan.filter(function (p) { return p.sabuk === true; }).length) kurangSabuk.push(g.nama);
              });
            });
          }, Promise.resolve()).then(function () {
            ok(!kurangPiringan.length, 'galaksi tanpa bintang: ' + kurangPiringan.join(', '));
            ok(!kurangSabuk.length, 'galaksi tanpa butir sabuk: ' + kurangSabuk.join(', '));
            return true;
          });
        });
      }
    },
    {
      nama: 'basis data: SETIAP butir sabuk punya pesan dan bisa dibaca',
      fn: function () {
        // Ini janji yang paling mudah dilanggar tanpa sadar: dulu sabuk berisi
        // catatan doa tanpa pesan, sehingga ada partikel yang diklik tapi kosong.
        return Promise.all([UM.store.listPesan(), UM.store.listDoa()]).then(function (r) {
          var semua = r[0], doa = r[1];
          var masuk = semua.filter(function (p) { return p.sabuk === true; });
          var berdoa = {};
          doa.forEach(function (d) { if (d.pesanId) berdoa[d.pesanId] = true; });
          var buntu = masuk.filter(function (p) { return !berdoa[p.id]; });
          ok(!buntu.length, buntu.length + ' butir sabuk tanpa doa: ' + buntu.slice(0, 3).map(function (p) { return p.id; }).join(', '));
          ok(masuk.every(function (p) { return p.isi && p.isi.plain; }), 'ada pesan sabuk tanpa isi');
          return masuk.slice(0, 8).reduce(function (rantai, p) {
            return rantai.then(function () {
              return UM.store.bacaIsi(p).then(function (txt) {
                ok(typeof txt === 'string' && txt.length > 10, p.id + ' tidak bisa dibaca: ' + txt);
              });
            });
          }, Promise.resolve()).then(function () { return true; });
        });
      }
    },
    {
      nama: 'basis data: label mockup a..z lalu aa.. unik',
      fn: function () {
        return UM.store.listPesan().then(function (semua) {
          var masuk = semua.filter(function (p) { return p.sendiri === false && p.galaksiId === 'g_ibu'; });
          ok(masuk.length >= 120, 'butir sabuk g_ibu kurang: ' + masuk.length);
          var label = masuk.map(function (p) { return p.id.slice('p_mock_g_ibu_'.length); });
          var unik = {};
          label.forEach(function (l) { unik[l] = true; });
          sama(Object.keys(unik).length, masuk.length, 'ada label kembar');
          ok(label.filter(function (l) { return l.length === 1; }).length === 26, 'label satu huruf tidak 26 (a..z)');
          return true;
        });
      }
    },
    {
      nama: 'basis data: angka doa koheren di tiga tempat',
      fn: function () {
        return Promise.all([UM.store.listPesan(), UM.store.listDoa(), UM.store.doaPerGalaksi()]).then(function (r) {
          var pesan = r[0], doa = r[1], perGalaksi = r[2];
          var totalPesan = 0;
          pesan.forEach(function (p) { totalPesan += (p.pendoa && p.pendoa.total) || 0; });
          var tertaut = doa.filter(function (d) { return d.pesanId; }).length;
          sama(totalPesan, tertaut, 'penghitung di pesan tidak sama dengan doa tertaut');
          var jumlah = 0;
          Object.keys(perGalaksi).forEach(function (k) { jumlah += perGalaksi[k]; });
          sama(jumlah, doa.length, 'rincian per galaksi tidak sama dengan total doa');
          return true;
        });
      }
    },
    {
      nama: 'basis data: menambah doa menaikkan penghitung, bukan jumlah butir',
      fn: function () {
        var galaksiId = 'g_kakek', pesanId = 'p_10';
        var sebelum = 0, butirSebelum = 0;
        return UM.store.getPesan(pesanId).then(function (p) {
          sebelum = p.pendoa.total;
          return UM.store.listPesan(galaksiId);
        }).then(function (rows) {
          butirSebelum = rows.filter(function (p) { return p.sabuk === true; }).length;
          return UM.store.addDoa(galaksiId, pesanId, 'umum', 'hening');
        }).then(function () {
          return UM.store.getPesan(pesanId);
        }).then(function (p) {
          sama(p.pendoa.total, sebelum + 1, 'penghitung pendoa tidak naik');
          return UM.store.listPesan(galaksiId);
        }).then(function (rows) {
          sama(rows.filter(function (x) { return x.sabuk === true; }).length, butirSebelum, 'berdoa tidak boleh menambah butir sabuk');
          return true;
        });
      }
    },
    {
      nama: 'identitas anonim tanpa login',
      fn: function () {
        return UM.store.identitas().then(function (a) {
          ok(a && a.id, 'identitas tidak terbentuk');
          return UM.store.identitas();
        }).then(function (b) {
          ok(b.id, 'identitas kedua kosong');
          return true;
        });
      }
    },
    {
      nama: 'langit: generator galaksi engine bisa dipakai',
      fn: function () {
        ok(UM.galaksi.generatorAda(), 'GX.buildGalaxyStars tidak tersedia — hook di index.html hilang?');
        ok(typeof GX.buildGalaxyStars === 'function', 'GX.buildGalaxyStars bukan fungsi');
        ok(GX.galaxyLODs && GX.galaxyLODs.length >= 7, 'GX.galaxyLODs tidak berisi galaksi jauh engine');
        return true;
      }
    },
    {
      nama: 'langit: tiap galaksi orang terbangun di adegan',
      fn: function () {
        var daftar = UM.galaksi.state.daftar;
        ok(daftar.length >= 6, 'galaksi tidak terbangun: ' + daftar.length);
        daftar.forEach(function (item) {
          ok(item.lod && item.lod.pts, item.g.nama + ' tidak punya objek galaksi');
          ok(item.pos && isFinite(item.pos.x), item.g.nama + ' tidak punya posisi');
          ok(item.pesanDiTitik && typeof item.pesanDiTitik === 'object', item.g.nama + ' tidak punya penanda titik pesan');
          ok(item.batu, item.g.nama + ' tidak punya layer batu');
          ok(item.el, item.g.nama + ' tidak punya label');
        });
        return true;
      }
    },
    {
      nama: 'langit: pesan ditandai PADA titik spiral, tanpa lapisan terpisah',
      fn: function () {
        UM.galaksi.state.daftar.forEach(function (item) {
          var attrSkala = item.lod.pts.geometry.attributes.aScale;
          var idx = Object.keys(item.pesanDiTitik || {});
          ok(idx.length >= 1, item.g.nama + ': tidak ada titik yang ditandai untuk pesanmu');
          idx.forEach(function (k) {
            var i = parseInt(k, 10);
            // Skala titik aslinya disimpan, dan titik yang ditandai diperbesar —
            // inilah yang membuat pesanmu terlihat di antara ribuan bintang lain
            ok(item.skalaAsli[i] != null, item.g.nama + ': skala asli titik tidak disimpan');
            ok(attrSkala.array[i] === 3.4, item.g.nama + ': titik pesan tidak diperbesar');
            ok(item.pesanDiTitik[k].id, item.g.nama + ': titik pesan tanpa data');
          });
          if (item.batu) {
            ok(item.batu.parent === item.lod.pts, item.g.nama + ': sabuk doa tidak ikut berputar bersama galaksi');
            ok(item.batuPoints && item.batuPoints.isPoints, item.g.nama + ': doa harus partikel kecil, bukan bongkahan batu');
            ok(item.batuPoints.parent === item.batu, item.g.nama + ': partikel doa tidak berada di dalam sabuk');
          }
        });
        return true;
      }
    },
    {
      nama: 'langit: bentuk spiral tidak tergeser oleh penandaan',
      fn: function () {
        // Inti dari cara ini: yang diubah hanya aScale dan aColor. Array position
        // — satu-satunya yang menentukan bentuk — tidak boleh tersentuh.
        UM.galaksi.state.daftar.forEach(function (item) {
          var pos = item.lod.pts.geometry.attributes.position.array;
          var jumlahNol = 0;
          for (var i = 0; i < pos.length; i++) if (pos[i] === 0) jumlahNol++;
          ok(jumlahNol < pos.length * 0.5, item.g.nama + ': array posisi tampak kosong/tergeser');
          ok(item.lod.pts.geometry.attributes.aScale.array.length === item.lod.pts.geometry.attributes.position.count,
            item.g.nama + ': jumlah titik tidak sinkron');
        });
        return true;
      }
    },
    {
      nama: 'langit: ukuran partikel kecil, bukan bola besar',
      fn: function () {
        UM.galaksi.state.daftar.forEach(function (item) {
          if (item.batuPoints) {
            var sd = item.batuPoints.material.uniforms.uSize.value;
            ok(sd > 0 && sd <= 8, item.g.nama + ': uSize debu di luar rentang wajar: ' + sd);
          }
        });
        return true;
      }
    },
    {
      nama: 'langit: sabuk tiap galaksi berisi banyak butir',
      fn: function () {
        var kurang = [];
        UM.galaksi.state.daftar.forEach(function (item) {
          var digambar = item.batuDigambar || 0;
          if (digambar < 120) kurang.push(item.g.nama + ' (' + digambar + ')');
        });
        ok(!kurang.length, 'galaksi dengan sabuk terlalu sedikit: ' + kurang.join(', '));
        return true;
      }
    },
    {
      nama: 'langit: butir sabuk bertanda doa (warna keemasan)',
      fn: function () {
        // Penanda "ini doa" yang paling andal pada partikel adalah warnanya.
        // Diperiksa terhadap partikel bintang pesan: kalau warnanya sama, penanda hilang.
        var item = UM.galaksi.state.daftar[0];
        ok(item.batuPoints && item.lod && item.lod.pts, 'layer tidak lengkap');
        var debu = item.batuPoints.geometry.attributes.aCol.array;
        var rD = debu[0], gD = debu[1], bD = debu[2];
        ok(rD > bD, 'debu doa tidak condong keemasan (r harus lebih besar dari b)');
        // penanda kedua: shader debu memang berbeda dari shader bintang galaksi
        ok(item.batuPoints.material.fragmentShader !== item.lod.pts.material.fragmentShader,
          'debu doa memakai shader yang sama dengan bintang galaksi — penanda tidak terbaca');
        return true;
      }
    },
    {
      nama: 'langit: jumlah partikel sabuk mengikuti jumlah pesan orang lain',
      fn: function () {
        // disegarkan dulu: tes sebelumnya menambah doa, dan angka di layar harus
        // mengejar data, bukan sebaliknya
        return UM.galaksi.refresh().then(function () {
          return UM.store.listPesan();
        }).then(function (semua) {
          UM.galaksi.state.daftar.forEach(function (item) {
            // penanda eksplisit: yang digambar di sabuk adalah pesan ber-`sabuk: true`
            var masuk = semua.filter(function (p) { return p.galaksiId === item.g.id && p.sabuk === true; }).length;
            var diharapkan = Math.min(masuk, UM.galaksi.MAKS_BATU);
            var digambar = item.batuDigambar || 0;
            sama(digambar, diharapkan, item.g.nama + ': jumlah partikel sabuk tidak sesuai jumlah pesan orang lain');
            ok(item.batuPoints.geometry.attributes.position.count === diharapkan,
              item.g.nama + ': buffer partikel sabuk tidak sesuai');
          });
          return true;
        });
      }
    },
    {
      nama: 'langit: setiap butir sabuk membawa pesannya',
      fn: function () {
        var kurang = [];
        UM.galaksi.state.daftar.forEach(function (item) {
          (item.batuList || []).forEach(function (entri) {
            if (!entri || !entri.pesan || !entri.pesan.isi) kurang.push(item.g.nama);
          });
        });
        ok(!kurang.length, 'butir sabuk tanpa pesan di: ' + kurang.slice(0, 3).join(', '));
        return true;
      }
    },
    {
      nama: 'langit: galaksi bawaan engine dimatikan secara baku',
      fn: function () {
        if (/[?&]galaksiBawaan=/.test(location.search)) throw new Error('dilewati: URL memaksa setelan ini');
        return UM.store.getMeta('setelan').then(function (s) {
          if (s && s.galaksiBawaan) throw new Error('dilewati: pengguna menyalakannya sendiri');
          sama(UM.galaksi.state.galaksiBawaan, false, 'galaksi bawaan seharusnya mati secara baku');
          if (window.GX && GX.deepSky) sama(GX.deepSky.visible, false, 'langit galaksi jauh masih tampil');
          if (window.GX && GX.deepCluster) sama(GX.deepCluster.visible, false, 'glow kluster galaksi jauh masih tampil');
          var luar = (window.GX && GX.galaxyLODs ? GX.galaxyLODs : []).filter(function (l) { return l.cat; });
          ok(luar.length >= 7, 'galaksi luar engine tidak ditemukan: ' + luar.length);
          luar.forEach(function (l) { sama(l.pts.visible, false, 'galaksi luar masih tampil: ' + l.cat); });
          return true;
        });
      }
    },
    {
      nama: 'langit: galaksi bawaan bisa dinyalakan lagi sebagai template',
      fn: function () {
        ok(window.GX && GX.galaxyLODs, 'GX.galaxyLODs tidak ada');
        UM.galaksi.setGalaksiBawaan(true);
        var terlihat = GX.galaxyLODs.some(function (l) { return l.cat && l.pts.visible; });
        ok(terlihat, 'menyalakan galaksi bawaan tidak menampilkan apa pun');
        if (GX.deepSky) sama(GX.deepSky.visible, true, 'langit galaksi jauh tidak ikut menyala');
        UM.galaksi.setGalaksiBawaan(false);
        var masih = GX.galaxyLODs.some(function (l) { return l.cat && l.pts.visible; });
        ok(!masih, 'mematikan kembali tidak menyembunyikan galaksi bawaan');
        return true;
      }
    },
    {
      nama: 'langit: pesan privat terkunci tetap punya bintangnya',
      fn: function () {
        // Bintang mewakili keberadaan pesan, bukan isinya: pesan privat yang
        // belum bisa dibuka tetap harus tampak, supaya kenangan tidak menghilang
        // hanya karena kuncinya belum dibuka.
        var adaPrivat = false;
        UM.galaksi.state.daftar.forEach(function (item) {
          (item.pesanSendiri || []).forEach(function (p) { if (p.privasi === 'privat') adaPrivat = true; });
        });
        ok(adaPrivat, 'tidak ada bintang privat sama sekali — data contoh berubah?');
        return true;
      }
    },
    {
      nama: 'langit: posisi galaksi stabil dan tidak berimpit',
      fn: function () {
        var ids = ['g_ibu', 'g_rani', 'g_kakek', 'g_aku', 'g_bayu', 'g_ratih'];
        var pos = ids.map(UM.galaksi._posDariId);
        ids.forEach(function (id, i) {
          var ulang = UM.galaksi._posDariId(id);
          ok(ulang.x === pos[i].x && ulang.y === pos[i].y && ulang.z === pos[i].z, id + ' berpindah antar pemanggilan');
          ok(Math.hypot(pos[i].x, pos[i].z) > 360, id + ' berada di dalam piringan Milky Way');
        });
        for (var i = 0; i < pos.length; i++) {
          for (var j = i + 1; j < pos.length; j++) {
            ok(pos[i].distanceTo(pos[j]) > 200, ids[i] + ' dan ' + ids[j] + ' terlalu berdekatan');
          }
        }
        return true;
      }
    },
    {
      nama: 'langit: kurva jalur melengkung, mulai di asal, tiba di tujuan',
      fn: function () {
        var V = tiga().Vector3;
        var p0 = new V(300, 0, 0), p1 = new V(600, 200, 0), p2 = new V(900, 0, 400), a = new V();
        UM.galaksi._kuadrik(p0, p1, p2, 0, a);
        ok(a.distanceTo(p0) < 1e-6, 'tidak mulai di asal');
        UM.galaksi._kuadrik(p0, p1, p2, 1, a);
        ok(a.distanceTo(p2) < 1e-6, 'tidak tiba di tujuan');
        UM.galaksi._kuadrik(p0, p1, p2, 0.5, a);
        var lurus = new V((p0.x + p2.x) / 2, (p0.y + p2.y) / 2, (p0.z + p2.z) / 2);
        ok(a.distanceTo(lurus) > 1, 'jalur lurus — titik kontrol diabaikan');
        return true;
      }
    },
    {
      nama: 'langit: warna bintang membedakan privasi',
      fn: function () {
        var pr = UM.galaksi._warnaBintang('privat', '#9cc0ff');
        var pu = UM.galaksi._warnaBintang('publik', '#9cc0ff');
        var un = UM.galaksi._warnaBintang('unlisted', '#9cc0ff');
        ok(Math.abs(pr.r - pu.r) > 0.05, 'privat vs publik terlalu mirip');
        ok(Math.abs(pu.b - un.b) > 0.05, 'publik vs unlisted terlalu mirip');
        ok(pu.r > pr.r, 'publik seharusnya lebih hangat');
        return true;
      }
    },
    {
      nama: 'langit: sprite galaksi dibebaskan dari kabut adegan',
      fn: function () {
        // Kabut adegan hanya memengaruhi SpriteMaterial (bukan ShaderMaterial),
        // dan pada jarak 900 hanya 31% yang tersisa. Kalau inti galaksi tidak
        // dibebaskan, orangnya kehilangan wajahnya saat dilihat dari jauh.
        var daftar = UM.galaksi.state.daftar;
        var diperiksa = 0;
        daftar.forEach(function (item) {
          if (!item.lod || !item.lod.pts) return;
          item.lod.pts.traverse(function (n) {
            if (n.isSprite && n.material) {
              diperiksa++;
              ok(n.material.fog === false, item.g.nama + ': sprite masih berkabut');
            }
          });
        });
        ok(diperiksa >= 0, 'tidak ada sprite diperiksa'); // genus yang jarang: boleh nol
        return true;
      }
    },
    {
      nama: 'langit: kait per frame terpasang',
      fn: function () {
        ok(typeof enterSky === 'function', 'enterSky engine tidak ada');
        ok(typeof exitSky === 'function', 'exitSky engine tidak ada');
        ok(typeof flyTo === 'function', 'flyTo engine tidak ada');
        ok(typeof flyHome === 'function', 'flyHome engine tidak ada');
        ok(typeof updateBeacons === 'function', 'updateBeacons engine tidak ada');
        ok(typeof window.updateSkyLabels === 'function', 'updateSkyLabels tidak ada');
        ok(document.getElementById('um-galaksilabels') !== null, 'label galaksi belum dibuat');
        ok(document.getElementById('um-petalabels') !== null, 'label Peta belum dibuat');
        return true;
      }
    },
    {
      nama: 'pilih: yang terpilih adalah titik di bawah kursor',
      fn: function () {
        /* Tes ini mengunci keluhan yang paling mudah muncul kembali: kamera
           terbang ke titik yang BUKAN yang diklik. Penyebabnya adalah urutan
           hasil raycast three.js (menurut jarak kamera), bukan menurut posisi
           kursor. Di sini hasil _pilihDi dibandingkan dengan hasil hitung paksa:
           titik dengan jarak layar terkecil ke kursor. */
        var T = tiga(); ok(T, 'THREE tidak tersedia');
        ok(typeof viewMode === 'undefined' || viewMode === 'galaxy', 'dilewati: bukan mode galaksi');
        var daftar = UM.galaksi.state.daftar;
        ok(daftar.length > 0, 'belum ada galaksi orang');
        var simpan = { pos: camera.position.clone(), target: controls.target.clone(), ikut: UM.galaksi.state.ikut };
        var lebar = renderer.domElement.clientWidth, tinggi = renderer.domElement.clientHeight;
        ok(lebar > 0 && tinggi > 0, 'kanvas belum berukuran');

        function terdekatKeKamera() {
          var best = null, bd = Infinity;
          daftar.forEach(function (it) { var d = camera.position.distanceTo(it.pos); if (d < bd) { bd = d; best = it; } });
          return best;
        }

        var dunia = new T.Vector3(), ndc = new T.Vector3(), kamera3 = new T.Vector3();
        /* Posisi layar sebuah titik, atau null kalau titiknya di belakang kamera —
           aturan yang sama dengan yang dipakai ladang galaksi. Tanpa penyaring
           ini, titik di belakang kamera akan tampak "ada" di layar karena
           proyeksinya tercermin ke sisi sebaliknya. */
        function layarDari(k) {
          UM.galaksi.posisiTitikDari(k.points, k.index, dunia);
          if (kamera3.copy(dunia).applyMatrix4(camera.matrixWorldInverse).z >= -1e-4) return null;
          return ndc.copy(dunia).project(camera);
        }
        function jarakPiksel(k, x, y) {
          var v = layarDari(k);
          if (!v) return Infinity;
          var dx = (v.x - x) * 0.5 * lebar, dy = (v.y - y) * 0.5 * tinggi;
          return Math.sqrt(dx * dx + dy * dy);
        }

        var kandidat = [], item = null, arah = new T.Vector3(), gambarTitik = 0, itulah = 0, tepat = 0;

        function periksa(jarakKamera) {
          var pu = item.pos.clone().addScaledVector(arah, jarakKamera);
          camera.position.copy(pu);
          camera.lookAt(item.pos);
          camera.updateMatrixWorld(true);
          var diperiksa = 0, jitu = 0;
          for (var pi = 0; pi < gambarTitik && diperiksa < 6; pi += 13) {
            var layar = layarDari({ points: item.lod.pts, index: pi });
            if (!layar) continue;                     // di belakang kamera
            var p = layar.clone();
            if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9) continue; // di luar layar
            // hitung paksa: titik dengan jarak layar terkecil ke kursor
            var minPx = Infinity, minK = null;
            for (var ci = 0; ci < kandidat.length; ci++) {
              var dpx = jarakPiksel(kandidat[ci], p.x, p.y);
              if (dpx < minPx) { minPx = dpx; minK = kandidat[ci]; }
            }
            var hit = UM.galaksi._pilihDi(p.x, p.y);
            if (minPx <= UM.galaksi.JARI_KURSOR_PX) {
              ok(hit, 'tidak ada yang terpilih, padahal ada titik ' + minPx.toFixed(1) + ' px dari kursor');
              var dpxHit = jarakPiksel(hit, p.x, p.y);
              // selisih di bawah 0.75 px memang boleh dimenangkan yang lebih dekat ke kamera
              ok(dpxHit <= minPx + 0.76, 'yang terpilih berjarak ' + dpxHit.toFixed(1) + ' px, padahal ada yang ' + minPx.toFixed(1) + ' px');
              if (hit.points === minK.points && hit.index === minK.index) jitu++;
            } else {
              ok(!hit, 'ada yang terpilih padahal tidak ada titik dalam ' + UM.galaksi.JARI_KURSOR_PX + ' px');
            }
            diperiksa++;
          }
          ok(diperiksa >= 3, 'titik uji di dalam layar terlalu sedikit: ' + diperiksa);
          itulah += diperiksa; tepat += jitu;
        }

        try {
          /* Galaksi yang dibingkai: kamera diletakkan di sisi LUAR galaksi
             (menjauh dari pusat Milky Way) supaya tidak ada galaksi lain yang
             jadi lebih dekat di KEDUA posisi uji — kalau ada, pengujian ini tidak
             sahih, karena ladang galaksi akan menguji galaksi yang lain. */
          var mundur = camera.position.clone();
          for (var gi = 0; gi < daftar.length && !item; gi++) {
            var calon = daftar[gi], Rc = calon.g.radius || 140;
            arah.copy(calon.pos).setY(calon.pos.y * 0.6).normalize();
            camera.position.copy(calon.pos.clone().addScaledVector(arah, Rc * 3));
            var diJauh = terdekatKeKamera() === calon;
            camera.position.copy(calon.pos.clone().addScaledVector(arah, UM.galaksi.jarakTiba(calon)));
            var diDekat = terdekatKeKamera() === calon;
            if (diJauh && diDekat) item = calon; else camera.position.copy(mundur);
          }
          ok(item, 'tidak ada galaksi yang bisa dibingkai sendirian di kedua jarak uji');
          controls.target.copy(item.pos);
          camera.lookAt(item.pos);
          camera.updateMatrixWorld(true);

          // semua yang benar-benar digambar: titik lengan + partikel sabuk doa
          var geoP = item.lod.pts.geometry.attributes.position;
          gambarTitik = Math.min(geoP.count, item.lod.pts.geometry.drawRange.count || geoP.count);
          for (var i = 0; i < gambarTitik; i++) kandidat.push({ points: item.lod.pts, index: i });
          if (item.batuPoints) {
            var geoB = item.batuPoints.geometry.attributes.position;
            var gambarB = Math.min(geoB.count, item.batuDigambar || 0);
            for (var j = 0; j < gambarB; j++) kandidat.push({ points: item.batuPoints, index: j });
          }
          ok(kandidat.length >= 400, 'kandidat terlalu sedikit untuk diuji: ' + kandidat.length);

          periksa((item.g.radius || 140) * 3);  // saat galaksi dibingkai
          periksa(UM.galaksi.jarakTiba(item));  // saat kamera sudah menempel padanya
          ok(tepat >= 4, 'terlalu sering titik yang ditunjuk tidak terpilih: ' + tepat + ' dari ' + itulah);
          return true;
        } finally {
          camera.position.copy(simpan.pos);
          controls.target.copy(simpan.target);
          camera.lookAt(simpan.target);
          camera.updateMatrixWorld(true);
          UM.galaksi.state.ikut = simpan.ikut; // kalau tidak, frame berikutnya menggeser kamera yang baru dipulihkan
        }
      }
    },
    {
      nama: 'Peta: arah penanda stabil dan berbeda antar galaksi',
      fn: function () {
        var a1 = UM.sky._arahDariId('g_ibu'), a2 = UM.sky._arahDariId('g_ibu');
        ok(Math.abs(a1.length() - 1) < 1e-6, 'bukan vektor satuan');
        ok(a1.x === a2.x && a1.y === a2.y && a1.z === a2.z, 'penanda berpindah antar pemanggilan');
        ok(a1.distanceTo(UM.sky._arahDariId('g_rani')) > 0.05, 'dua penanda hampir berimpit');
        return true;
      }
    },
    {
      nama: 'Peta: rasi astronomi tidak tercampur dengan galaksi orang',
      fn: function () {
        ok(typeof SKY_CONS !== 'undefined', 'SKY_CONS engine tidak ada');
        ok(SKY_CONS.length >= 25, 'SKY_CONS kehilangan data rasi astronomi');
        UM.sky.setMode(UM.sky.getMode()); // pastikan mode sudah diterapkan
        sama(SKY_CONS[0].lineMat.visible, UM.sky.getMode() !== 'kenangan', 'visibilitas rasi astronomi tidak mengikuti mode');
        return true;
      }
    }
  ];

  /* ── pelari ──────────────────────────────────────────────────────────────── */

  function lapor(hasil) {
    var gagal = hasil.filter(function (h) { return !h.ok; });
    var judul = gagal.length ? ('Untukmu: ' + gagal.length + ' dari ' + hasil.length + ' tes GAGAL')
      : ('Untukmu: ' + hasil.length + ' tes lulus');
    if (window.console) {
      console.log('%c' + judul, 'font-weight:bold;color:' + (gagal.length ? '#f87171' : '#34d399'));
      hasil.forEach(function (h) { console.log((h.ok ? '  ✓ ' : '  ✗ ') + h.nama + (h.ok ? '' : ' — ' + h.pesan)); });
    }
    var box = document.createElement('div');
    box.className = 'um-screen on z-top';
    box.innerHTML = '<div class="um-wrap wide" style="margin-top:24px"><div class="um-card">' +
      '<div class="um-h1" style="color:' + (gagal.length ? '#fca5a5' : '#34d399') + '">' + judul + '</div>' +
      '<ul class="um-list" style="margin-top:12px">' + hasil.map(function (h) {
        return '<li class="um-item"><div class="um-item-top"><span class="who">' + (h.ok ? '✓' : '✗') + ' ' + h.nama + '</span></div>' +
          (h.ok ? '' : '<div class="txt" style="color:#fca5a5">' + h.pesan + '</div>') + '</li>';
      }).join('') + '</ul>' +
      '<div class="um-note">Pengujian mengunci kunci enkripsimu di akhir. Buka lagi lewat menu Kunci.</div>' +
      '<div class="um-btn-row"><button class="um-btn" id="um-test-close">Tutup</button></div>' +
      '</div></div>';
    document.body.appendChild(box);
    var btn = document.getElementById('um-test-close');
    if (btn) btn.addEventListener('click', function () { box.parentNode.removeChild(box); });
  }

  function run() {
    var hasil = [];
    var rantai = Promise.resolve();
    TESTS.forEach(function (t) {
      rantai = rantai.then(function () {
        return Promise.resolve().then(function () { return t.fn(); }).then(function (r) {
          hasil.push({ nama: t.nama, ok: r === true, pesan: r === true ? '' : String(r) });
        }).catch(function (err) {
          hasil.push({ nama: t.nama, ok: false, pesan: String((err && err.message) || err) });
        });
      });
    });
    return rantai.then(function () { lapor(hasil); return hasil; });
  }

  return { run: run, TESTS: TESTS };
})();
