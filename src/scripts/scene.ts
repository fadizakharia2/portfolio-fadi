import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';

/**
 * The particle field behind every page. Each particle carries four target
 * positions (core, orbit, lattice, singularity); `uMorph` runs from 0 to 3
 * and the vertex shader blends between neighbouring shapes, with a per-
 * particle delay so a transition ripples through the cloud instead of
 * snapping. The page decides the morph value from scroll (see motion.ts).
 */

const vertex = /* glsl */ `
  attribute vec3 aOrbit;
  attribute vec3 aLattice;
  attribute vec3 aVoid;
  attribute float aRand;

  uniform float uTime;
  uniform float uMorph;
  uniform float uPixel;
  uniform float uSize;
  uniform vec2 uPointer;

  varying float vRand;
  varying float vDepth;
  varying float vHeat;

  vec3 shape(float i) {
    if (i < 0.5) return position;
    if (i < 1.5) return aOrbit;
    if (i < 2.5) return aLattice;
    return aVoid;
  }

  void main() {
    float seg = clamp(floor(uMorph), 0.0, 2.0);
    float local = uMorph - seg;
    // Staggered blend: each particle starts its trip a little later.
    float t = smoothstep(aRand * 0.45, 0.55 + aRand * 0.45, local);
    vec3 a = shape(seg);
    vec3 b = shape(seg + 1.0);
    vec3 p = mix(a, b, t);

    // Turbulence peaks mid-transition, so shapes dissolve and re-form.
    float turb = sin(t * 3.14159) * 0.9 + 0.06;
    float ph = uTime * 0.6 + aRand * 40.0;
    p += vec3(
      sin(ph + p.y * 1.7),
      cos(ph * 0.9 + p.z * 1.3),
      sin(ph * 1.1 + p.x * 1.5)
    ) * turb * 0.18;

    // Gentle repulsion around the pointer.
    vec2 d = p.xy - uPointer * 3.2;
    float f = exp(-dot(d, d) * 1.6);
    p.xy += normalize(d + 0.0001) * f * 0.35;
    vHeat = f;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = uSize * (0.35 + aRand * 0.9) * (1.0 + f * 1.5);
    gl_PointSize = size * uPixel * (6.0 / -mv.z);
    vRand = aRand;
    vDepth = clamp((-mv.z - 3.0) / 8.0, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uFade;
  varying float vRand;
  varying float vDepth;
  varying float vHeat;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 1.6);
    float spark = step(0.985, vRand);
    vec3 col = mix(uColor, uHot, max(spark, vHeat * 0.8));
    float alpha = glow * (1.0 - vDepth * 0.55) * uFade;
    gl_FragColor = vec4(col * alpha * 1.45, alpha);
  }
`;

function fibonacciSphere(i: number, n: number, r: number): [number, number, number] {
  const y = 1 - (i / (n - 1)) * 2;
  const rad = Math.sqrt(1 - y * y);
  const theta = Math.PI * (3 - Math.sqrt(5)) * i;
  return [Math.cos(theta) * rad * r, y * r, Math.sin(theta) * rad * r];
}

function buildGeometry(n: number) {
  const core = new Float32Array(n * 3);
  const orbit = new Float32Array(n * 3);
  const lattice = new Float32Array(n * 3);
  const voidPos = new Float32Array(n * 3);
  const rand = new Float32Array(n);

  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    rand[i] = r;

    // Core: a sphere with a slightly ragged shell.
    const [sx, sy, sz] = fibonacciSphere(i, n, 1.55 + (Math.random() - 0.5) * 0.08);
    core.set([sx, sy, sz], i * 3);

    // Orbit: three tilted rings around a small dense nucleus.
    const ring = i % 4;
    const a = Math.random() * Math.PI * 2;
    if (ring === 3) {
      const [nx, ny, nz] = fibonacciSphere(i, n, 0.42 * Math.cbrt(Math.random()));
      orbit.set([nx, ny, nz], i * 3);
    } else {
      const R = 1.5 + ring * 0.55 + (Math.random() - 0.5) * 0.06;
      const tilt = [0.35, -0.9, 1.35][ring];
      const yaw = [0, 1.1, -0.6][ring];
      let x = Math.cos(a) * R;
      let y = (Math.random() - 0.5) * 0.04;
      let z = Math.sin(a) * R;
      const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
      const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
      y = y2;
      z = z2;
      const x2 = x * Math.cos(yaw) + z * Math.sin(yaw);
      const z3 = -x * Math.sin(yaw) + z * Math.cos(yaw);
      x = x2;
      z = z3;
      orbit.set([x, y, z], i * 3);
    }

    // Lattice: a wave terrain receding into the distance.
    const gx = (i % side) / side - 0.5;
    const gz = Math.floor(i / side) / side - 0.5;
    const lx = gx * 9;
    const lz = gz * 9;
    const ly = -1.25 + Math.sin(lx * 1.2) * 0.22 + Math.cos(lz * 1.6 + lx * 0.4) * 0.22;
    lattice.set([lx, ly, lz - 1.0], i * 3);

    // Void: a flat accretion disc spiralling into a bright point.
    const arm = i % 3;
    const t = Math.pow(Math.random(), 1.8);
    const radius = 0.08 + t * 3.4;
    const angle = arm * ((Math.PI * 2) / 3) + radius * 1.7 + (Math.random() - 0.5) * 0.5;
    voidPos.set(
      [Math.cos(angle) * radius, (Math.random() - 0.5) * 0.08 * (1 - t), Math.sin(angle) * radius],
      i * 3,
    );
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(core, 3));
  geo.setAttribute('aOrbit', new BufferAttribute(orbit, 3));
  geo.setAttribute('aLattice', new BufferAttribute(lattice, 3));
  geo.setAttribute('aVoid', new BufferAttribute(voidPos, 3));
  geo.setAttribute('aRand', new BufferAttribute(rand, 1));
  return geo;
}

export interface SceneHandle {
  setMorph(value: number): void;
  setPointer(x: number, y: number): void;
  setScrollVelocity(v: number): void;
  setFade(v: number): void;
}

export function createScene(canvas: HTMLCanvasElement, opts: { reduced: boolean }): SceneHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const small = window.matchMedia('(max-width: 767px)').matches;
  const count = small ? 7000 : 16000;
  const pixel = Math.min(window.devicePixelRatio, small ? 1.5 : 2);
  renderer.setPixelRatio(pixel);

  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 7.2);

  const rig = new Group();
  scene.add(rig);

  const material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uPixel: { value: pixel },
      uSize: { value: small ? 5.2 : 5.0 },
      uPointer: { value: { x: 9, y: 9 } },
      uColor: { value: new Color('#ff2b1c') },
      uHot: { value: new Color('#ffd9c9') },
      uFade: { value: 0 },
    },
  });
  const points = new Points(buildGeometry(count), material);
  rig.add(points);

  // A wireframe cage that frames the core and drifts out as the cloud morphs.
  const cage = new LineSegments(
    new EdgesGeometry(new IcosahedronGeometry(2.35, 1)),
    new LineBasicMaterial({ color: '#ff2b1c', transparent: true, opacity: 0.14, blending: AdditiveBlending }),
  );
  rig.add(cage);

  const state = { morph: 0, target: 0, px: 9, py: 9, tx: 9, ty: 9, vel: 0, fade: 0, fadeTarget: 1 };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull the camera back on narrow screens so the shapes stay in frame.
    camera.position.z = w < h ? 9.6 : 7.2;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let visible = true;
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible';
    if (visible) last = performance.now();
  });

  let last = performance.now();
  let elapsed = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += opts.reduced ? dt * 0.15 : dt;

    const k = 1 - Math.exp(-dt * 3.2);
    state.morph += (state.target - state.morph) * k;
    state.px += (state.tx - state.px) * (1 - Math.exp(-dt * 6));
    state.py += (state.ty - state.py) * (1 - Math.exp(-dt * 6));
    state.vel *= Math.exp(-dt * 4);
    state.fade += (state.fadeTarget - state.fade) * (1 - Math.exp(-dt * 1.6));

    const u = material.uniforms;
    u.uTime.value = elapsed;
    u.uMorph.value = state.morph;
    u.uPointer.value = { x: state.px, y: state.py };
    u.uFade.value = state.fade;

    // In the hero the core sits beside the name; later shapes centre up.
    const wide = camera.aspect > 1.1;
    const hold = Math.max(0, 1 - state.morph * 1.4);
    rig.position.x = wide ? hold * 1.9 : 0;
    rig.position.y = wide ? 0 : hold * 1.5;
    rig.rotation.y = elapsed * 0.06 + state.morph * 0.9 + state.vel * 0.002;
    rig.rotation.x = Math.sin(elapsed * 0.2) * 0.08 + (state.py === 9 ? 0 : state.py * 0.12) + (state.morph > 1.6 && state.morph < 2.6 ? 0.25 : 0);
    const cageScale = 1 + Math.max(0, state.morph - 0.2) * 0.9;
    cage.scale.setScalar(cageScale);
    cage.rotation.x = elapsed * 0.05;
    cage.rotation.z = -elapsed * 0.03;
    (cage.material as LineBasicMaterial).opacity = Math.max(0, 0.16 - state.morph * 0.07) * state.fade;

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    setMorph(v) {
      state.target = Math.max(0, Math.min(3, v));
    },
    setPointer(x, y) {
      state.tx = x;
      state.ty = y;
    },
    setScrollVelocity(v) {
      state.vel = v;
    },
    setFade(v) {
      state.fadeTarget = v;
    },
  };
}
