/**
 * celestialBodies.js — Manages meshes for the Sun and planets.
 *
 * Responsibilities:
 *   • Create Sun / planet meshes and add them to the scene
 *   • Create orbit path lines
 *   • Create planet labels (DOM elements, positioned via projection)
 *   • Update positions and labels each frame
 */

import * as THREE from 'three';
import { PLANET_DATA, AU_SCALE, getPlanetPosition, getOrbitPoints } from './ephemeris.js';

const PLANET_NAMES = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn'];

export class CelestialBodyManager {
  constructor(scene) {
    this.scene       = scene;
    this._bodies     = {};      // name → { mesh, orbitLine }
    this._meshList   = [];      // flat list for raycasting
    this._labels     = {};      // name → <div>
    this._showOrbits = true;
    this._showLabels = true;

    this._buildSun();
    PLANET_NAMES.forEach(n => this._buildPlanet(n));
  }

  // ── Construction ──────────────────────────────────────────────────────────

  _buildSun() {
    const geo = new THREE.SphereGeometry(5, 48, 48);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFF5A0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.bodyName = 'Sun';

    // Layered corona glow
    [{ r: 5.6, op: 0.18 }, { r: 6.5, op: 0.08 }, { r: 8.0, op: 0.04 }].forEach(({ r, op }) => {
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xFF9900,
        transparent: true,
        opacity: op,
        side: THREE.BackSide,
        depthWrite: false,
      });
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 24), glowMat));
    });

    this.scene.add(mesh);
    this._bodies['Sun'] = { mesh, orbitLine: null };
    this._meshList.push(mesh);
    this._makeLabel('Sun');
  }

  _buildPlanet(name) {
    const data = PLANET_DATA[name];

    // ── Planet sphere ──
    const geo = new THREE.SphereGeometry(data.radius, 36, 36);
    const mat = new THREE.MeshStandardMaterial({
      color:     data.color,
      emissive:  new THREE.Color(data.emissive || 0),
      roughness: 0.85,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.bodyName = name;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;

    // ── Saturn rings ──
    if (data.rings) {
      const inner = data.radius * 1.45;
      const outer = data.radius * 2.5;
      const ringGeo = new THREE.RingGeometry(inner, outer, 80, 4);

      // Remap UVs so the ring gradient goes from inner→outer edge
      const pos  = ringGeo.attributes.position;
      const uv   = ringGeo.attributes.uv;
      const v3   = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        const t = (v3.length() - inner) / (outer - inner);
        uv.setXY(i, t, 0);
      }

      const ringMat = new THREE.MeshBasicMaterial({
        color:       0xC8B870,
        side:        THREE.DoubleSide,
        transparent: true,
        opacity:     0.72,
        depthWrite:  false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2; // lie in local XZ plane (ecliptic)
      mesh.add(ring);
    }

    // ── Orbit path ──
    const pts    = getOrbitPoints(name, 300);
    const v3pts  = pts.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const orbGeo = new THREE.BufferGeometry().setFromPoints(v3pts);
    const orbMat = new THREE.LineBasicMaterial({
      color:       0x334466,
      transparent: true,
      opacity:     0.5,
      depthWrite:  false,
    });
    const orbitLine = new THREE.LineLoop(orbGeo, orbMat);
    orbitLine.visible = this._showOrbits;
    this.scene.add(orbitLine);

    this.scene.add(mesh);
    this._bodies[name] = { mesh, orbitLine };
    this._meshList.push(mesh);
    this._makeLabel(name);
  }

  _makeLabel(name) {
    const el = document.createElement('div');
    el.className          = 'planet-label';
    el.textContent        = name;
    el.style.display      = this._showLabels ? 'block' : 'none';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    this._labels[name] = el;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(T_days, camera, rendererEl) {
    const W = rendererEl.clientWidth;
    const H = rendererEl.clientHeight;

    for (const name of PLANET_NAMES) {
      const body = this._bodies[name];
      const pos  = getPlanetPosition(name, T_days);
      body.mesh.position.set(pos.x, pos.y, pos.z);
      body.mesh.rotation.y += PLANET_DATA[name]._rotRate || 0.004;
    }

    // Update DOM labels
    this._updateLabels(camera, W, H);
  }

  _updateLabels(camera, W, H) {
    const v = new THREE.Vector3();
    for (const [name, el] of Object.entries(this._labels)) {
      if (!this._showLabels) { el.style.display = 'none'; continue; }

      v.copy(this._bodies[name].mesh.position);
      v.project(camera);

      // Behind camera → hide
      if (v.z > 1) { el.style.display = 'none'; continue; }

      el.style.display = 'block';
      el.style.left    = ((v.x * 0.5 + 0.5) * W) + 'px';
      el.style.top     = ((-v.y * 0.5 + 0.5) * H) + 'px';
    }
  }

  // ── Selection highlight (emissive pulse) ──────────────────────────────────

  highlightBody(name) {
    // Clear previous
    for (const [n, b] of Object.entries(this._bodies)) {
      if (b.mesh.material?.emissive && n !== 'Sun') {
        b.mesh.material.emissive.setHex(PLANET_DATA[n]?.emissive || 0);
        b.mesh.material.emissiveIntensity = 1;
      }
    }
    if (!name || name === 'Sun') return;
    const mat = this._bodies[name]?.mesh?.material;
    if (mat?.emissive) {
      mat.emissive.setHex(0x004488);
      mat.emissiveIntensity = 3;
    }
  }

  // ── Visibility toggles ────────────────────────────────────────────────────

  setOrbitsVisible(v) {
    this._showOrbits = v;
    for (const b of Object.values(this._bodies)) {
      if (b.orbitLine) b.orbitLine.visible = v;
    }
  }

  setLabelsVisible(v) {
    this._showLabels = v;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getMesh(name)       { return this._bodies[name]?.mesh; }
  getPosition(name)   { return this._bodies[name]?.mesh.position.clone(); }
  getAllMeshes()      { return this._meshList; }
}
