/** Fixed, frame-independent simulation with bounded catch-up and render interpolation.
 * Never increase the solver dt after a stall: discard overdue whole ticks instead.
 */
export class PhysicsClock {
  readonly step = 1 / 60;
  readonly maxSteps = 2;
  readonly budgetMs = 6;
  accumulator = 0;
  private steps = 0;
  private started = 0;
  begin(delta: number, now: number) {
    this.steps = 0;
    this.started = now;
    if (Number.isFinite(delta) && delta > 0) {
      const total=this.accumulator+delta;
      // Discard only whole overdue ticks; preserve the render interpolation phase.
      const ticks=Math.floor((total+1e-10)/this.step);
      this.accumulator=total-Math.max(0,ticks-this.maxSteps)*this.step;
    }
  }
  take(now: number) {
    if (this.accumulator + 1e-10 < this.step) return false;
    if (this.steps >= this.maxSteps || (this.steps > 0 && now - this.started >= this.budgetMs)) {
      this.accumulator %= this.step;
      return false;
    }
    this.accumulator = Math.max(0, this.accumulator - this.step);
    this.steps++;
    return true;
  }
  get alpha() { return Math.min(1, this.accumulator / this.step); }
  reset() { this.accumulator = 0; this.steps = 0; }
}
