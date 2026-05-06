/**
 * trajectory.js — Rocket launch, trajectory curve, and flight animation
 *
 * The trajectory is a visual Bezier approximation (NOT real physics).
 * A CubicBezierCurve3 is used so departure and arrival can be given
 * tangent directions that orbit away from / toward the Sun, giving a
 * Hohmann-like visual shape without any gravity math.
 */

import * as THREE from 'three';

// ── Rocket mesh factory ────────────────────────────────────────────────────

function buildRocket() {
  const group = new THREE.Group();

  const silver = new THREE.MeshStandardMaterial({ color: 0xDDDDDD, metalness: 0.7, roughness: 0.3 });
  const red    = new THREE.MeshStandardMaterial({ color: 0xFF3322, metalness: 0.3, roughness: 0.5 });
  const dark   = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.2 });

  // Main cylindrical body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.4, 12), silver);
  group.add(body);

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 12), red);
  nose.position.y = 1.075;
  group.add(nose);

  // Engine bell / nozzle
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.28, 12), dark);
  nozzle.position.y = -0.84;
  group.add(nozzle);

  // Three fins
  for (let f = 0; f < 3; f++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), silver);
    const angle = (f / 3) * Math.PI * 2;
    fin.position.set(Math.cos(angle) * 0.32, -0.55, Math.sin(angle) * 0.32);
    fin.rotation.y = -angle;
    group.add(fin);
  }

  // Exhaust plume (animated each frame in update())
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0xFF8800, transparent: true, opacity: 0.85, depthWrite: false,
  });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 10), plumeMat);
  plume.position.y = -1.18;
  plume.rotation.z = Math.PI; // point downward in local space
  group.add(plume);
  group.userData.plume = plume;

  return group;
}

// ── TrajectorySystem class ─────────────────────────────────────────────────

export class TrajectorySystem {
  constructor(scene) {
    this.scene    = scene;
    this.active   = false;

    this._rocket      = buildRocket();
    this._rocket.visible = false;
    scene.add(this._rocket);

    this._curve       = null;
    this._line        = null;    // the drawn trajectory path
    this._departureT  = 0;       // days since J2000
    this._arrivalT    = 0;
    this._endPos      = new THREE.Vector3();
    this.arrived      = false;   // set to true once t >= 1, reset on launch
  }

  // ── Launch ───────────────────────────────────────────────────────────────

  /**
   * startPos / endPos: THREE.Vector3 at departure / arrival time
   * departureT: simulation days since J2000 at launch
   * durationDays: travel time in simulation days
   */
  launch(startPos, endPos, departureT, durationDays) {
    this._departureT = departureT;
    this._arrivalT   = departureT + durationDays;
    this._endPos.copy(endPos);

    this._curve = this._buildCurve(startPos, endPos);
    this._drawLine();

    this._rocket.visible = true;
    this._rocket.position.copy(startPos);
    this.active  = true;
    this.arrived = false;
  }

  // Cubic Bezier with tangents that "swing out" from the Sun, giving a
  // plausible transfer-orbit arc regardless of planet positions.
  _buildCurve(start, end) {
    const dist = start.distanceTo(end);
    const mid  = start.clone().add(end).multiplyScalar(0.5);

    // Outward direction from Sun at each endpoint
    const outS = start.clone().normalize().multiplyScalar(dist * 0.45);
    const outE = end.clone().normalize().multiplyScalar(dist * 0.45);

    // Elevate control points above the ecliptic for a visible arc
    const lift = new THREE.Vector3(0, dist * 0.28, 0);

    const cp1 = start.clone().add(outS).add(lift);
    const cp2 = end.clone().add(outE).add(lift);

    // If planets are nearly opposite (mid ≈ Sun), push CPs outward more
    if (mid.length() < dist * 0.2) {
      const extra = new THREE.Vector3(-start.z, 0, start.x).normalize().multiplyScalar(dist * 0.6);
      cp1.add(extra);
      cp2.add(extra);
    }

    return new THREE.CubicBezierCurve3(start, cp1, cp2, end);
  }

  _drawLine() {
    if (this._line) {
      this.scene.remove(this._line);
      this._line.geometry.dispose();
      this._line.material.dispose();
    }

    const pts    = this._curve.getPoints(256);
    const geo    = new THREE.BufferGeometry().setFromPoints(pts);
    const mat    = new THREE.LineDashedMaterial({
      color:       0x00FFAA,
      dashSize:    1.8,
      gapSize:     0.7,
      transparent: true,
      opacity:     0.75,
      depthWrite:  false,
    });
    this._line = new THREE.Line(geo, mat);
    this._line.computeLineDistances(); // required for dashed lines
    this.scene.add(this._line);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  /**
   * Returns { t, arrived } where t ∈ [0,1] is flight progress,
   * or null if not active.
   */
  update(currentT) {
    if (!this.active) return null;

    const span = this._arrivalT - this._departureT;
    const t    = Math.max(0, Math.min(1, (currentT - this._departureT) / span));

    const pos     = this._curve.getPoint(t);
    const tangent = this._curve.getTangent(t).normalize();

    this._rocket.position.copy(pos);
    // Orient rocket so its local +Y axis points along the tangent
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(tangent.dot(up)) < 0.9999) {
      this._rocket.quaternion.setFromUnitVectors(up, tangent);
    }

    // Animate plume flicker
    const plume = this._rocket.userData.plume;
    plume.scale.y     = 0.8 + Math.random() * 0.5;
    plume.material.opacity = 0.65 + Math.random() * 0.3;

    if (t >= 1) this.arrived = true;
    return { t, arrived: this.arrived };
  }

  // ── Cancel / cleanup ──────────────────────────────────────────────────────

  cancel() {
    this.active          = false;
    this._rocket.visible = false;
    if (this._line) {
      this.scene.remove(this._line);
      this._line.geometry.dispose();
      this._line.material.dispose();
      this._line = null;
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getRocketPosition() { return this._rocket.position.clone(); }
  getRocketMesh()     { return this._rocket; }
}
