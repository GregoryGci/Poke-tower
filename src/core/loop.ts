/**
 * Boucle de jeu à pas fixe.
 *
 * La logique avance par pas constants (TICK_RATE), le rendu interpole entre
 * deux pas. C'est ce qui garantit qu'une vague se déroule identiquement quel
 * que soit le framerate — et c'est indispensable le jour où les raids devront
 * synchroniser deux joueurs.
 */

export const TICK_RATE = 30;
export const TICK_SECONDS = 1 / TICK_RATE;

/** Au-delà, on abandonne le rattrapage : l'onglet était en arrière-plan. */
const MAX_CATCHUP_TICKS = 5;

export interface LoopHandlers {
  /** Logique de jeu, appelée avec un pas constant. */
  update(dt: number, tick: number): void;
  /** Rendu. `alpha` vaut 0..1 : la position entre le tick précédent et le suivant. */
  render(alpha: number): void;
}

export class GameLoop {
  private running = false;
  private accumulator = 0;
  private lastTime = 0;
  private frame = 0;
  tick = 0;

  /**
   * Vitesse de simulation.
   *
   * On multiplie le temps accumulé, pas la taille du pas : la logique avance
   * donc simplement plus de fois par image, et reste identique à elle-même.
   * Doubler dt aurait fait diverger la simulation.
   */
  speed = 1;

  constructor(private readonly handlers: LoopHandlers) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.frame = requestAnimationFrame(this.step);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private step = (now: number): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.step);

    const elapsed = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.accumulator += Math.min(elapsed * this.speed, MAX_CATCHUP_TICKS * this.speed * TICK_SECONDS);

    while (this.accumulator >= TICK_SECONDS) {
      this.handlers.update(TICK_SECONDS, this.tick);
      this.tick++;
      this.accumulator -= TICK_SECONDS;
    }

    this.handlers.render(this.accumulator / TICK_SECONDS);
  };
}
