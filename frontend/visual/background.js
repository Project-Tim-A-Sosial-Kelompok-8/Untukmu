/* Latar Milky Way dan bintang Kenangan dipulihkan dari visual sebelumnya.
 * Justin Zhang Jun — PolyForm Noncommercial License 1.0.0.
 * Hanya data bentuk/warna yang dipakai; nama, katalog, dan kartu astronomi tidak disertakan.
 */
var visualStart = videoNow(), perfScale = 1, perfEMA = 16.7, perfLast = 0, perfNextCheck = videoNow() + 12000;
  var BLOOM = { strength: 0.08, radius: 0.32, threshold: 0.42 };
  var TONE = { exposure: 1.1 };
  var DUST = { count: 85000, min: 1500, radius: 360, arms: 4, minorDim: 0.42, tight: 0.85, armWidth: 46, randomness: 0.5, thickness: 24, radPow: 0.72, size: 4.0, brightness: 0.5, inside: 0xffcf8a, outside: 0x86acec, hii: 0xff5fa8, blueStar: 0xcfe6ff };
  var GALAXY_SPIN = 0.013;
  // bloom composer (defensive: fall back to plain rendering if any global is missing)
  var composer = null;
  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(outputWidth, outputHeight), BLOOM.strength, BLOOM.radius, BLOOM.threshold));
    // tone-map AFTER bloom (ACES + gamma) so bright cores compress to colour instead of clipping to white
    composer.addPass(new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uExposure: { value: TONE.exposure } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float uExposure; varying vec2 vUv;' +
        'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }' +
        'void main(){ vec3 c = aces(texture2D(tDiffuse, vUv).rgb * uExposure); gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0); }'
    }));
    composer.setSize(outputWidth, outputHeight);
  } catch (e) { composer = null; }
  function render() {
    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  // glow point fragment shared by dust + planets
  var GLOW_FRAG = 'varying vec3 vColor; void main(){ float s = pow(max(0.0, 1.0 - distance(gl_PointCoord, vec2(0.5)) * 2.0), 2.0); if (s < 0.02) discard; gl_FragColor = vec4(vColor, s); }';
  // softer GAUSSIAN falloff for the gas — no hard dis edge, so dense points blend into a continuous nebula instead of visible circles
  var STAR_FRAG = 'varying vec3 vColor; void main(){ float d = distance(gl_PointCoord, vec2(0.5)) * 2.0;' + // external-galaxy stars: hot core + coloured halo — reads as a star up close, not a cotton ball
    ' float halo = pow(max(0.0, 1.0 - d), 2.2) * 0.65; float core = exp(-d * d * 18.0); float s = halo + core; if (s < 0.02) discard;' +
    ' vec3 c = vColor * halo + (vColor * 0.55 + vec3(0.75)) * core; gl_FragColor = vec4(c, 1.0); }';

  // ── galactic-dust spiral backdrop (decorative; AUTO-FADES as real data grows) ──
  var dustObj = null, dustBuiltCount = -1;
  function buildDust(count) {
    if (dustObj) { galaxyRoot.remove(dustObj); dustObj.geometry.dispose(); dustObj.material.dispose(); dustObj = null; }
    var N = Math.max(0, count | 0);
    dustBuiltCount = N;
    if (N === 0) return;
    var pos = new Float32Array(N * 3), scl = new Float32Array(N), colA = new Float32Array(N * 3);
    var inside = new THREE.Color(DUST.inside), outside = new THREE.Color(DUST.outside), mix = new THREE.Color();
    // Stars CLUMP into irregular knots/associations along the arms (like the real Milky
    // Way — NOT a smooth uniform field). Seed cluster centres on the (weighted) arms, then
    // drop ~80% of stars as a gaussian blob around a centre + a sparse diffuse field.
    var TAU = 6.28318530718;
    function grand() { return Math.random() + Math.random() + Math.random() - 1.5; } // ~gaussian, range ±1.5
    function pickArm(r) { var idx = (Math.random() < 0.7) ? Math.floor(Math.random() * (DUST.arms / 2)) * 2 : Math.floor(Math.random() * (DUST.arms / 2)) * 2 + 1, maj = (idx % 2 === 0); return { maj: maj, ang: idx * (TAU / DUST.arms) + r * DUST.tight * TAU + (Math.random() - 0.5) * DUST.randomness * (maj ? 1.0 : 1.25) }; }
    var NC = Math.max(20, Math.round(N / 200)), clusters = []; // ~1 cluster per 200 stars
    for (var c = 0; c < NC; c++) {
      var crf = Math.pow(Math.random(), DUST.radPow), cp = pickArm(crf), cR = crf * DUST.radius + (Math.random() - 0.5) * DUST.armWidth;
      clusters.push({ x: Math.cos(cp.ang) * cR, z: Math.sin(cp.ang) * cR, rf: crf, maj: cp.maj, sz: 6 + Math.random() * Math.random() * 36 }); // mostly small knots, a few big associations
    }
    for (var i = 0; i < N; i++) {
      var rf, major;
      if (Math.random() < 0.8) {                                  // ~80% of stars CLUMP into a knot
        var k = clusters[(Math.random() * NC) | 0];
        rf = k.rf; major = k.maj;
        pos[i * 3] = k.x + grand() * k.sz; pos[i * 3 + 2] = k.z + grand() * k.sz;
        pos[i * 3 + 1] = grand() * DUST.thickness * ((1 - rf) + 0.2) * 0.45;
      } else {                                                    // ~20% diffuse field stars between the knots
        rf = Math.pow(Math.random(), DUST.radPow); var fp = pickArm(rf), offR = rf * DUST.radius + (Math.random() - 0.5) * DUST.armWidth;
        major = fp.maj;
        pos[i * 3] = Math.cos(fp.ang) * offR; pos[i * 3 + 2] = Math.sin(fp.ang) * offR;
        pos[i * 3 + 1] = (Math.random() - 0.5) * DUST.thickness * ((1 - rf) + 0.2);
      }
      mix.copy(inside).lerp(outside, Math.min(1, Math.max(0, (rf - 0.12) * 3.0))).multiplyScalar(DUST.brightness * (major ? 1.0 : DUST.minorDim) * (1 - 0.4 * Math.min(1, Math.max(0, (rf - 0.78) * 4.5)))); // blue-white arms (gold only in the inner disc) + minor arms dimmer + dim the outer edge
      scl[i] = (0.3 + Math.random() * 0.9) * (major ? 1.0 : 0.82);
      var kn = Math.random();                                            // scattered YELLOW giants + bright HII (pink) / hot blue-white clusters (HII+blue in the MAJOR arms)
      if (kn < 0.003) { mix.setHex(0xffd45a).multiplyScalar(DUST.brightness * 2.6); scl[i] = 1.4 + Math.random() * 1.2; }                              // bright YELLOW glowing stars (giants / globulars like Palomar 1), scattered everywhere
      else if (major && rf > 0.28 && kn < 0.024) { var cr = Math.random(), col = cr < 0.6 ? 0xff5e30 : (cr < 0.8 ? 0xcfe6ff : 0x4d8cff); mix.setHex(col).multiplyScalar(DUST.brightness * 2.3); scl[i] = 1.2 + Math.random() * 0.9; } // bright knot stars: 60% orange-red, 20% blue-white, 20% blue (was pink HII)
      else if (major && rf > 0.28 && kn < 0.103) { mix.setHex(DUST.blueStar).multiplyScalar(DUST.brightness * 2.0); scl[i] = 0.9 + Math.random() * 0.8; } // hot blue-white clusters
      colA[i * 3] = mix.r; colA[i * 3 + 1] = mix.g; colA[i * 3 + 2] = mix.b;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(colA, 3));
    g.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
    var mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: DUST.size * renderer.getPixelRatio() } },
      vertexShader: 'uniform float uSize; attribute float aScale; attribute vec3 aColor; varying vec3 vColor;' +
        'void main(){ vec4 mp = modelMatrix * vec4(position,1.0); vec4 vp = viewMatrix * mp; gl_Position = projectionMatrix * vp;' +
        ' gl_PointSize = uSize * aScale * (300.0 / -vp.z); vColor = aColor; }',
      fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    dustObj = new THREE.Points(g, mat); galaxyRoot.add(dustObj); // rotates with the galaxy
  }
  // dustFor: the current dust count, scaled down by the FPS watchdog on weak GPUs.
  function dustFor() { return Math.max(DUST.min, Math.round(DUST.count * perfScale)); }
  buildDust(DUST.count); // full dust on load

  // HII / reflection nebula clouds are now rendered IN the nebulaField shader as
  // gradient-coloured (deep-red ↔ blue-white) COHESIVE regions — no more separate
  // gaussian-point knots (those read as "一个一个小的高斯圆" / individual circles).

  // ── nebula gas as a CONTINUOUS SHADER FIELD (not point sprites) ──────────────
  // A flat disc in the galaxy plane whose fragment shader computes smooth fBm-noise
  // clouds modulated by the spiral — a fluid, water-like nebula that wraps the stars
  // with NO visible circles (point sprites always showed a disc edge). Rides galaxyRoot.
  var NEBULA = { inside: 0xffc878, outside: 0x5f93e8 }; // warm core ↔ cool arm gas colours
  var nebMat = null; // module-scope so the ?tune panel can adjust the glow uniforms live
  (function nebulaField() {
    var geo = new THREE.PlaneGeometry(DUST.radius * 2.6, DUST.radius * 2.6, 1, 1);
    nebMat = new THREE.ShaderMaterial({
      uniforms: {
        uR: { value: DUST.radius }, uArms: { value: DUST.arms }, uTight: { value: DUST.tight },
        uInside: { value: new THREE.Color(NEBULA.inside) }, uOutside: { value: new THREE.Color(NEBULA.outside) },
        uBright: { value: 0.28 }, uMinorDim: { value: DUST.minorDim },
        uCoreExp: { value: 6.0 }, uCoreStr: { value: 1.55 }, uCoreWhite: { value: 0.5 } // operator-tuned defaults
      },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'varying vec2 vP; uniform float uR; uniform float uArms; uniform float uTight; uniform vec3 uInside; uniform vec3 uOutside; uniform float uBright; uniform float uMinorDim; uniform float uCoreExp; uniform float uCoreStr; uniform float uCoreWhite;' +
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }' +
        'float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }' +
        'float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++){ v += a * noise(p); p = p * 2.0; a *= 0.5; } return v; }' +
        'float worley(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); float md = 1.0; for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++){ vec2 g = vec2(float(x), float(y)); vec2 o = vec2(hash(i + g), hash(i + g + 3.1)); vec2 d = g + o - f; md = min(md, dot(d, d)); } return sqrt(md); }' + // cellular billows (procedural-clouds shape recipe)
        'float remap(float v, float a, float b, float c, float e){ return c + (clamp(v, a, b) - a) / (b - a) * (e - c); }' +
        'void main(){' +
        '  float r = length(vP); float ang = atan(vP.y, vP.x); float nr = r / uR;' +
        '  if (nr > 1.2) discard;' +
        // DOMAIN WARP — two low-freq noise fields bend the arm + the clouds so the perfect
        // spiral MEANDERS and branches (spurs/feathers), not a regular snail shell.
        '  vec2 wp = vP * 0.011;' +
        '  float w1 = fbm(wp);' +
        '  float w2 = fbm(wp + 4.3);' +
        '  float angW = ang + (w1 - 0.5) * 0.85;' + // arm wanders (more irregular now)
        '  float theta = angW - nr * uTight * 6.28318;' + // unwound angle (arms at theta = k*TAU/uArms)
        '  float spiral = cos(uArms * theta);' + // same winding as the dust arms, but warped
        '  float armId = mod(floor(theta * uArms / 6.28318 + 0.5), uArms);' + // which arm this point is in
        '  float arm = pow(max(0.0, spiral * 0.5 + 0.5), 2.3) * mix(uMinorDim, 1.0, step(mod(armId, 2.0), 0.5));' + // EVEN arms major (bright), ODD minor (dim)
        // flocculent cloud: domain-warp the sample coords by the warp fields → wispy/turbulent
        '  vec2 q = vP * 0.02 + vec2(w1, w2) * 6.0;' + // stronger domain warp → more irregular, turbulent clouds
        '  float fl = fbm(q);' +
        '  float cell = 1.0 - worley(q * 1.6);' + // WORLEY cellular → cauliflower/billow structure
        '  float shape = fl * 0.6 + cell * 0.4;' + // blend fBm + Worley (the clouds-skill shape recipe)
        '  float cov = remap(shape, 0.42, 0.92, 0.0, 1.0);' + // COVERAGE REMAP → crisp wisps + dark gaps, not a smooth wash
        '  float erosion = fbm(q * 3.5 + vec2(w1, w2) * 3.0) * 0.4;' + // DETAIL EROSION → torn, wispy edges
        '  float clump = max(cov - erosion, 0.0) * 1.9;' +
        '  float dens = arm * (0.12 + clump) + 0.035 * fl * fl;' + // clumpy arm + a faint inter-arm disc haze (not dead black)
        '  dens *= 0.3 + 0.7 * smoothstep(0.28, 0.62, w2);' + // darker DUST LANES — stronger arm/lane contrast, like the ref
        // radial envelope = a RING: clear core, densest just outside the bulge, long gentle fade to the rim
        '  float radial = smoothstep(0.06, 0.38, nr) * smoothstep(1.0, 0.42, nr);' + // outer fade earlier → dimmer rim
        '  float a = dens * radial * uBright;' +
        '  if (a < 0.008) discard;' +
        // Palette: warm cream CORE → a PURPLE→BLUE gradient across the disc (ref img 2). The purple↔blue
        // factor `pb` is mostly RADIAL (inner arms magenta-violet, outer arms azure-blue) + a big low-freq
        // noise so it's organic patches, not a clean ring — some reach bluer/purpler, like the reference.
        '  float pb = clamp(smoothstep(0.18, 0.85, nr) + (fbm(vP * 0.004 + 7.0) - 0.5) * 0.5, 0.0, 1.0);' +
        '  vec3 disc = mix(vec3(0.64, 0.34, 0.90), vec3(0.28, 0.56, 0.98), pb);' + // magenta-violet → azure-blue
        '  vec3 col = mix(vec3(0.98, 0.84, 0.70), disc, smoothstep(0.05, 0.26, nr));' + // warm core → disc gradient
        // per-cloud colour GRADIENT: a smooth left→right ramp perturbed by low-freq noise,
        // so every cloud transitions organically from one colour to the other (not monotone).
        '  float gcol = clamp(0.5 + 0.42 * (vP.x / uR) + (fbm(vP * 0.009 + 30.0) - 0.5) * 0.95, 0.0, 1.0);' +
        // MINOR arms (odd armId) → blue-white gas, gradient light-blue → blue-white
        '  float isMinor = 1.0 - step(mod(armId, 2.0), 0.5);' +
        '  col = mix(col, mix(vec3(0.44, 0.54, 0.94), vec3(0.64, 0.72, 0.98), gcol), isMinor * clamp(clump, 0.0, 1.0) * 0.50);' +
        // HII clouds: SAME shape (region/halpha byte-for-byte unchanged) — only the COLOUR changes to muted rose↔periwinkle
        '  float region = fbm(vP * 0.006 + 11.0);' +
        '  float halpha = smoothstep(0.6, 0.8, region) * clamp(clump * 1.5, 0.0, 1.0);' +
        '  vec3 hii = mix(vec3(0.92, 0.44, 0.70), vec3(0.46, 0.60, 0.98), gcol);' + // soft ROSE-magenta ↔ clear PERIWINKLE (reads, still soft)
        '  col = mix(col, hii, halpha * 0.55);' +
        // GLOWING CORES (ref): the densest knots of gas EMIT like star-forming regions. Isolate the
        // density peaks and intensify emission in the LOCAL hue (pink stays pink, blue stays blue), with
        // a hot near-white centre only at the very peak. Additive + bloom turn this into a glow-from-within.
        // Colour/emission only — `a` (opacity/footprint) is untouched.
        '  float core = pow(clamp(clump, 0.0, 1.0), uCoreExp);' + // isolate the densest peaks (tunable: uCoreExp)
        '  col *= 1.0 + core * uCoreStr;' +                       // coloured emission boost at the cores (uCoreStr)
        '  col = mix(col, vec3(1.0), core * uCoreWhite);' +       // hot near-white only at the very peak (uCoreWhite)
        '  col += (fl - 0.5) * 0.06;' + // subtle colour variation across the clouds
        '  gl_FragColor = vec4(col, a);' +
        '}',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    var plane = new THREE.Mesh(geo, nebMat); plane.rotation.x = Math.PI / 2; plane.frustumCulled = false;
    {
      // the pattern is completely static — bake the ~150-noise-ops-per-pixel shader ONCE
      // into a texture and draw a plain quad forever after (?tune keeps the live shader)
      var bakeHalf = DUST.radius * 1.3, bakeRT = new THREE.WebGLRenderTarget(2048, 2048, { format: THREE.RGBAFormat });
      var bakeMat = nebMat.clone(); bakeMat.blending = THREE.NoBlending;
      var bakeScene = new THREE.Scene(); bakeScene.add(new THREE.Mesh(geo, bakeMat));
      var bakeCam = new THREE.OrthographicCamera(-bakeHalf, bakeHalf, bakeHalf, -bakeHalf, 0.1, 10);
      bakeCam.position.z = 1; bakeCam.lookAt(0, 0, 0);
      var bakeClear = renderer.getClearColor(new THREE.Color()), bakeAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(bakeRT); renderer.setClearColor(0x000000, 0); renderer.clear();
      renderer.render(bakeScene, bakeCam);
      renderer.setRenderTarget(null); renderer.setClearColor(bakeClear, bakeAlpha);
      plane.material = new THREE.MeshBasicMaterial({ map: bakeRT.texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      bakeMat.dispose(); nebMat.dispose();
    } // +π/2 so local y → world +z (matches the dust's world angle, no mirror)
    galaxyRoot.add(plane); // lies flat in the disc, rotates with the galaxy + the stars
  })();

  // ── background star-field: fine sharp points on a far sphere (the fixed "sky").
  // Each star TWINKLES on its own phase/speed — one uTime uniform per frame, the
  // sin() runs in the vertex shader (4000 verts ≈ free). ──────────────────────────
  var bgTwinkleMat = null;
  (function bgStars() {
    var N = 4000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), phs = new Float32Array(N), spd = new Float32Array(N), c = new THREE.Color();
    for (var i = 0; i < N; i++) {
      var th = Math.random() * 6.28318530718, ph = Math.acos(2 * Math.random() - 1), r = 900 + Math.random() * 800;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph);
      var b = 0.55 + Math.random() * 0.45, tint = Math.random();
      if (tint < 0.12) c.setRGB(b * 0.74, b * 0.85, b); else if (tint < 0.22) c.setRGB(b, b * 0.82, b * 0.6); else c.setRGB(b, b, b);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      phs[i] = Math.random() * 6.28318; spd[i] = 0.6 + Math.random() * 1.6;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phs, 1));
    g.setAttribute('aSpd', new THREE.BufferAttribute(spd, 1));
    bgTwinkleMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: 3.4 * renderer.getPixelRatio() } },
      vertexShader: 'uniform float uTime; uniform float uSize; attribute vec3 aColor; attribute float aPhase; attribute float aSpd; varying vec3 vColor;' +
        'void main(){ vec4 vp = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * vp;' +
        ' float tw = 0.6 + 0.4 * sin(uTime * aSpd + aPhase);' +
        ' float flare = pow(max(0.0, sin(uTime * (0.25 + aSpd * 0.2) + aPhase * 2.3)), 24.0);' + // rare brief scintillation flash
        ' float br = tw + flare;' +
        ' gl_PointSize = uSize * (0.8 + 0.5 * br) * (300.0 / -vp.z); vColor = aColor * br; }',
      fragmentShader: 'varying vec3 vColor; void main(){ float d = distance(gl_PointCoord, vec2(0.5)); if (d > 0.5) discard; float s = pow(max(0.0, 1.0 - d * 2.0), 1.4); gl_FragColor = vec4(vColor, s); }',
      transparent: true, depthWrite: false
    });
    scene.add(new THREE.Points(g, bgTwinkleMat)); // on the fixed sky, not galaxyRoot
  })();
  var BULGE = { count: 2200, radius: 84, flat: 0.5 };
  var coreBreath = []; // the bulge glow sprites + base scales — frame() breathes them ±2.8% on a ~20s sine
  (function centralBulge() {
    var glows = [{ c: 0xfffdf6, s: 80, o: 0.70 }, { c: 0xfff3da, s: 150, o: 0.50 }, { c: 0xffdc9e, s: 270, o: 0.30 }, { c: 0xffc06a, s: 440, o: 0.13 }]; // hot-white centre → gold halo, multi-scale = smooth
    for (var gi = 0; gi < glows.length; gi++) {
      var G = glows[gi], sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: G.c, transparent: true, opacity: G.o, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.set(0, 0, 0); sp.scale.set(G.s, G.s, 1); scene.add(sp);
      coreBreath.push({ sp: sp, s: G.s, o: G.o });
    }
    function gb() { return Math.random() + Math.random() + Math.random() - 1.5; } // ~gaussian, range ±1.5
    var N = BULGE.count, pos = new Float32Array(N * 3), colA = new Float32Array(N * 3), scl = new Float32Array(N);
    var c0 = new THREE.Color(0xfff2dc), c1 = new THREE.Color(0xffc266), cc = new THREE.Color();
    for (var i = 0; i < N; i++) {
      var gx = gb(), gy = gb(), gz = gb();
      pos[i * 3] = gx * BULGE.radius; pos[i * 3 + 1] = gy * BULGE.radius * BULGE.flat; pos[i * 3 + 2] = gz * BULGE.radius;
      var d = Math.min(1, Math.sqrt(gx * gx + gy * gy + gz * gz) / 2.2);
      cc.copy(c0).lerp(c1, d).multiplyScalar(DUST.brightness * (0.9 - 0.4 * d)); // FAINT — subtle texture only; the smooth glow is the core, not these points
      colA[i * 3] = cc.r; colA[i * 3 + 1] = cc.g; colA[i * 3 + 2] = cc.b;
      scl[i] = 0.3 + Math.random() * 0.5; // small soft points
    }
    var bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bg.setAttribute('aColor', new THREE.BufferAttribute(colA, 3));
    bg.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
    galaxyRoot.add(new THREE.Points(bg, new THREE.ShaderMaterial({
      uniforms: { uSize: { value: DUST.size * renderer.getPixelRatio() } },
      vertexShader: 'uniform float uSize; attribute float aScale; attribute vec3 aColor; varying vec3 vColor;' +
        'void main(){ vec4 mp = modelMatrix * vec4(position,1.0); vec4 vp = viewMatrix * mp; gl_Position = projectionMatrix * vp;' +
        ' gl_PointSize = uSize * aScale * (300.0 / -vp.z); vColor = aColor; }',
      fragmentShader: GLOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    })));
  })();
  var SKY_R = 1000;
  function raDecDir(raHours, decDeg) { // J2000 → unit direction on the sky sphere
    var ra = raHours / 24 * Math.PI * 2, dec = decDeg * Math.PI / 180;
    return new THREE.Vector3(Math.cos(dec) * Math.cos(ra), Math.sin(dec), -Math.cos(dec) * Math.sin(ra));
  }
  var skyTwinkleMat = null;
  (function skyBackdrop() {
    // faint twinkling background stars
    var N = 2500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), phs = new Float32Array(N), spd = new Float32Array(N), c = new THREE.Color();
    for (var i = 0; i < N; i++) {
      var th = Math.random() * 6.28318, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = SKY_R * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = SKY_R * Math.cos(ph); pos[i * 3 + 2] = SKY_R * Math.sin(ph) * Math.sin(th);
      var b = 0.35 + Math.random() * 0.55, tint = Math.random();
      if (tint < 0.12) c.setRGB(b * 0.74, b * 0.85, b); else if (tint < 0.2) c.setRGB(b, b * 0.85, b * 0.65); else c.setRGB(b, b, b);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      phs[i] = Math.random() * 6.28318; spd[i] = 0.5 + Math.random() * 1.4;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phs, 1));
    g.setAttribute('aSpd', new THREE.BufferAttribute(spd, 1));
    skyTwinkleMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: 3.0 * renderer.getPixelRatio() } },
      vertexShader: 'uniform float uTime; uniform float uSize; attribute vec3 aColor; attribute float aPhase; attribute float aSpd; varying vec3 vColor;' +
        'void main(){ vec4 vp = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * vp;' +
        ' float tw = 0.6 + 0.4 * sin(uTime * aSpd + aPhase);' +
        ' float flare = pow(max(0.0, sin(uTime * (0.25 + aSpd * 0.2) + aPhase * 2.3)), 24.0);' + // rare brief scintillation flash
        ' float br = tw + flare;' +
        ' gl_PointSize = uSize * (0.7 + 0.6 * br); vColor = aColor * br; }',
      fragmentShader: 'varying vec3 vColor; void main(){ float d = distance(gl_PointCoord, vec2(0.5)); if (d > 0.5) discard; float s = pow(max(0.0, 1.0 - d * 2.0), 1.4); gl_FragColor = vec4(vColor, s); }',
      transparent: true, depthWrite: false
    });
    skyScene.add(new THREE.Points(g, skyTwinkleMat));
    // the Milky Way as a faint band: points scattered around the galactic equator
    // (galactic north pole: RA 12.857h, Dec +27.13°)
    var pole = raDecDir(12.857, 27.13);
    var u = new THREE.Vector3(0, 1, 0).cross(pole).normalize(), v = pole.clone().cross(u);
    var M = 1600, mp = new Float32Array(M * 3), mc = new Float32Array(M * 3);
    function gs() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; } // ~gaussian −1..1
    for (var m = 0; m < M; m++) {
      var phi = Math.random() * 6.28318, lat = gs() * 0.12; // ±~7° gaussian band
      var d3 = u.clone().multiplyScalar(Math.cos(phi)).addScaledVector(v, Math.sin(phi)).addScaledVector(pole, lat).normalize();
      mp[m * 3] = d3.x * SKY_R; mp[m * 3 + 1] = d3.y * SKY_R; mp[m * 3 + 2] = d3.z * SKY_R;
      var mb = 0.10 + Math.random() * 0.22;
      mc[m * 3] = mb; mc[m * 3 + 1] = mb; mc[m * 3 + 2] = mb * 1.12;
    }
    var mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    skyScene.add(new THREE.Points(mg, new THREE.PointsMaterial({ size: 9, map: GLOW_TEX, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
    // faint ecliptic circle (obliquity 23.44°) — the zodiac's spine
    var E = 128, ep = new Float32Array(E * 3), eps = 23.439 * Math.PI / 180;
    for (var e = 0; e < E; e++) {
      var lam = e / E * 6.28318;
      var raE = Math.atan2(Math.sin(lam) * Math.cos(eps), Math.cos(lam)), decE = Math.asin(Math.sin(eps) * Math.sin(lam));
      var ed = new THREE.Vector3(Math.cos(decE) * Math.cos(raE), Math.sin(decE), -Math.cos(decE) * Math.sin(raE));
      ep[e * 3] = ed.x * SKY_R; ep[e * 3 + 1] = ed.y * SKY_R; ep[e * 3 + 2] = ed.z * SKY_R;
    }
    var eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    skyScene.add(new THREE.LineLoop(eg, new THREE.LineBasicMaterial({ color: 0xc9a86a, transparent: true, opacity: 0.22 })));
  })();
var skyComposer = null, skyComposerTried = false;
  function ensureSkyComposer() { // built lazily on first sky entry — many sessions never open the sky view
    if (skyComposerTried) return;
    skyComposerTried = true;
    try {
      skyComposer = new THREE.EffectComposer(renderer);
      skyComposer.addPass(new THREE.RenderPass(skyScene, skyCamera));
      skyComposer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(outputWidth, outputHeight), 0.7, 0.6, 0.15));
      skyComposer.addPass(new THREE.ShaderPass(THREE.CopyShader)); // final output pass — UnrealBloomPass alone renders black to screen
      skyComposer.setSize(outputWidth, outputHeight);
    } catch (e) { skyComposer = null; }
  }
  var skyFx = [], skyMeteorNext = videoNow() + 7000 + Math.random() * 10000;
  function spawnSkyMeteor() {
    var nx = Math.random() * 1.4 - 0.7, ny = Math.random() * 1.0 - 0.25;
    var d0 = new THREE.Vector3(nx, ny, 0.5).unproject(skyCamera).normalize();
    var ddx = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.4), ddy = -(0.25 + Math.random() * 0.4);
    var d1 = new THREE.Vector3(nx + ddx, ny + ddy, 0.5).unproject(skyCamera).normalize();
    var from = d0.multiplyScalar(SKY_R * 0.85), to = d1.multiplyScalar(SKY_R * 0.85);
    var dir = to.clone().sub(from), dist = dir.length(); dir.multiplyScalar(1 / dist);
    var viewDir = from.clone().sub(skyCamera.position).normalize();
    var side = new THREE.Vector3().crossVectors(dir, viewDir); if (side.lengthSq() < 1e-4) side.set(0, 1, 0); else side.normalize();
    var normal = new THREE.Vector3().crossVectors(dir, side);
    var m = new THREE.MeshBasicMaterial({ map: METEOR_TEX, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(METEOR_GEO, m);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, side, normal));
    mesh.scale.set(0.001, 3.2, 1); mesh.frustumCulled = false;
    skyScene.add(mesh);
    skyFx.push({ obj: mesh, mat: m, from: from, dir: dir, dist: dist, t0: videoNow(), dur: 1100 + Math.random() * 500 });
  }
  function updateSkyFx(nowMs) {
    if (viewMode !== 'sky') return;
    if (nowMs >= skyMeteorNext) { spawnSkyMeteor(); skyMeteorNext = nowMs + 9000 + Math.random() * 15000; }
    for (var i = skyFx.length - 1; i >= 0; i--) {
      var f = skyFx[i], k = (nowMs - f.t0) / f.dur;
      if (k >= 1) { skyScene.remove(f.obj); f.mat.dispose(); skyFx.splice(i, 1); continue; }
      var kh = Math.min(1, k), kt = Math.max(0, kh - 0.4), curLen = Math.max(f.dist * (kh - kt), 0.001);
      var hx = f.from.x + f.dir.x * f.dist * kh, hy = f.from.y + f.dir.y * f.dist * kh, hz = f.from.z + f.dir.z * f.dist * kh;
      f.obj.position.set(hx - f.dir.x * curLen * 0.5, hy - f.dir.y * curLen * 0.5, hz - f.dir.z * curLen * 0.5);
      f.obj.scale.x = curLen;
      f.mat.opacity = Math.pow(Math.sin(Math.min(1, k) * Math.PI), 0.8);
    }
  }
var memorySkyStars = [];
(function memoryBackdrop(){
    var starVert = 'uniform float uSize; uniform float uMul; uniform float uTime; attribute float aScale; attribute float aPhase; varying float vA; varying float vTw;' +
      'void main(){ vec4 vp = viewMatrix * modelMatrix * vec4(position,1.0); gl_Position = projectionMatrix * vp;' +
      ' float tw = 0.65 + 0.35 * sin(uTime * (0.6 + aPhase) + aPhase * 6.2831);' +
      ' vTw = tw; vA = uMul; gl_PointSize = uSize * aScale * uMul * (0.82 + 0.28 * tw); }';
    var starFrag = 'varying float vA; varying float vTw; void main(){ vec2 pc = gl_PointCoord - vec2(0.5); float d = length(pc);' +
      ' float core = pow(max(0.0, 1.0 - d * 2.6), 1.8);' +           // tight bright core
      ' float ax = abs(pc.x), ay = abs(pc.y);' +
      ' float hor = max(0.0, 1.0 - ay / 0.045) * max(0.0, 1.0 - ax / 0.5);' + // horizontal spike
      ' float ver = max(0.0, 1.0 - ax / 0.045) * max(0.0, 1.0 - ay / 0.5);' + // vertical spike
      ' float s = (core + (hor + ver) * 0.5) * (0.5 + 0.6 * vTw);' + // spikes + twinkle
      ' if (s < 0.01) discard; gl_FragColor = vec4(vec3(0.86, 0.92, 1.0) * vA, s); }';
  var groups = [[[2.12,23.46,2],[1.91,20.81,2.64],[1.89,19.29,3.86],[2.83,27.26,3.63],[3.19,19.73,4.35]],[[4.599,16.51,0.85],[5.438,28.61,1.65],[5.627,21.14,2.97],[4.477,19.18,3.53],[4.382,17.54,3.77],[4.33,15.63,3.65],[4.478,15.87,3.4],[4.011,12.49,3.47],[3.453,9.73,3.74]],[[7.577,31.89,1.58],[7.755,28.03,1.14],[6.629,16.4,1.92],[7.335,21.98,3.53],[6.732,25.13,3.06],[6.383,22.51,2.87],[6.248,22.51,3.31],[7.068,20.57,3.93],[6.755,12.9,3.35],[7.741,24.4,3.57]],[[8.28,9.19,3.52],[8.74,18.15,3.94],[8.72,21.47,4.66],[8.97,11.86,4.25],[8.78,28.76,4.02]],[[10.139,11.97,1.36],[11.818,14.57,2.14],[10.333,19.84,2.01],[11.235,20.52,2.56],[11.237,15.43,3.34],[10.278,23.42,3.43],[9.764,23.77,2.98],[9.879,26.01,3.88],[10.122,16.76,3.49]],[[13.42,-11.16,0.98],[11.84,1.76,3.61],[12.69,-1.45,2.74],[12.93,3.4,3.38],[13.04,10.96,2.83],[13.58,-0.6,3.37],[12.33,-0.67,3.89],[13.17,-5.54,4.38],[14.27,-6,4.08],[14.72,-5.66,3.88]],[[15.283,-9.38,2.61],[14.848,-16.04,2.75],[15.592,-14.79,3.91],[15.068,-25.28,3.29],[15.617,-28.13,3.58],[15.644,-29.78,3.66]],[[16.09,-19.8,2.62],[16.01,-22.6,2.29],[15.98,-26.1,2.89],[16.35,-25.6,2.88],[16.49,-26.4,0.96],[16.6,-28.2,2.82],[16.84,-34.3,2.29],[16.91,-42.4,3.59],[17.2,-43.2,3.33],[17.62,-43,1.86],[17.71,-39,2.39],[17.56,-37.1,1.62]],[[18.4,-34.38,1.85],[18.35,-29.83,2.7],[18.1,-30.42,2.98],[18.47,-25.42,2.81],[18.76,-27,3.17],[18.92,-26.3,2.05],[19.12,-27.67,3.32],[19.04,-29.88,2.6]],[[20.3,-12.54,3.57],[20.35,-14.78,3.08],[20.77,-25.27,4.14],[20.86,-26.92,4.11],[21.44,-22.41,3.74],[21.62,-19.47,4.51],[21.78,-16.13,2.85],[21.67,-16.66,3.67],[21.37,-16.83,4.28],[21.1,-17.23,4.07]],[[21.526,-5.57,2.87],[22.096,-0.32,2.94],[22.911,-15.82,3.27],[20.795,-9.5,3.77],[22.361,-1.39,3.85],[22.481,-0.02,3.65],[22.589,-0.12,4.04],[22.421,1.38,4.66],[22.281,-7.78,4.16],[22.877,-7.58,3.73]],[[23.286,3.28,3.7],[23.466,6.38,4.28],[23.666,5.63,4.13],[23.701,1.78,4.5],[23.449,1.26,4.94],[23.989,6.86,4.01],[0.811,7.59,4.43],[1.049,7.89,4.27],[1.69,5.49,4.44],[2.034,2.76,3.82],[1.757,9.16,4.26],[1.525,15.35,3.62]],[[11.06,61.75,1.79],[11.03,56.38,2.37],[11.9,53.69,2.44],[12.26,57.03,3.31],[12.9,55.96,1.77],[13.4,54.93,2.23],[13.79,49.31,1.86]],[[5.92,7.41,0.42],[5.24,-8.2,0.13],[5.42,6.35,1.64],[5.8,-9.67,2.09],[5.68,-1.94,1.77],[5.6,-1.2,1.69],[5.53,-0.3,2.23]],[[0.153,59.15,2.28],[0.675,56.54,2.24],[0.945,60.72,2.47],[1.43,60.24,2.68],[1.907,63.67,3.35]],[[12.443,-63.1,0.77],[12.795,-59.69,1.25],[12.519,-57.11,1.63],[12.252,-58.75,2.79],[12.357,-60.4,3.59]],[[20.690528,45.280339,1.25],[20.370473,40.256679,2.23],[19.512023,27.959681,3.05],[20.77018,33.970256,2.48],[19.749585,45.13081,2.87],[19.4951,51.729778,3.79],[21.215694,30.226924,3.2]],[[18.615,38.78,0.03],[18.738,39.67,4.59],[18.746,37.6,4.36],[18.908,36.9,4.3],[18.982,32.69,3.24],[18.835,33.36,3.52]],[[2.53,89.26,1.98],[14.85,74.16,2.08],[15.35,71.83,3.05],[17.54,86.59,4.36],[16.77,82.04,4.22],[15.73,77.79,4.32],[16.29,75.76,4.95]],[[6.752,-16.72,-1.46],[6.378,-17.96,1.98],[7.14,-26.39,1.83],[6.977,-28.97,1.5],[7.402,-29.3,2.45]],[[0.139,29.09,2.06],[0.655,30.86,3.27],[1.162,35.62,2.05],[0.947,38.5,3.86],[0.831,41.08,4.09],[2.065,42.33,2.1]],[[1.885,29.58,3.42],[2.159,34.99,3],[2.288,33.85,4.01]],[[14.66,-60.83,-0.27],[14.064,-60.37,0.61],[13.665,-53.47,2.29],[12.692,-48.96,2.2],[12.14,-50.72,2.57],[13.343,-36.71,2.75],[14.111,-36.37,2.06]],[[4.567,-55.04,3.27],[5.56,-62.49,3.76],[4.267,-51.49,4.25],[5.746,-65.74,4.34],[5.092,-57.47,4.71]],[[22.308,-60.26,2.87],[23.29,-58.24,3.99],[0.333,-64.87,4.23],[0.525,-62.96,4.37],[22.455,-64.97,4.49],[23.998,-65.58,4.5]]];
  groups.forEach(function(stars){
      var n = stars.length, pos = new Float32Array(n * 3), scl = new Float32Array(n), phs2 = new Float32Array(n), centroid = new THREE.Vector3();
      var dirs = stars.map(function (s) { return raDecDir(s[0], s[1]); });
      dirs.forEach(function (d, i) {
        pos[i * 3] = d.x * SKY_R; pos[i * 3 + 1] = d.y * SKY_R; pos[i * 3 + 2] = d.z * SKY_R;
        scl[i] = Math.max(0.55, Math.pow(1.45, 2.0 - stars[i][2])); // brighter (lower mag) → bigger
        phs2[i] = Math.random(); // per-star twinkle phase
        centroid.add(d);
      });
      centroid.normalize();
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sg.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
      sg.setAttribute('aPhase', new THREE.BufferAttribute(phs2, 1));
      var sm = new THREE.ShaderMaterial({ uniforms: { uSize: { value: 8.0 * renderer.getPixelRatio() }, uMul: { value: 1 }, uTime: { value: 0 } },
        vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      skyScene.add(new THREE.Points(sg, sm));
memorySkyStars.push(sm);
});
})();
  var galaxyLODs = []; // {pts, mat, center, maxN, refDist, baseSize, q0, axis, spin} per particle galaxy — LOD + self-rotation each frame
  var galaxyVeils = []; // dreamy pastel gas veils (Magellanic Clouds) — slow desynced opacity breathing, updated in the frame loop
  var galaxyVols = []; // raymarched volumetric nebulae — REAL gas clouds with depth/parallax, updated in the frame loop
  var VEIL_TEX_LOADER = new THREE.TextureLoader(); // texture credits: THIRD-PARTY-NOTICES.md
  var galSpinTmp = new THREE.Quaternion();
    function buildDustLaneVol(P, q0, R, v) { // volumetric ABSORPTION lane — a thin turbulent dust slab raymarched for optical depth.
      // Multiply blending: transmission exp(-tau·k) with wavelength-biased k → edges redden to warm brown, exactly like real dust.
      var frag =
        'uniform vec3 uCenter; uniform float uR; uniform float uGain; uniform float uTime; uniform mat3 uBasis; varying vec3 vWorld;' +
        'float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }' +
        'float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);' +
        ' float a = h3(i), b = h3(i + vec3(1,0,0)), c = h3(i + vec3(0,1,0)), d = h3(i + vec3(1,1,0));' +
        ' float e = h3(i + vec3(0,0,1)), g = h3(i + vec3(1,0,1)), h = h3(i + vec3(0,1,1)), k = h3(i + vec3(1,1,1));' +
        ' return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z); }' +
        'float fbm3(vec3 p){ float s = 0.0, a = 0.55, q = 1.0; for (int o = 0; o < 3; o++){ s += a * vn3(p * q); a *= 0.5; q *= 2.15; } return s; }' +
        'void main(){' +
        ' vec3 rd = normalize(vWorld - cameraPosition); vec3 oc = cameraPosition - uCenter;' +
        ' float RR = uR * 1.35; float b = dot(oc, rd); float c = dot(oc, oc) - RR * RR; float hh = b * b - c;' +
        ' if (hh < 0.0) discard; float sh = sqrt(hh); float t0 = max(-b - sh, 0.0), t1 = -b + sh; if (t1 <= t0) discard;' +
        ' float dj = h3(vec3(gl_FragCoord.xy * 0.37, 3.1)); float seg = (t1 - t0) / 18.0; float tau = 0.0;' +
        ' for (int i = 0; i < 18; i++){' +
        '  vec3 p = cameraPosition + rd * (t0 + seg * (float(i) + dj));' +
        '  vec3 q = uBasis * (p - uCenter) / uR;' +
        '  float bz = q.z - 0.10 * sin(q.x * 3.1);' +                       // the lane's S-warp
        '  float slab = smoothstep(0.26, 0.07, abs(bz)) * smoothstep(0.13, 0.03, abs(q.y)) * smoothstep(1.25, 0.7, length(vec2(q.x, bz * 1.6)));' +
        '  if (slab < 0.004) continue;' +
        '  vec3 w = q * vec3(2.0, 5.5, 4.0) + uTime * vec3(0.008, 0.004, 0.006);' +
        '  float n = fbm3(w + 1.6 * vec3(fbm3(w * 0.9 + 4.1), fbm3(w * 0.9 - 2.3), fbm3(w * 0.9 + 7.9)));' +
        '  tau += slab * max(0.0, n - 0.33) * 2.6 * seg;' +                 // torn, clumpy optical depth
        ' }' +
        ' if (tau < 0.004) discard;' +
        ' vec3 T = exp(-tau * uGain * vec3(1.35, 1.95, 2.55) / uR);' +      // blue absorbed most → warm brown rims (interstellar reddening)
        ' gl_FragColor = vec4(T, 1.0); }';
      var basis = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q0.clone().invert()));
      var vmat = new THREE.ShaderMaterial({
        uniforms: { uCenter: { value: P.clone() }, uR: { value: R }, uGain: { value: (v.gain || 1.0) * 13.0 }, uTime: { value: 0 }, uBasis: { value: basis } },
        vertexShader: 'varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: frag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.MultiplyBlending
      });
      var vmesh = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.8, R * 2.8), vmat);
      vmesh.position.copy(P); vmesh.renderOrder = 7; scene.add(vmesh); // multiplies AFTER the galaxy's additive layers
      galaxyVols.push({ mesh: vmesh, mat: vmat }); // same per-frame care: face camera, slow churn, watchdog gate
    }
    function buildVolumeNebula(P, q0, R, v) { // TRUE volumetric gas — raymarched 3D noise density, real depth + parallax while orbiting
      var frag =
        'uniform vec3 uCenter; uniform float uR; uniform float uFlat; uniform vec3 uHot; uniform float uHotW; uniform float uSoft;' +
        'uniform float uGain; uniform float uTime; uniform mat3 uBasis; uniform vec3 uColA; uniform vec3 uColB; varying vec3 vWorld;' +
        'float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }' +
        'float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);' +
        ' float a = h3(i), b = h3(i + vec3(1,0,0)), c = h3(i + vec3(0,1,0)), d = h3(i + vec3(1,1,0));' +
        ' float e = h3(i + vec3(0,0,1)), g = h3(i + vec3(1,0,1)), h = h3(i + vec3(0,1,1)), k = h3(i + vec3(1,1,1));' +
        ' return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z); }' +
        'float fbm3(vec3 p){ float s = 0.0, a = 0.55, q = 1.0; for (int o = 0; o < 3; o++){ s += a * vn3(p * q); a *= 0.5; q *= 2.15; } return s; }' +
        'void main(){' +
        ' vec3 rd = normalize(vWorld - cameraPosition); vec3 oc = cameraPosition - uCenter;' +
        ' float RR = uR * 1.15; float b = dot(oc, rd); float c = dot(oc, oc) - RR * RR; float hh = b * b - c;' +
        ' if (hh < 0.0) discard; float sh = sqrt(hh); float t0 = max(-b - sh, 0.0), t1 = -b + sh; if (t1 <= t0) discard;' +
        ' float dj = h3(vec3(gl_FragCoord.xy * 0.37, 1.7)); float seg = (t1 - t0) / 26.0; vec3 col = vec3(0.0);' +
        ' for (int i = 0; i < 26; i++){' +
        '  vec3 p = cameraPosition + rd * (t0 + seg * (float(i) + dj));' +
        '  vec3 q = uBasis * (p - uCenter) / uR; vec3 qf = vec3(q.x, q.y * uFlat, q.z);' +
        '  float body = smoothstep(1.05, 0.2, length(qf));' +
        '  if (body < 0.003) continue;' +
        '  vec3 w = q * 1.35 + uTime * vec3(0.010, 0.006, 0.008);' +
        '  vec3 warp = vec3(fbm3(w + 5.2), fbm3(w - 3.1), fbm3(w + 9.7));' +
        '  float n = fbm3(q * 2.7 + 1.9 * warp);' +
        '  float d = mix(max(0.0, n - 0.44) * 2.7, 0.28 + 0.5 * n, uSoft) * body;' +
        '  if (d <= 0.0) continue;' +
        '  float cn = fbm3(q * 1.15 + vec3(8.3, 2.1, 5.7) + uTime * vec3(0.004, 0.003, 0.005));' +
        '  vec3 tint = mix(uColA, uColB, smoothstep(0.30, 0.70, cn));' + // warm heart → cyan-blue rim
        '  float hw = uHotW * exp(-dot(q - uHot, q - uHot) * 7.0);' +
        '  tint = mix(tint, vec3(1.0, 0.5, 0.68), clamp(hw, 0.0, 0.85)); d *= 1.0 + hw * 1.6;' + // rose boost wrapping 30 Dor
        '  col += d * (0.35 + d * 1.2) * tint * seg;' +
        ' }' +
        ' col *= uGain / uR; col *= 0.94 + 0.12 * dj; if (max(col.r, max(col.g, col.b)) < 0.004) discard;' +
        ' gl_FragColor = vec4(col, 1.0); }';
      var basis = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q0.clone().invert()));
      var vmat = new THREE.ShaderMaterial({
        uniforms: { uCenter: { value: P.clone() }, uR: { value: R }, uFlat: { value: v.flat || 2.4 },
          uHot: { value: new THREE.Vector3().fromArray(v.hot || [0, 0, 0]).divideScalar(R) }, uHotW: { value: v.hot ? 1.0 : 0.0 }, uSoft: { value: v.soft || 0 },
          uGain: { value: v.gain || 1.0 }, uTime: { value: 0 }, uBasis: { value: basis },
          uColA: { value: new THREE.Color(v.colA != null ? v.colA : 0x76b6d8) }, uColB: { value: new THREE.Color(v.colB != null ? v.colB : 0xe887ae) } },
        vertexShader: 'varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: frag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
      });
      var vmesh = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.4, R * 2.4), vmat); // camera-facing proxy quad; the shader marches the real ellipsoid behind it
      vmesh.position.copy(P); vmesh.renderOrder = 6; scene.add(vmesh);
      galaxyVols.push({ mesh: vmesh, mat: vmat });
    }
    function buildGalaxyStars(P, o) {
      var TAU = 6.28318530718, N = Math.max(600, (o.count || 12000) | 0); // full LOD count; per-frame drawRange trims by distance
      var R = o.radius || 120, kind = o.kind || 'spiral';
      var mix = new THREE.Color();
      var pos = new Float32Array(N * 3), scl = new Float32Array(N), colA = new Float32Array(N * 3);
      function grand() { return Math.random() + Math.random() + Math.random() - 1.5; }
      var i;
      if (kind === 'ellipsoid') {                 // giant elliptical: old-star ellipsoid, concentrated core (+ optional dust lane)
        var ell = o.ell != null ? o.ell : 0.82, dustBand = o.dustBand;
        for (i = 0; i < N; i++) {
          if (dustBand && i < N * 0.055) { // young stars strung along the warped lane — the merger's starburst (pink HII + blue clusters + warm knots)
            var lx = (Math.random() * 2 - 1) * R * 0.8;
            pos[i * 3] = lx; pos[i * 3 + 1] = grand() * R * 0.05;
            pos[i * 3 + 2] = grand() * R * 0.06 + Math.sin(lx / R * 1.63) * R * 0.12; // same S-warp as the lane sheet
            var lc = Math.random();
            mix.setHex(lc < 0.5 ? 0xff6aa0 : (lc < 0.85 ? 0x9fd0ff : 0xffd9a8)).multiplyScalar(0.9);
            scl[i] = 0.8 + Math.random() * 0.9;
            colA[i * 3] = mix.r; colA[i * 3 + 1] = mix.g; colA[i * 3 + 2] = mix.b;
            continue;
          }
          var u = Math.random() * 2 - 1, ph = Math.random() * TAU, s = Math.sqrt(1 - u * u), t = Math.pow(Math.random(), 2.3);
          var px = s * Math.cos(ph) * t * R, py = u * t * R * ell, pz = s * Math.sin(ph) * t * R;
          pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz;
          mix.setRGB(1.0, 0.92 - 0.05 * t, 0.8 - 0.09 * t).multiplyScalar(0.5 * (0.5 + 0.5 * (1 - t))); // pale fine unresolved-star mist (photo look), not discrete gold specks
          scl[i] = 0.24 + Math.random() * 0.5;
          if (Math.random() < 0.012) { mix.setHex(0xffe4a8).multiplyScalar(0.7); scl[i] = 0.7 + Math.random() * 0.5; } // sparse dim giants
          colA[i * 3] = mix.r; colA[i * 3 + 1] = mix.g; colA[i * 3 + 2] = mix.b;
        }
      } else if (kind === 'irregular') {          // Magellanic: lopsided clumpy blobs, blue young stars + pink HII
        var NC2 = Math.max(8, Math.round(N / 220)), clus = [];
        for (var c2 = 0; c2 < NC2; c2++) clus.push({ x: grand() * R * 0.5 + (o.offx || 0.12) * R, y: grand() * R * 0.16, z: grand() * R * 0.5 + (o.offz || -0.05) * R, sz: R * 0.05 + Math.random() * Math.random() * R * 0.22 });
        for (i = 0; i < N; i++) {
          if (o.bar && Math.random() < o.bar) { // warm elongated stellar bar — the Magellanic signature feature
            var bt2 = Math.random() * 2 - 1, bAng = o.barAng || 0, bL = R * 0.52, bW = R * 0.13;
            var bx = bt2 * bL + grand() * bW, bz = grand() * bW;
            pos[i * 3] = Math.cos(bAng) * bx - Math.sin(bAng) * bz + (o.offx || 0.12) * R * 0.5;
            pos[i * 3 + 1] = grand() * bW * 0.5;
            pos[i * 3 + 2] = Math.sin(bAng) * bx + Math.cos(bAng) * bz + (o.offz || -0.05) * R * 0.5;
            mix.setRGB(1.0, 0.86 - 0.1 * Math.abs(bt2), 0.66 - 0.14 * Math.abs(bt2)).multiplyScalar(0.5); // old warm stars, dimmer at the tips
            scl[i] = 0.35 + Math.random() * 0.65;
            colA[i * 3] = mix.r; colA[i * 3 + 1] = mix.g; colA[i * 3 + 2] = mix.b;
            continue;
          }
          var k2 = clus[(Math.random() * NC2) | 0];
          pos[i * 3] = k2.x + grand() * k2.sz; pos[i * 3 + 1] = k2.y + grand() * k2.sz * 0.6; pos[i * 3 + 2] = k2.z + grand() * k2.sz;
          var bl = Math.random();
          mix.setRGB(0.72 + 0.2 * bl, 0.8 + 0.12 * bl, 1.0).multiplyScalar(0.42);
          scl[i] = 0.35 + Math.random() * 0.7;
          var kn2 = Math.random();
          if (kn2 < 0.06) { mix.setHex(0xdbeaff).multiplyScalar(1.1); scl[i] = 0.9 + Math.random() * 0.8; }      // blue star-forming knots
          else if (kn2 < 0.075 && !o.small) { mix.setHex(0xff6aa0).multiplyScalar(1.0); scl[i] = 0.8 + Math.random() * 0.6; } // pink HII (Tarantula)
          else if (kn2 < 0.095) { mix.setHex(kn2 < 0.082 ? 0xffd9a8 : (kn2 < 0.089 ? 0xa8ece0 : 0xd9c4ff)).multiplyScalar(0.95); scl[i] = 1.0 + Math.random() * 0.8; } // pastel sprinkle — peach-gold / aqua / lilac sugar grains
          colA[i * 3] = mix.r; colA[i * 3 + 1] = mix.g; colA[i * 3 + 2] = mix.b;
        }
      } else {                                    // spiral: log-spiral arms + clustered star knots (like the Milky Way)
        var arms = o.arms || 2, tight = o.tight != null ? o.tight : 0.9, thick = R * 0.06, ck = o.clumpK || 1, armW = R * 0.11 * ck, jit = o.armJitter != null ? o.armJitter : 1, radPow = 0.72;
        var inside = new THREE.Color(o.inside || 0xffcf8a), outside = new THREE.Color(o.outside || 0x9fc3f2);
        function pickArm(r) { var idx = (Math.random() < 0.7) ? Math.floor(Math.random() * (arms / 2)) * 2 : Math.floor(Math.random() * (arms / 2)) * 2 + 1, maj = (idx % 2 === 0); return { maj: maj, ang: idx * (TAU / arms) + r * tight * TAU + (Math.random() - 0.5) * 0.5 * jit * (maj ? 1 : 1.25) }; }
        var NC = Math.max(12, Math.round(N / (o.clumps || 200))), clusters = []; // more, smaller clusters → finer arm lanes
        for (var c = 0; c < NC; c++) { var crf = Math.pow(Math.random(), radPow), cp = pickArm(crf), cR = crf * R + (Math.random() - 0.5) * armW;
          clusters.push({ x: Math.cos(cp.ang) * cR, z: Math.sin(cp.ang) * cR, rf: crf, maj: cp.maj, sz: (R * 0.016 + Math.random() * Math.random() * R * 0.1) * ck }); }
        for (i = 0; i < N; i++) {
          if (o.bulge && Math.random() < o.bulge) { // spheroidal old-star bulge population — the Sombrero's "crown" enveloping the thin disc
            var bu = Math.random() * 2 - 1, bph = Math.random() * TAU, bs = Math.sqrt(1 - bu * bu), bt = Math.pow(Math.random(), 2.0), bR = (o.bulgeR || 0.34) * R;
            pos[i * 3] = bs * Math.cos(bph) * bt * bR; pos[i * 3 + 1] = bu * bt * bR * 0.75; pos[i * 3 + 2] = bs * Math.sin(bph) * bt * bR;
            mix.setRGB(1.0, 0.94 - 0.04 * bt, 0.84 - 0.08 * bt).multiplyScalar(0.3 * (0.5 + 0.5 * (1 - bt))); // pale + dim + tiny: unresolved-star mist (photo look), not discrete yellow specks
            scl[i] = 0.18 + Math.random() * 0.35;
            colA[i * 3] = mix.r; colA[i * 3 + 1] = mix.g; colA[i * 3 + 2] = mix.b;
            continue;
          }
          var rf, major;
          if (Math.random() < (o.smooth ? 0.55 : 0.8)) { var k = clusters[(Math.random() * NC) | 0]; rf = k.rf; major = k.maj;
            pos[i * 3] = k.x + grand() * k.sz; pos[i * 3 + 2] = k.z + grand() * k.sz; pos[i * 3 + 1] = grand() * thick * ((1 - rf) + 0.2) * 0.45; }
          else { rf = Math.pow(Math.random(), radPow); var fp = pickArm(rf), offR = rf * R + (Math.random() - 0.5) * armW; major = fp.maj;
            pos[i * 3] = Math.cos(fp.ang) * offR; pos[i * 3 + 2] = Math.sin(fp.ang) * offR; pos[i * 3 + 1] = (Math.random() - 0.5) * thick * ((1 - rf) + 0.2); }
          mix.copy(inside).lerp(outside, Math.min(1, Math.max(0, (rf - (o.warm != null ? o.warm : 0.12)) * (o.warmK || 3.0)))).multiplyScalar(0.5 * (major ? 1 : 0.72) * (1 - 0.4 * Math.min(1, Math.max(0, (rf - 0.78) * 4.5)))); // warm = where the golden inner disc gives way to blue arms
          scl[i] = (0.3 + Math.random() * 0.9) * (major ? 1 : 0.82);
          var kn = Math.random(), kf = o.smooth ? 0.25 : 1; // smooth discs (Sombrero) get far fewer bright knots
          if (o.hii && rf > 0.15 && Math.random() < o.hii) { mix.setHex(0xff6aa0).multiplyScalar(1.05); scl[i] = 0.9 + Math.random() * 0.7; } // pink HII regions sprinkled through the disc (M33)
          else if (kn < 0.004 * kf) { mix.setHex(0xffd45a).multiplyScalar(1.3); scl[i] = 1.4 + Math.random(); }
          else if (major && rf > 0.28 && kn < 0.03 * kf) { var cr = Math.random(), col = cr < 0.6 ? 0xff6a3a : (cr < 0.8 ? 0xcfe6ff : 0x6a9cff); mix.setHex(col).multiplyScalar(1.15); scl[i] = 1.1 + Math.random() * 0.8; }
          else if (major && rf > 0.28 && kn < 0.12 * kf) { mix.setHex(0xcfe6ff).multiplyScalar(1.0); scl[i] = 0.9 + Math.random() * 0.7; }
          colA[i * 3] = mix.r; colA[i * 3 + 1] = mix.g; colA[i * 3 + 2] = mix.b;
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(colA, 3));
      g.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
      if (o.photo) (function (gg, NN) { // repaint the cloud from a real photograph once it loads: positions importance-sampled by brightness, colors straight from the pixels — crisp at ANY zoom, unlike a billboard
        var im = new Image();
        im.onload = function () {
          var PS = 256, pc = document.createElement('canvas'); pc.width = pc.height = PS;
          var px = pc.getContext('2d'); px.drawImage(im, 0, 0, PS, PS);
          var idata = px.getImageData(0, 0, PS, PS).data;
          var span = o.photo.span || R * 2, thick = o.photo.thick || R * 0.07;
          var pa = gg.getAttribute('position'), ca = gg.getAttribute('aColor'), sa = gg.getAttribute('aScale');
          var placed = 0, guard = 0;
          while (placed < NN && guard++ < NN * 80) {
            var u = Math.random(), v = Math.random();
            var i4 = (((v * PS) | 0) * PS + ((u * PS) | 0)) * 4;
            var lum = (idata[i4] + idata[i4 + 1] + idata[i4 + 2]) / 765;
            if (Math.random() > Math.pow(lum, 2.2) + 0.002) continue;    // steep weighting: structure wins the particles, the flat star-field mostly loses
            var j = placed * 3;
            pa.array[j] = (u - 0.5) * span; pa.array[j + 1] = grand() * thick; pa.array[j + 2] = (v - 0.5) * span;
            var bb = 0.6 + Math.random() * 0.35;
            var cr = idata[i4] / 255, cg = idata[i4 + 1] / 255, cb2 = idata[i4 + 2] / 255, cl = (cr + cg + cb2) / 3;
            var csat = Math.max(cr, cg, cb2) - Math.min(cr, cg, cb2);
            if (csat < (o.photo.palette != null ? o.photo.palette : 0.07)) { // near-colourless = star (small pin) → stellar palette
              var pst = Math.random(), st;
              if (o.photo.oldPop) st = pst < 0.35 ? [1.0, 0.94, 0.82] : (pst < 0.6 ? [1.0, 0.85, 0.55] : (pst < 0.75 ? [1.0, 0.6, 0.4] : (pst < 0.9 ? [0.85, 0.9, 1.0] : [0.65, 0.78, 1.0]))); // old elliptical population: warm white / yellow / orange-red, a few merger-born blues
              else st = pst < 0.5 ? [0.88, 0.93, 1.0] : (pst < 0.8 ? [0.6, 0.75, 1.0] : (pst < 0.9 ? [1.0, 0.87, 0.58] : [1.0, 0.5, 0.4])); // young irregular: 50% blue-white / 30% blue / 10% yellow / 10% red
              ca.array[j] = st[0] * bb; ca.array[j + 1] = st[1] * bb; ca.array[j + 2] = st[2] * bb;
              sa.array[placed] = 0.25 + Math.random() * 0.45;
            } else {
              ca.array[j] = Math.max(0, cl + (cr - cl) * 1.6) * bb; ca.array[j + 1] = Math.max(0, cl + (cg - cl) * 1.6) * bb; ca.array[j + 2] = Math.max(0, cl + (cb2 - cl) * 1.6) * bb; // saturation push — keep the photo's warm bar / pink HII / blue clusters from washing to white
              if (cr > cg && cr > cb2 && Math.random() < 0.18) { ca.array[j] = 1.0 * bb; ca.array[j + 1] = 0.42 * bb; ca.array[j + 2] = 0.36 * bb; sa.array[placed] = 0.9 + Math.random() * 0.7; } // red-leaning gas pixel → a ruby star decorating the red cloud
              else sa.array[placed] = (lum > 0.6 && Math.random() < 0.08) ? 1.5 + Math.random() : 0.5 + Math.random() * 1.0; // colourful = nebular knot (fat glow), sparse bright ones sparkle
            }
            placed++;
          }
          pa.needsUpdate = ca.needsUpdate = sa.needsUpdate = true;
        };
        im.src = o.photo.src;
      })(g, N);
      var gmat = new THREE.ShaderMaterial({
        uniforms: { uSize: { value: (o.pointSize || 1.9) * renderer.getPixelRatio() }, uCap: { value: 34 * renderer.getPixelRatio() } },
        vertexShader: 'uniform float uSize; uniform float uCap; attribute float aScale; attribute vec3 aColor; varying vec3 vColor;' +
          'void main(){ vec4 mp = modelMatrix * vec4(position,1.0); vec4 vp = viewMatrix * mp; gl_Position = projectionMatrix * vp;' +
          ' gl_PointSize = min(uSize * aScale * (300.0 / -vp.z), uCap); vColor = aColor; }', // cap: a close fly-by magnifies stars into crisp points, not screen-filling cotton
        fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      var pts = new THREE.Points(g, gmat);
      pts.frustumCulled = false;
      // orient the disc: its normal sits `inc` radians off the viewer's line of sight, plus a roll
      var viewDir = P.clone().negate().normalize();
      var perp = new THREE.Vector3().crossVectors(viewDir, new THREE.Vector3(0, 1, 0));
      if (perp.lengthSq() < 1e-4) perp.set(1, 0, 0);
      perp.normalize();
      var nrm = viewDir.clone().applyAxisAngle(perp, o.inc != null ? o.inc : 0.9);
      var q0 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
      q0.premultiply(new THREE.Quaternion().setFromAxisAngle(nrm, o.roll || 0));
      pts.position.copy(P); pts.quaternion.copy(q0); scene.add(pts);
      galaxyLODs.push({ pts: pts, mat: gmat, center: P.clone(), maxN: N, refDist: R * 3, baseSize: (o.pointSize || 1.9),
        q0: q0, axis: nrm.clone(), spin: (o.spin != null ? o.spin : 0.018) }); // per-frame LOD + slow self-rotation about the disc axis
      // bulge = a bright compact nucleus + a faint extended warm halo (avoids a solid grey ball)
      function bulge(sz, op, hex) { var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: BULGE_TEX, color: new THREE.Color(hex), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.copy(P); s.scale.set(sz, sz, 1); scene.add(s); }
      bulge(R * (o.haloSize || 0.62), o.haloOpacity || 0.16, o.halo || 0xffcf8a); // soft outer bulge glow
      bulge(R * (o.coreSize || 0.2), o.coreOpacity || 0.9, o.core || 0xfff1dc);   // bright nucleus
      if (o.halo2Size) bulge(R * o.halo2Size, o.halo2Opacity || 0.07, o.halo2 || 0xfdf6ea); // extra faint extended envelope — stacked gaussians ≈ smooth edgeless falloff (Sombrero)
      if (o.nucleusSize) { bulge(R * o.nucleusSize * 1.9, 0.9, o.nucleus || 0xfffdf6); bulge(R * o.nucleusSize, 1.0, 0xffffff); } // a single blazing nucleus body — outshines the particle grain at the very centre
      var lodRef = galaxyLODs[galaxyLODs.length - 1];
      if (o.veils) for (var vi = 0; vi < o.veils.length; vi++) { // dreamy pastel gas veils — large faint additive blobs; depth comes from stacking thin layers, never one dense one
        var V = o.veils[vi];
        var vmap = V.img != null ? VEIL_TEX_LOADER.load(V.img) : (V.wisp != null ? wispTexture(V.wisp) : BULGE_TEX); // real-photo plate > procedural strands > smooth glow
        var vsp = new THREE.Sprite(new THREE.SpriteMaterial({ map: vmap, color: new THREE.Color(V.hex), transparent: true, opacity: V.op, rotation: V.rot || 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        vsp.position.set(V.x || 0, V.y || 0, V.z || 0); vsp.scale.set(V.sz, V.sz * (V.flat || 1), 1); // flat<1 squashes the blob into a lens — reads as a disc, not a ball
        pts.add(vsp); // child of the particle cloud — co-rotates, stays glued to the bar and the in-galaxy LOD features (same frame as kid-beacon lp)
        galaxyVeils.push({ mat: vsp.material, o: V.op, T: V.T || 18, ph: vi * 2.6, r0: V.rot || 0, dr: V.drift || 0, amp: V.amp != null ? V.amp : 0.3, lod: lodRef, hn: V.hideNear ? [R * 1.4, R * 2.4] : null }); // drift: filaments crawl imperceptibly; amp: photo plates breathe gently
      }
      if (o.vol) buildVolumeNebula(P, q0, R, o.vol); // the real gas — raymarched volume sharing this disc's orientation
      if (o.dustVol) buildDustLaneVol(P, q0, R, o.dustVol); // volumetric absorption lane — thickness + torn edges from any angle
      if (o.dustBand && !o.dustVol) { // flat dark lane sheet (Sombrero ring etc.) — superseded by the volumetric slab when dustVol is set
        var ringLane = o.dustBand === 'ring'; // 'ring' = Sombrero-style dust-torus rim; true = centred dark sheet (Cen A)
        var dl = document.createElement('canvas'); dl.width = dl.height = 128; var dcx = dl.getContext('2d');
        if (ringLane) {
          var rg = dcx.createRadialGradient(64, 64, 24, 64, 64, 64);          // bold wide dark annulus hugging the disc rim (the Sombrero brim)
          rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.34, 'rgba(0,0,0,0.75)'); rg.addColorStop(0.52, 'rgba(0,0,0,1)'); rg.addColorStop(0.72, 'rgba(0,0,0,1)'); rg.addColorStop(0.9, 'rgba(0,0,0,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
          dcx.fillStyle = rg; dcx.fillRect(0, 0, 128, 128);
          var fade = dcx.createLinearGradient(0, 64, 0, 98);                  // keep only the NEAR half — the far rim hides behind the bulge
          fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
          dcx.globalCompositeOperation = 'destination-out'; dcx.fillStyle = fade; dcx.fillRect(0, 0, 128, 128);
          dcx.globalCompositeOperation = 'source-over';
        } else { // Cen A: ABSORPTION sheet (multiply blending) — white transmits, warm dark brown absorbs.
          // Over the bright bulge it reads as the photo's reddish-brown dust band; over black sky it stays invisible.
          var img2 = dcx.createImageData(128, 128), dd = img2.data;
          for (var qy = 0; qy < 128; qy++) for (var qx = 0; qx < 128; qx++) {
            var ddx = (qx + 0.5) / 64 - 1, ddy = ((qy + 0.5) / 64 - 1) * 2.3 + Math.sin(ddx * 2.6) * 0.30, rr2 = Math.sqrt(ddx * ddx + ddy * ddy); // wider band, S-warped like the merger wreckage
            var aa = rr2 >= 0.85 ? 0 : (rr2 < 0.45 ? (0.92 - 0.1 * (rr2 / 0.45)) : 0.8 * (1 - (rr2 - 0.45) / 0.4)); var ef = aa > 0.05 && aa < 0.5 ? Math.max(0, 0.5 - Math.abs(aa - 0.275) * 1.8) : 0; // narrow dense band → feathered rim (photo: band ≈ 1/5 of the diameter)
            var o8 = (qy * 128 + qx) * 4;
            dd[o8] = Math.min(255, Math.round(255 - aa * 211 + ef * 26)); dd[o8 + 1] = Math.min(255, Math.round(255 - aa * 229 + ef * 6)); dd[o8 + 2] = Math.round(255 - aa * 237); dd[o8 + 3] = 255; // → transmission toward rgb(44,26,18)
          }
          dcx.putImageData(img2, 0, 0);
        }
        var laneTex = new THREE.CanvasTexture(dl);
        laneTex.generateMipmaps = false; laneTex.minFilter = THREE.LinearFilter; // deep mips average band+clear into a grey sheet → a fake dark rectangle at distance
        var lane = new THREE.Mesh(new THREE.PlaneGeometry(ringLane ? R * 2.6 : R * 3.2, ringLane ? R * 2.6 : R * 1.9),
          new THREE.MeshBasicMaterial({ map: laneTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: ringLane ? THREE.NormalBlending : THREE.MultiplyBlending })); // DoubleSide: show from below too. fog:false is CRITICAL — scene fog blackens the distant quad, and multiply-by-black erased everything behind it (the "black rectangle")
        lane.quaternion.copy(q0).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)); // lie in the disc plane, aligned with the disc's long axis
        if (ringLane) { // spin the dark half-ring around the disc axis so it faces the viewer (the lane does not co-rotate, so this stays correct)
          var dN = viewDir.clone().sub(nrm.clone().multiplyScalar(viewDir.dot(nrm))).normalize();
          var w0 = new THREE.Vector3(0, 1, 0).applyQuaternion(lane.quaternion); // texture-up in world
          var beta = Math.atan2(new THREE.Vector3().crossVectors(w0, dN).dot(nrm), w0.dot(dN));
          lane.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(nrm, beta));
        }
        lane.position.copy(P); lane.renderOrder = 6; lane.frustumCulled = false; scene.add(lane);
      }
    }
var defaultBackground = [{"position":[-1364.8992544384137,-514.8080282928805,-327.61786934388084],"stars":{"count":26000,"radius":132,"arms":2,"tight":0.9,"inc":1.3,"roll":0.6,"warm":0.32,"warmK":2.2}},{"position":[-1048.992756987689,-629.959333792911,-516.1480125966195],"stars":{"count":24000,"radius":108,"arms":2,"tight":0.72,"inc":0.78,"roll":2.2,"warm":0.04,"warmK":4,"hii":0.03,"haloSize":0.5,"haloOpacity":0.1,"coreSize":0.14,"coreOpacity":0.6}},{"position":[769.6980481525386,1051.3676519149105,-101.06862208038962],"stars":{"kind":"spiral","count":48000,"radius":106,"arms":4,"tight":2.1,"clumps":90,"clumpK":0.6,"armJitter":0.6,"inc":1.45,"roll":1,"bulge":0.28,"bulgeR":0.42,"outside":12374252,"dustBand":"ring","haloSize":0.8,"haloOpacity":0.2,"halo":16642526,"halo2Size":1.4,"halo2Opacity":0.07,"halo2":16643818,"coreSize":0.28,"coreOpacity":0.85,"core":16775404,"nucleusSize":0.09}},{"position":[299.05932752100347,1367.5477729186205,-234.74999297176822],"stars":{"kind":"ellipsoid","count":28000,"radius":132,"ell":0.82,"inc":0.3,"haloSize":1,"haloOpacity":0.26,"halo":16768160,"coreSize":0.3,"coreOpacity":0.7,"core":16772811,"nucleusSize":0.08}},{"position":[963.232258512109,379.8062940867896,121.54488441231973],"stars":{"kind":"ellipsoid","count":6000,"radius":120,"ell":0.9,"dustBand":true,"inc":1.25,"roll":0.3,"haloSize":1.1,"haloOpacity":0.05,"halo":15785924,"coreSize":0.22,"coreOpacity":0.35,"spin":0,"dustVol":{"gain":1},"photo":{"src":"images/background-1.png","span":270,"thick":26,"palette":0.16,"oldPop":true},"veils":[{"sz":18,"hex":16773340,"op":0.5,"T":6},{"sz":7,"hex":16777215,"op":0.8,"T":6}]}},{"position":[801.7904050703248,-582.7107084711521,-377.69883790790635],"stars":{"kind":"irregular","count":15000,"radius":122,"inc":0.3,"offx":0.14,"offz":-0.05,"bar":0.32,"barAng":0.35,"haloSize":0.5,"haloOpacity":0.03,"coreOpacity":0,"photo":{"src":"images/background-2.png","span":250,"thick":9},"veils":[{"x":-23,"y":3,"z":-23,"sz":20,"hex":16769262,"op":0.28,"T":8}],"vol":{"flat":2.4,"hot":[-23,3,-23],"gain":1.5,"colA":7780056,"colB":15239086}}},{"position":[830.710875762043,-894.9886353720301,-26.538183890006223],"stars":{"kind":"irregular","count":8000,"radius":86,"small":true,"inc":0.3,"offx":0.1,"offz":0.06,"bar":0.28,"barAng":1.1,"haloSize":0.45,"haloOpacity":0.02,"coreOpacity":0,"photo":{"src":"images/background-3.png","span":175,"thick":7},"veils":[],"vol":{"flat":2.2,"gain":1.15,"colA":9423080,"colB":10325984}}}];
defaultBackground.forEach(function(item){buildGalaxyStars(new THREE.Vector3().fromArray(item.position),item.stars);});
window.GX = {buildGalaxyStars:buildGalaxyStars, galaxyLODs:galaxyLODs};

/* Original decorative motion and distant galaxy field; no object labels. */
  var fxGroup = new THREE.Group(); galaxyRoot.add(fxGroup); // FX ride the galaxy rotation
  var fxList = [];
  // shooting stars — spawned INSIDE the current camera frustum. Uniform sky spawning
  // left 99.7% of meteors outside the 55° view (measured), which is why nobody ever
  // saw one. We pick a random on-screen NDC point, unproject it onto the far sky,
  // and derive the flight path from a second NDC point — the streak is GUARANTEED
  // to cross what the operator is looking at. A glowing head sprite rides the line.
  // Optional (ndc, t0, dndc) let a meteor SHOWER share a radiant + screen direction
  // and stagger start times (future t0s stay dormant via the k<0 guard in updateFx).
  var meteorNext = videoNow() + 12000 + Math.random() * 20000;
  var novaNext = videoNow() + 90000 + Math.random() * 120000;   // first supernova within 1.5–3.5min, then every 6–12min
  function skyPointInView(nx, ny, r) { // NDC (x,y) → a point r units from the camera along that view ray
    var v = new THREE.Vector3(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(v, r);
  }
  // fireball streak texture (ref photo): white-gold head with a bloom, long orange
  // tail that TAPERS in width and fades in brightness — per-pixel, perfectly smooth.
  // (The old 1px uniform line + dot head read as 'a pin flying past'.)
  function meteorTexture() {
    var W2 = 256, H2 = 64, c = document.createElement('canvas'); c.width = W2; c.height = H2;
    var x = c.getContext('2d'), img = x.createImageData(W2, H2), d = img.data;
    for (var py = 0; py < H2; py++) {
      for (var px = 0; px < W2; px++) {
        var u = px / (W2 - 1);                            // 0 = tail end → 1 = head
        var v = (py - (H2 - 1) / 2) / ((H2 - 1) / 2);     // -1..1 across
        var wHalf = 0.12 + 0.5 * Math.pow(u, 1.6);        // tail thin → head wide
        var a = Math.pow(u, 2) * Math.exp(-(v * v) / (wHalf * wHalf * 0.5));
        var duh = (u - 0.93) / 0.05, hv = v / 0.55;
        a += Math.exp(-(duh * duh + hv * hv));            // head bloom
        if (a > 1) a = 1;
        var i = (py * W2 + px) * 4;
        if (a > 0.004) {
          var t3 = Math.min(1, Math.pow(u, 2) * 1.6);     // deep orange tail → white-gold head
          d[i] = 255;
          d[i + 1] = Math.round(120 + 130 * t3);
          d[i + 2] = Math.round(40 + 190 * t3);
          d[i + 3] = Math.round(a * 255);
        }
      }
    }
    x.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }
  var METEOR_TEX = meteorTexture(), METEOR_GEO = new THREE.PlaneGeometry(1, 1); // shared
  function spawnMeteor(ndc, t0Opt, dndc) {
    var nx = ndc ? ndc[0] : Math.random() * 1.5 - 0.75, ny = ndc ? ndc[1] : Math.random() * 1.1 - 0.25;
    var dx = dndc ? dndc[0] + (Math.random() - 0.5) * 0.12 : (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
    var dy = dndc ? dndc[1] + (Math.random() - 0.5) * 0.08 : -(0.3 + Math.random() * 0.5);
    var r = 700 + Math.random() * 250;
    var from = skyPointInView(nx, ny, r), to = skyPointInView(nx + dx, ny + dy, r);
    var dir = to.sub(from), dist = dir.length(); dir.multiplyScalar(1 / dist);
    var W3 = 2.5 + Math.random() * 1.5; // THIN — at galactic scale a meteor is a fine streak (was 7-10, read too fat)
    // ribbon basis: +X along flight, +Y across, facing the camera (computed once —
    // meteors live ~1s, the camera barely moves)
    var viewDir = from.clone().sub(camera.position).normalize();
    var side = new THREE.Vector3().crossVectors(dir, viewDir);
    if (side.lengthSq() < 1e-4) side.set(0, 1, 0); else side.normalize();
    // RIGHT-handed basis: X×Y must equal Z. (side×dir gave a det=-1 REFLECTION —
    // setFromRotationMatrix extracts garbage from those, so streaks rendered with
    // their long axis pointing away from the flight direction at many angles.)
    var normal = new THREE.Vector3().crossVectors(dir, side);
    var m = new THREE.MeshBasicMaterial({ map: METEOR_TEX, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(METEOR_GEO, m);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, side, normal));
    mesh.scale.set(0.001, W3, 1); mesh.frustumCulled = false;
    scene.add(mesh); // on the fixed sky, not galaxyRoot
    fxList.push({ kind: 'meteor', obj: mesh, mat: m, from: from, dir: dir, dist: dist, t0: t0Opt || videoNow(), dur: 1000 + Math.random() * 500 });
  }
  // supernova — three acts, like an astrophoto: ① a DIFFRACTION CROSS (four tapered
  // spikes) flashes up first, ② the round blast bursts through it, ③ a slow orange
  // afterglow fades to nothing. Spawned INSIDE the current view frustum (uniform sky
  // placement measured 0% on-screen).
  var NOVA_C = new THREE.Color(0xff7a8f), NOVA_ORANGE = new THREE.Color(0xffc07a), novaWhite = new THREE.Color(0xffffff), novaTmp = new THREE.Color(); // blue-white → white → orange → rose (cooling photosphere)
  function crossTexture() { // FOUR-POINTED STAR (ref): BRIGHTEST at the centre; each arm
    // fades with distance AND its width narrows continuously toward the tip, so the
    // arms end as faint SHARP points. Per-pixel; lateral gaussian whose sigma is
    // proportional to the remaining arm length.
    var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
    for (var py = 0; py < S; py++) {
      for (var px = 0; px < S; px++) {
        var nx = (px - 127.5) / 127.5, ny = (py - 127.5) / 127.5; // -1..1
        var vLen = Math.max(0, 1 - Math.abs(ny)), vFade = Math.pow(vLen, 1.6);
        var s1 = 0.006 + 0.03 * vLen, s2 = 0.02 + 0.08 * vLen, s3 = 0.05 + 0.14 * vLen;
        var aw = Math.exp(-(nx * nx) / (s1 * s1)) * vFade;                    // vertical core — tapers to a point
        var ap = Math.exp(-(nx * nx) / (s2 * s2)) * vFade * 0.5;              // pink sheath
        var am = Math.exp(-(nx * nx) / (s3 * s3)) * Math.pow(vLen, 2.2) * 0.18; // wide glow, centre-weighted
        var hLen = Math.max(0, 1 - Math.abs(nx)), hFade = Math.pow(hLen, 1.6);
        var t1 = 0.006 + 0.03 * hLen, t2 = 0.02 + 0.08 * hLen, t3 = 0.05 + 0.14 * hLen;
        aw += Math.exp(-(ny * ny) / (t1 * t1)) * hFade;                       // horizontal arm, same taper
        ap += Math.exp(-(ny * ny) / (t2 * t2)) * hFade * 0.5;
        am += Math.exp(-(ny * ny) / (t3 * t3)) * Math.pow(hLen, 2.2) * 0.18;
        aw += Math.exp(-(nx * nx + ny * ny) * 60) * 1.2;                      // blazing centre — brightest point of all
        var a = aw + ap + am; if (a > 1) a = 1;
        var i = (py * S + px) * 4;
        if (a > 0.003) {
          var tot = aw + ap + am;
          d[i] = 255;
          d[i + 1] = Math.round((255 * aw + 205 * ap + 170 * am) / tot);
          d[i + 2] = Math.round((255 * aw + 230 * ap + 215 * am) / tot);
          d[i + 3] = Math.round(a * 255);
        }
      }
    }
    x.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }
  var CROSS_TEX = crossTexture();
  // Real supernovae photograph as a POINT SOURCE: a blinding compact core, a
  // radiance halo with steep (near-exponential) falloff, and long thin diffraction
  // spikes — NOT an expanding flat disc (the previous hard-edged ball read as a
  // beige paper circle). Three layers reproduce that PSF look.
  function novaCoreTexture() { // brilliant compact centre, steep falloff
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.16, 'rgba(255,255,255,1)');
    gr.addColorStop(0.34, 'rgba(255,255,255,0.5)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 64, 0, 6.2832); x.fill();
    return new THREE.CanvasTexture(c);
  }
  function novaHaloTexture() { // wide radiance, near-exponential falloff — glow, not a rim
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d');
    var gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); // dense stops ≈ exponential falloff, no banding
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.12, 'rgba(255,255,255,0.62)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.38)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.21)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.11)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.05)');
    gr.addColorStop(0.85, 'rgba(255,255,255,0.018)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 64, 0, 6.2832); x.fill();
    return new THREE.CanvasTexture(c);
  }
  var NOVA_CORE_TEX = novaCoreTexture(), NOVA_HALO_TEX = novaHaloTexture();
  function smooth01(x) { x = x < 0 ? 0 : (x > 1 ? 1 : x); return x * x * (3 - 2 * x); } // smoothstep — silky ramps everywhere
  function spawnNova(options) {
    var durationMs = options && options.durationMs !== undefined ? options.durationMs : 6000;
    if (!Number.isFinite(durationMs) || durationMs < 100 || durationMs > 60000) {
      throw new Error('Supernova durationMs must be between 100 and 60000 ms');
    }
    // Spawn AWAY from the galaxy on screen (operator: keep distance — more elegant).
    // The disc projects as a flattened ELLIPSE at typical viewing angles, so an
    // isotropic radius test always fails horizontally; instead project 12 disc-rim
    // points into a screen polygon and take the first candidate OUTSIDE it with a
    // margin — falling back to the best-scoring candidate when the galaxy fills
    // the whole view.
    var rim = [], TAU2 = 6.28318530718;
    for (var ri = 0; ri < 12; ri++) {
      var rp = new THREE.Vector3(Math.cos(ri * TAU2 / 12) * 430, 0, Math.sin(ri * TAU2 / 12) * 430).project(camera);
      rim.push([rp.x, rp.y]);
    }
    function insideRim(px2, py2) { // crossing-number point-in-polygon
      var inside = false;
      for (var a = 0, b2 = 11; a < 12; b2 = a++) {
        var A = rim[a], B = rim[b2];
        if ((A[1] > py2) !== (B[1] > py2) && px2 < (B[0] - A[0]) * (py2 - A[1]) / (B[1] - A[1]) + A[0]) inside = !inside;
      }
      return inside;
    }
    function rimDist(px2, py2) { var m = 99; for (var a = 0; a < 12; a++) { var ddx = px2 - rim[a][0], ddy = py2 - rim[a][1], dd = Math.sqrt(ddx * ddx + ddy * ddy); if (dd < m) m = dd; } return m; }
    var requestedNdc = options && Array.isArray(options.ndc) ? options.ndc : null;
    var best = requestedNdc ? [requestedNdc[0], requestedNdc[1]] : [0.8, 0.8], bestScore = -1e9;
    if (!requestedNdc) {
      for (var ci = 0; ci < 16; ci++) {
        var nx = Math.random() * 1.8 - 0.9, ny = Math.random() * 1.85 - 0.9;
        var score = (insideRim(nx, ny) ? -100 : 0) + rimDist(nx, ny);
        if (score > bestScore) { bestScore = score; best = [nx, ny]; }
        if (score > 0.35) { best = [nx, ny]; break; }
      }
    }
    var p = skyPointInView(best[0], best[1], 850 + Math.random() * 300);
    var coreMat = new THREE.SpriteMaterial({ map: NOVA_CORE_TEX, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    var ball = new THREE.Sprite(coreMat); ball.scale.setScalar(1);
    var haloMat = new THREE.SpriteMaterial({ map: NOVA_HALO_TEX, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    var halo = new THREE.Sprite(haloMat); halo.scale.setScalar(1);
    var cm = new THREE.SpriteMaterial({ map: CROSS_TEX, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    var cross = new THREE.Sprite(cm); cross.scale.setScalar(1);
    var grp = new THREE.Group(); grp.add(halo); grp.add(ball); grp.add(cross); grp.position.copy(p); scene.add(grp);
    fxList.push({ kind: 'nova', obj: grp, mat: coreMat, mat2: cm, mat3: haloMat, ball: ball, halo: halo, cross: cross, t0: videoNow(), dur: durationMs });
  }
  function updateFx(nowMs) {
    if (nowMs >= meteorNext) {
      if (Math.random() < 0.06) { // occasional meteor SHOWER: 6–9 staggered from one on-screen radiant
        var mN = 6 + ((Math.random() * 4) | 0), rNdc = [Math.random() * 1.2 - 0.6, Math.random() * 0.8 - 0.1];
        var rDndc = [(Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.3), -(0.35 + Math.random() * 0.3)];
        for (var mi = 0; mi < mN; mi++) spawnMeteor([rNdc[0] + (Math.random() - 0.5) * 0.5, rNdc[1] + (Math.random() - 0.5) * 0.35], nowMs + mi * 320 + Math.random() * 240, rDndc);
      } else spawnMeteor();
      meteorNext = nowMs + 30000 + Math.random() * 30000;
    }
    if (nowMs >= novaNext) { spawnNova(); novaNext = nowMs + 360000 + Math.random() * 360000; }
    for (var i = fxList.length - 1; i >= 0; i--) {
      var f = fxList[i], k = (nowMs - f.t0) / f.dur;
      if (k >= 1) { (f.obj.parent || fxGroup).remove(f.obj); f.mat.dispose(); if (f.mat2) f.mat2.dispose(); if (f.mat3) f.mat3.dispose(); if (f.geo) f.geo.dispose(); fxList.splice(i, 1); continue; }
      if (k < 0) continue; // scheduled in the future (meteor-shower stagger) — stay dormant
      if (f.kind === 'flash') { var e = 1 - Math.pow(1 - k, 3); f.obj.scale.setScalar(0.1 + f.maxScale * e); f.mat.opacity = 0.9 * (1 - k); }
      else if (f.kind === 'burst') {
        var pa = f.geo.attributes.position.array, e2 = 1 - Math.pow(1 - k, 2);
        for (var j = 0; j < f.vel.length; j++) { pa[j * 3] = f.vel[j].x * e2; pa[j * 3 + 1] = f.vel[j].y * e2 - f.droop * e2 * e2; pa[j * 3 + 2] = f.vel[j].z * e2; }
        f.geo.attributes.position.needsUpdate = true; f.mat.opacity = 0.95 * (1 - k);
      } else if (f.kind === 'nova') {
        // PHYSICS-CORRECTED (researched against SN light curves + optical-artifact
        // behaviour): a supernova is a POINT SOURCE whose brightness rises as ~t^2.3,
        // holds a rounded peak, then declines on two slopes (steep post-peak segment,
        // then a much shallower Co-56-style tail). The halo (PSF wings) and the
        // spike/bleed pillar are INSTRUMENT ARTIFACTS that strictly track brightness
        // above thresholds — they extend in lockstep with the rise, are longest
        // exactly at peak, and RETRACT on the fade (pillar first, then halo, then the
        // core dims out). No dark beat (rises are monotonic), no expanding ball
        // (extragalactic SNe never resolve — the growing disc was the Hollywood
        // 'Praxis effect'). Colour: pale blue-white → white at peak → orange → rose.
        // Single SMOOTH light-curve envelope (gamma shape): b = C·k^2.3·e^(−k/θ) —
        // the t^2.3 accelerating rise, a rounded peak at k≈0.30 and the long
        // exponential tail all in ONE infinitely-smooth curve (the piecewise version
        // had derivative corners + a frozen plateau that read as stiff). Rebased so
        // b lands exactly on 0 at k=1 — no pop-off at removal.
        var braw = 159 * Math.pow(Math.max(k, 1e-4), 2.3) * Math.exp(-k / 0.1304);
        var b = Math.max(0, Math.min(1, (braw - 0.0741) / 0.9259));
        var blueMix = smooth01(k / 0.28);                 // pale blue-white early → white at maximum
        var warm1 = smooth01((k - 0.32) / 0.3);           // white → orange on the decline
        var warm2 = smooth01((k - 0.6) / 0.35);           // orange → rose on the tail
        novaTmp.setHex(0xbfd8ff).lerp(novaWhite, blueMix).lerp(NOVA_ORANGE, warm1).lerp(NOVA_C, warm2);
        f.mat.opacity = Math.min(1, 1.15 * b);                                   // core: the point itself
        f.ball.scale.setScalar(5 * (1 + 0.2 * smooth01((b - 0.7) / 0.3)));       // blooms ≤20% — never a ball
        f.mat.color.copy(novaTmp);
        f.mat3.opacity = smooth01((b - 0.35) / 0.25) * b;                        // halo: PSF wings, threshold-gated
        f.halo.scale.setScalar(2 + 30 * Math.pow(Math.min(1, b), 0.55));         // grows with brightness, SHRINKS on the fade
        f.mat3.color.copy(novaTmp);
        if (k < 0.32) { // expansion: the cross grows in with the late rise, biggest at peak
          f.mat2.opacity = smooth01((b - 0.55) / 0.2);
          f.cross.scale.setScalar(10 + 65 * Math.pow(smooth01((b - 0.55) / 0.45), 1.4));
        } else { // extinction: the WHOLE cross slowly SHRINKS and gently fades out — it
          // does not retract its arms (operator: 缩小+渐渐消失, not 缩回来)
          var die = smooth01((k - 0.32) / 0.55);
          f.mat2.opacity = Math.min(1, 1.2 * (1 - die));
          f.cross.scale.setScalar(75 * (1 - 0.87 * die));
        }
      } else { // meteor: the head advances and the tail occupies the head's WAKE — a
        // deposited trail, like the real thing. (A rigidly sliding capsule, where the
        // tail travels at head speed, read as 'flying backwards'.)
        var kh = Math.min(1, k), kt2 = Math.max(0, kh - 0.38); // tail end lags 38% of the flight behind
        var hx = f.from.x + f.dir.x * f.dist * kh, hy = f.from.y + f.dir.y * f.dist * kh, hz = f.from.z + f.dir.z * f.dist * kh;
        var curLen = Math.max(f.dist * (kh - kt2), 0.001);
        f.obj.position.set(hx - f.dir.x * curLen * 0.5, hy - f.dir.y * curLen * 0.5, hz - f.dir.z * curLen * 0.5);
        f.obj.scale.x = curLen;
        f.mat.opacity = Math.pow(Math.sin(Math.min(1, k) * Math.PI), 0.8);
      }
    }
  }
  (function deepField() {
    var CELLS = 8, CS = 128;
    var ac = document.createElement('canvas'); ac.width = ac.height = CELLS * CS;
    var g = ac.getContext('2d');
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function hsl(h, s, l, a) { return 'hsla(' + (h | 0) + ',' + (s | 0) + '%,' + (l | 0) + '%,' + a.toFixed(3) + ')'; }
    function paintStamp(cx, cy, force) {
      var type = (force != null) ? force : Math.random();
      g.save(); g.translate(cx, cy); g.rotate(rnd(0, 6.283));
      if (type < 0.32) { // elliptical: smooth warm blob
        var hue = Math.random() < 0.5 ? rnd(20, 45) : rnd(0, 15);
        g.scale(1, rnd(0.45, 0.95));
        var R = rnd(14, 34);
        var gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
        gr.addColorStop(0, hsl(hue, 45, 88, 0.9));
        gr.addColorStop(0.3, hsl(hue, 50, 72, 0.5));
        gr.addColorStop(0.7, hsl(hue, 55, 60, 0.16));
        gr.addColorStop(1, hsl(hue, 55, 55, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 6.283); g.fill();
      } else if (type < 0.62) { // face-on spiral: core glow + 2-3 dotted arms
        var hue2 = Math.random() < 0.6 ? rnd(200, 230) : rnd(30, 55);
        g.scale(1, rnd(0.55, 1));
        var core = rnd(5, 9);
        var gr2 = g.createRadialGradient(0, 0, 0, 0, 0, core * 2.2);
        gr2.addColorStop(0, hsl(40, 40, 92, 0.95)); gr2.addColorStop(1, hsl(40, 40, 80, 0));
        g.fillStyle = gr2; g.beginPath(); g.arc(0, 0, core * 2.2, 0, 6.283); g.fill();
        var arms = Math.random() < 0.7 ? 2 : 3, tight = rnd(3, 4.6), maxR = rnd(26, 44);
        for (var ai = 0; ai < arms; ai++) {
          for (var s = 0; s < 46; s++) {
            var tt2 = s / 46, ang = ai * 6.283 / arms + tt2 * tight, rr = core + tt2 * (maxR - core);
            g.fillStyle = hsl(hue2, 45, 78, 0.34 * (1 - tt2));
            g.beginPath(); g.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, 1 + 2.6 * (1 - tt2), 0, 6.283); g.fill();
          }
        }
      } else if (type < 0.82) { // edge-on disk: thin streak + small bulge
        var hue3 = rnd(25, 50), len = rnd(24, 46);
        var gr3 = g.createLinearGradient(-len, 0, len, 0);
        gr3.addColorStop(0, hsl(hue3, 40, 75, 0)); gr3.addColorStop(0.5, hsl(hue3, 40, 82, 0.7)); gr3.addColorStop(1, hsl(hue3, 40, 75, 0));
        g.save(); g.scale(1, rnd(0.09, 0.16)); g.fillStyle = gr3; g.beginPath(); g.arc(0, 0, len, 0, 6.283); g.fill(); g.restore();
        var gb = g.createRadialGradient(0, 0, 0, 0, 0, len * 0.22);
        gb.addColorStop(0, hsl(hue3, 45, 90, 0.85)); gb.addColorStop(1, hsl(hue3, 45, 80, 0));
        g.save(); g.scale(1, 0.5); g.fillStyle = gb; g.beginPath(); g.arc(0, 0, len * 0.22, 0, 6.283); g.fill(); g.restore();
      } else { // tiny irregular / distant red-or-blue smudge
        var hue4 = Math.random() < 0.5 ? rnd(0, 20) : rnd(190, 230), n2 = 2 + (Math.random() * 3 | 0);
        for (var bi = 0; bi < n2; bi++) {
          var bx2 = rnd(-8, 8), by2 = rnd(-6, 6), br2 = rnd(3, 9);
          var g4 = g.createRadialGradient(bx2, by2, 0, bx2, by2, br2);
          g4.addColorStop(0, hsl(hue4, 50, 78, 0.55)); g4.addColorStop(1, hsl(hue4, 50, 70, 0));
          g.fillStyle = g4; g.beginPath(); g.arc(bx2, by2, br2, 0, 6.283); g.fill();
        }
      }
      g.restore();
    }
    function paintDetailedSpiral(cx, cy) { // high-detail stamp for the closer mid-layer
      g.save(); g.translate(cx, cy); g.rotate(rnd(0, 6.283));
      var hue = Math.random() < 0.6 ? rnd(205, 228) : rnd(32, 52);
      g.scale(1, rnd(0.5, 1));
      var haze = g.createRadialGradient(0, 0, 0, 0, 0, 46); // faint disc haze under the arms
      haze.addColorStop(0, hsl(hue, 30, 70, 0.22)); haze.addColorStop(1, hsl(hue, 30, 60, 0));
      g.fillStyle = haze; g.beginPath(); g.arc(0, 0, 46, 0, 6.283); g.fill();
      var core = rnd(5, 8);
      var gc = g.createRadialGradient(0, 0, 0, 0, 0, core * 2.6);
      gc.addColorStop(0, hsl(42, 55, 95, 1)); gc.addColorStop(0.4, hsl(40, 45, 85, 0.55)); gc.addColorStop(1, hsl(40, 45, 80, 0));
      g.fillStyle = gc; g.beginPath(); g.arc(0, 0, core * 2.6, 0, 6.283); g.fill();
      var tight = rnd(3.2, 4.4), maxR = rnd(38, 50);
      for (var ai = 0; ai < 2; ai++) {
        for (var s = 0; s < 90; s++) {
          var tt = s / 90, ang = ai * 3.1416 + tt * tight, rr = core + tt * (maxR - core);
          var axx = Math.cos(ang) * rr, ayy = Math.sin(ang) * rr;
          g.fillStyle = hsl(hue, 50, 80, 0.3 * (1 - tt));
          g.beginPath(); g.arc(axx, ayy, 1 + 3 * (1 - tt), 0, 6.283); g.fill();
          if (Math.random() < 0.3) { // resolved star speckles along the arms
            g.fillStyle = hsl(hue, 30, 92, rnd(0.35, 0.8) * (1 - tt * 0.6));
            g.fillRect(axx + rnd(-3, 3), ayy + rnd(-3, 3), 1, 1);
          }
        }
      }
      g.restore();
    }
    for (var cy2 = 0; cy2 < CELLS; cy2++) for (var cx2 = 0; cx2 < CELLS; cx2++) {
      var ci2 = cy2 * CELLS + cx2, sx2 = cx2 * CS + CS / 2, sy2 = cy2 * CS + CS / 2;
      if (ci2 < 6) paintDetailedSpiral(sx2, sy2);   // cells 0-5: mid-layer showpieces
      else if (ci2 < 16) paintStamp(sx2, sy2, 0.1); // cells 6-15: ellipticals (cluster stock)
      else paintStamp(sx2, sy2);                    // the rest: random mix
    }
    var atlas = new THREE.CanvasTexture(ac);
    function sph(th, ph, r) { return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)]; }
    var items = [], clusters = [];
    for (var cc = 0; cc < 3; cc++) clusters.push([rnd(0, 6.283), Math.acos(2 * Math.random() - 1)]);
    for (var gi2 = 0; gi2 < 110; gi2++) { // FAR layer: barely-resolved smudges, mildly grouped
      var th4, ph4;
      if (gi2 % 5 < 2) { var cl = clusters[gi2 % 3]; th4 = cl[0] + rnd(-0.16, 0.16); ph4 = cl[1] + rnd(-0.14, 0.14); }
      else { th4 = rnd(0, 6.283); ph4 = Math.acos(2 * Math.random() - 1); }
      items.push({ p: sph(th4, ph4, rnd(1250, 1650)), size: gi2 < 2 ? rnd(60, 78) : 8 + Math.pow(Math.random(), 2.2) * 46,
        rot: rnd(0, 6.283), cell: (Math.random() * 64) | 0, fade: rnd(0.3, 0.75) });
    }
    for (var mi2 = 0; mi2 < 26; mi2++) { // MID layer: closer, larger, resolvable — prefers the detailed stamps
      items.push({ p: sph(rnd(0, 6.283), Math.acos(2 * Math.random() - 1), rnd(950, 1200)), size: rnd(30, 70),
        rot: rnd(0, 6.283), cell: Math.random() < 0.6 ? (Math.random() * 6) | 0 : (Math.random() * 64) | 0, fade: rnd(0.4, 0.8) });
    }
    // RICH CLUSTER: dozens of ellipticals crowded into one patch of sky (3 giant cD
    // galaxies at the core), like the group in the operator's deep-field reference
    var clTh = rnd(0, 6.283), clPh = Math.acos(2 * Math.random() - 1);
    for (var ki2 = 0; ki2 < 36; ki2++) {
      var tight2 = ki2 < 3 ? 0.018 : 0.085;
      items.push({ p: sph(clTh + rnd(-tight2, tight2) * 2, clPh + rnd(-tight2, tight2) * 1.7, rnd(1300, 1550)),
        size: ki2 < 3 ? rnd(20, 30) : rnd(6, 18), rot: rnd(0, 6.283), cell: 6 + ((Math.random() * 10) | 0), fade: rnd(0.35, 0.7) });
    }
    var deepSky = billboardBatch(atlas, items, 8);
    scene.add(deepSky); // the fixed deep sky — still ONE draw call
    window.GX = window.GX || {};
    GX.deepSky = deepSky; // hook: lapisan produk bisa menyembunyikan galaksi latar bawaan
    var icl = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xfff0dc, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }));
    var iclP = sph(clTh, clPh, 1600); icl.position.set(iclP[0], iclP[1], iclP[2]); icl.scale.set(280, 280, 1);
    scene.add(icl); // faint intracluster glow behind the members
    GX.deepCluster = icl; // hook
  })();

  // shared billboard quad-batch builder — one mesh, one draw call for N textured quads
  // (size / rotation / fade baked per-vertex; used by the deep field and the nebulae)
  function billboardBatch(atlas, items, cellsPerRow) {
    var N = items.length;
    var pos = new Float32Array(N * 4 * 3), corner = new Float32Array(N * 4 * 2), quv = new Float32Array(N * 4 * 2), tintA = new Float32Array(N * 4 * 3), idx = [];
    for (var i = 0; i < N; i++) {
      var it = items[i], cr = Math.cos(it.rot), sr = Math.sin(it.rot);
      var cu = (it.cell % cellsPerRow) / cellsPerRow, cv = Math.floor(it.cell / cellsPerRow) / cellsPerRow;
      for (var vi = 0; vi < 4; vi++) {
        var ox = (vi === 1 || vi === 2) ? 0.5 : -0.5, oy = (vi >= 2) ? 0.5 : -0.5;
        var o3 = (i * 4 + vi) * 3, o2 = (i * 4 + vi) * 2;
        pos[o3] = it.p[0]; pos[o3 + 1] = it.p[1]; pos[o3 + 2] = it.p[2];
        corner[o2] = (ox * cr - oy * sr) * it.size; corner[o2 + 1] = (ox * sr + oy * cr) * it.size;
        quv[o2] = cu + (ox + 0.5) / cellsPerRow; quv[o2 + 1] = cv + (oy + 0.5) / cellsPerRow;
        tintA[o3] = it.fade; tintA[o3 + 1] = it.fade; tintA[o3 + 2] = it.fade;
      }
      var b4 = i * 4; idx.push(b4, b4 + 1, b4 + 2, b4, b4 + 2, b4 + 3);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setAttribute('aUv', new THREE.BufferAttribute(quv, 2));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tintA, 3));
    geo.setIndex(idx);
    var mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas } },
      vertexShader: 'attribute vec2 aCorner; attribute vec2 aUv; attribute vec3 aTint; varying vec2 vUv; varying vec3 vTint;' +
        'void main(){ vec3 cr2 = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);' +
        ' vec3 cu2 = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);' + // camera right/up → billboard
        ' vec3 p = position + cr2 * aCorner.x + cu2 * aCorner.y;' +
        ' gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); vUv = aUv; vTint = aTint; }',
      fragmentShader: 'uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vTint;' +
        'void main(){ vec4 t = texture2D(uAtlas, vUv); if (t.a < 0.01) discard; gl_FragColor = vec4(t.rgb * vTint, t.a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    return mesh;
  }
