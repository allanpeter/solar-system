/**
 * scene.js — Three.js scene, renderer, camera, lights, and starfield
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(container) {
  // ── Renderer ─────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();

  // ── Camera ────────────────────────────────────────────────────────────────
  const aspect = container.clientWidth / container.clientHeight;
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 5000);
  camera.position.set(0, 80, 160);
  camera.lookAt(0, 0, 0);

  // ── Orbit Controls ────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.06;
  controls.minDistance    = 6;
  controls.maxDistance    = 1200;
  controls.enablePan      = true;

  // ── Lighting ──────────────────────────────────────────────────────────────
  // Sun as point-light source
  const sunLight = new THREE.PointLight(0xFFEECC, 4, 800, 1.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  scene.add(sunLight);

  // Soft fill so shadowed hemispheres are visible (not pitch-black)
  const ambient = new THREE.AmbientLight(0x111133, 0.6);
  scene.add(ambient);

  // ── Starfield ─────────────────────────────────────────────────────────────
  scene.add(createStarfield(6000));

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { scene, renderer, camera, controls };
}

function createStarfield(count) {
  const positions = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Uniform distribution on a sphere shell
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 900 + Math.random() * 300;

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    sizes[i]             = 0.4 + Math.random() * 1.4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

  // Use vertex-size attribute for twinkling star variety
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xffffff) } },
    vertexShader: `
      attribute float size;
      void main() {
        gl_PointSize = size;
        gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.4, 1.0, d);
        gl_FragColor = vec4(color, a);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  return new THREE.Points(geo, mat);
}
