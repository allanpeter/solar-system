/**
 * timeController.js — Simulation time state
 *
 * Tracks the current simulation date and advances it at a configurable speed.
 * Speed is expressed as days-per-real-second (e.g. 0 = paused, 1 = 1 day/s, 365 = 1 yr/s).
 */

import { dateToDays } from './ephemeris.js';

export class TimeController {
  constructor(initialDateStr = '2024-01-01') {
    this._date      = new Date(initialDateStr + 'T12:00:00Z');
    this._speedDays = 0;      // days per real second
    this._T         = dateToDays(this._date); // days since J2000
  }

  // ── Getters ─────────────────────────────────────────────────────────────

  /** Days since J2000 (the value ephemeris functions consume). */
  get T() { return this._T; }

  get speed() { return this._speedDays; }

  getFormattedDate() {
    return this._date.toISOString().substring(0, 10);
  }

  getDate() { return new Date(this._date); }

  // ── Setters ─────────────────────────────────────────────────────────────

  setDate(dateStr) {
    this._date = new Date(dateStr + 'T12:00:00Z');
    this._T    = dateToDays(this._date);
  }

  setSpeed(daysPerSecond) {
    this._speedDays = daysPerSecond;
  }

  /** Jump ahead (or back) by a fixed number of days. */
  addDays(days) {
    this._date = new Date(this._date.getTime() + days * 86_400_000);
    this._T    = dateToDays(this._date);
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  /** Call once per animation frame with the elapsed wall-clock seconds. */
  update(deltaSeconds) {
    if (this._speedDays !== 0) {
      this.addDays(this._speedDays * deltaSeconds);
    }
  }
}
