/**
 * main.js — Entry point
 *
 * Ties together scene, time, celestial bodies, trajectory, and UI events.
 * Runs the animation loop and handles all user interaction.
 */

import * as THREE from 'three';
import { createScene }             from './scene.js';
import { TimeController }          from './timeController.js';
import { CelestialBodyManager }    from './celestialBodies.js';
import { TrajectorySystem }        from './trajectory.js';
import { PLANET_DATA, AU_SCALE, getPlanetPosition } from './ephemeris.js';

// ── Bootstrap ────────────────────────────────────────────────────────────────

const container = document.getElementById('canvas-container');
const { scene, renderer, camera, controls } = createScene(container);

const time       = new TimeController('2024-01-01');
const celestials = new CelestialBodyManager(scene);
const traj       = new TrajectorySystem(scene);

// ── Camera focus transition state ────────────────────────────────────────────

const focus = {
  active:      false,
  progress:    0,
  startTarget: new THREE.Vector3(),
  startCam:    new THREE.Vector3(),
  endTarget:   new THREE.Vector3(),
  endCam:      new THREE.Vector3(),
};

function focusOn(name) {
  const pos  = celestials.getPosition(name) || new THREE.Vector3();
  const r    = PLANET_DATA[name]?.radius || 5;
  const dist = Math.max(r * 9, 18);

  focus.startTarget.copy(controls.target);
  focus.startCam.copy(camera.position);
  focus.endTarget.copy(pos);
  // Position camera at a nice elevated angle relative to the planet
  const dir = camera.position.clone().sub(controls.target).normalize();
  focus.endCam.copy(pos).add(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.35, 0));
  focus.progress = 0;
  focus.active   = true;
}

// ── Selection state ───────────────────────────────────────────────────────────

let selectedBody = null;

function selectBody(name) {
  selectedBody = name;
  celestials.highlightBody(name);

  const data  = PLANET_DATA[name];
  const panel = document.getElementById('selected-body');
  const mesh  = celestials.getMesh(name);

  panel.style.display = 'block';
  document.getElementById('selected-name').textContent = name;

  if (name === 'Sun') {
    document.getElementById('selected-info').textContent =
      'Type: Star\nMass: 333,000× Earth\nDiameter: 1,391,000 km';
  } else if (data) {
    const pos    = mesh.position;
    const distAU = (pos.length() / AU_SCALE).toFixed(3);
    const period = data.T < 365
      ? `${data.T.toFixed(1)} days`
      : `${(data.T / 365.25).toFixed(2)} years`;
    document.getElementById('selected-info').textContent =
      `Type: ${data.type}\nDistance: ${distAU} AU\nOrbital period: ${period}\n\n${data.description}`;
  }
}

function clearSelection() {
  selectedBody = null;
  celestials.highlightBody(null);
  document.getElementById('selected-body').style.display = 'none';
}

// ── Raycasting ────────────────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

renderer.domElement.addEventListener('click', e => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.set(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    ((e.clientY - rect.top)  / rect.height) * -2 + 1,
  );
  raycaster.setFromCamera(mouse, camera);

  const hits = raycaster.intersectObjects(celestials.getAllMeshes(), true);
  if (hits.length > 0) {
    // Walk up to the mesh that has bodyName
    let obj = hits[0].object;
    while (obj && !obj.userData.bodyName) obj = obj.parent;
    if (obj?.userData.bodyName) {
      selectBody(obj.userData.bodyName);
      return;
    }
  }
  clearSelection();
});

// Pointer cursor on hover
renderer.domElement.addEventListener('mousemove', e => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.set(
    ((e.clientX - rect.left) / rect.width)  *  2 - 1,
    ((e.clientY - rect.top)  / rect.height) * -2 + 1,
  );
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(celestials.getAllMeshes(), true);
  renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
});

// ── UI wiring ─────────────────────────────────────────────────────────────────

// Date picker
const dateInput = document.getElementById('date-input');
dateInput.addEventListener('change', () => {
  time.setDate(dateInput.value);
  document.getElementById('time-display').textContent = dateInput.value;
});

// Speed buttons
let scrubberBaseDate = time.getFormattedDate();

document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    time.setSpeed(Number(btn.dataset.speed));
  });
});

// Timeline scrubber — relative jog control.
// Dragging changes the date by the scrubber delta; releasing snaps back to 0.
let prevScrubVal = 0;
const scrubber = document.getElementById('timeline-scrubber');
scrubber.addEventListener('input', () => {
  const delta = Number(scrubber.value) - prevScrubVal;
  prevScrubVal = Number(scrubber.value);
  time.addDays(delta);
  dateInput.value = time.getFormattedDate();
});
scrubber.addEventListener('change', () => {
  // Snap back to center after release
  prevScrubVal  = 0;
  scrubber.value = 0;
});

// Toggle orbit paths
document.getElementById('toggle-orbits').addEventListener('change', e => {
  celestials.setOrbitsVisible(e.target.checked);
});

// Toggle labels
document.getElementById('toggle-labels').addEventListener('change', e => {
  celestials.setLabelsVisible(e.target.checked);
});

// Reset camera
document.getElementById('btn-reset-camera').addEventListener('click', () => {
  focus.startTarget.copy(controls.target);
  focus.startCam.copy(camera.position);
  focus.endTarget.set(0, 0, 0);
  focus.endCam.set(0, 80, 160);
  focus.progress = 0;
  focus.active   = true;
  clearSelection();
});

// Focus button in selected-body panel
document.getElementById('btn-focus').addEventListener('click', () => {
  if (selectedBody) focusOn(selectedBody);
});

// Travel duration display
const durationSlider = document.getElementById('travel-duration');
const durationDisplay = document.getElementById('duration-display');
durationSlider.addEventListener('input', () => {
  durationDisplay.textContent = `${durationSlider.value} days`;
});

// Rocket launch
document.getElementById('btn-launch').addEventListener('click', () => {
  if (traj.active) return;

  const origin = document.getElementById('origin-planet').value;
  const dest   = document.getElementById('dest-planet').value;
  if (origin === dest) {
    alert('Origin and destination must be different planets.');
    return;
  }

  const durationDays = Number(durationSlider.value);
  const departureT   = time.T;
  const arrivalT     = departureT + durationDays;

  const startPos = getPlanetPosition(origin, departureT);
  const endPos   = getPlanetPosition(dest,   arrivalT);

  traj.launch(
    new THREE.Vector3(startPos.x, startPos.y, startPos.z),
    new THREE.Vector3(endPos.x,   endPos.y,   endPos.z),
    departureT,
    durationDays,
  );

  document.getElementById('btn-launch').disabled = true;
  document.getElementById('btn-cancel-rocket').style.display = 'block';
  document.getElementById('trajectory-info').textContent = 'Rocket launched!';
});

// Cancel rocket
document.getElementById('btn-cancel-rocket').addEventListener('click', () => {
  traj._autoCleanupPending = false;
  traj.cancel();
  resetRocketUI();
});

function resetRocketUI() {
  document.getElementById('btn-launch').disabled          = false;
  document.getElementById('btn-cancel-rocket').style.display = 'none';
  document.getElementById('trajectory-info').textContent  = '';
}

// ── Animation loop ────────────────────────────────────────────────────────────

let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now   = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime    = now;

  // 1. Advance simulation time
  time.update(delta);

  // 2. Update planet positions & labels
  celestials.update(time.T, camera, renderer.domElement);

  // 3. Update rocket
  const flightState = traj.update(time.T);
  if (flightState) {
    const pct = (flightState.t * 100).toFixed(1);
    document.getElementById('trajectory-info').textContent =
      flightState.arrived
        ? '✓ Arrived at destination'
        : `In flight: ${pct}%`;

    // Follow rocket if checkbox checked
    if (document.getElementById('toggle-follow-rocket').checked) {
      controls.target.lerp(traj.getRocketPosition(), 0.08);
    }

    // Auto-cleanup 3 s after arrival (guard prevents repeated timeouts)
    if (flightState.arrived && !traj._autoCleanupPending) {
      traj._autoCleanupPending = true;
      setTimeout(() => {
        traj._autoCleanupPending = false;
        traj.cancel();
        resetRocketUI();
      }, 3000);
    }
  }

  // 4. Camera focus transition (smooth lerp)
  if (focus.active) {
    controls.enabled = false;
    focus.progress  += 0.04;
    const t  = Math.min(focus.progress, 1);
    const et = t * t * (3 - 2 * t); // smoothstep

    controls.target.lerpVectors(focus.startTarget, focus.endTarget, et);
    camera.position.lerpVectors(focus.startCam,    focus.endCam,    et);

    if (t >= 1) {
      focus.active     = false;
      controls.enabled = true;
    }
  }

  // 5. Update time display
  const dateStr = time.getFormattedDate();
  document.getElementById('time-display').textContent = dateStr;
  // Keep date input in sync only when not scrubbing (avoid fighting)
  if (document.activeElement !== dateInput) {
    dateInput.value = dateStr;
  }

  // 6. Orbit controls damping
  controls.update();

  // 7. Render
  renderer.render(scene, camera);
}

animate();
