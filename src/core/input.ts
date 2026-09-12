/**
 * Entrées du dresseur. Clavier et tactile alimentent le même vecteur de
 * direction, pour que le reste du code ignore d'où vient le mouvement.
 */

import { Vector2 } from 'three';

/**
 * Déplacement du dresseur : ZQSD et les flèches, rien d'autre.
 *
 * W et A ont été retirés. Ils doublaient Z et Q pour les claviers QWERTY,
 * mais A est désormais une commande de caméra : sur AZERTY, faire pivoter la
 * vue déplaçait donc le dresseur vers la gauche en même temps.
 */
const KEY_AXES: Record<string, [number, number]> = {
  KeyZ: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyQ: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export class InputState {
  /** Direction souhaitée, normalisée. x = est/ouest, y = nord/sud. */
  readonly move = new Vector2();
  /** Position du curseur en coordonnées normalisées (-1..1), pour le raycast. */
  readonly pointer = new Vector2();
  pointerInside = false;

  private readonly pressed = new Set<string>();
  private actionListeners: Array<() => void> = [];
  private clickListeners: Array<(button: number) => void> = [];
  private joystick: { active: boolean; origin: Vector2; current: Vector2 } = {
    active: false, origin: new Vector2(), current: new Vector2(),
  };

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Appelée quand le joueur déclenche son action principale (espace / bouton). */
  onAction(fn: () => void): void {
    this.actionListeners.push(fn);
  }

  onClick(fn: (button: number) => void): void {
    this.clickListeners.push(fn);
  }

  /**
   * Oublie les abonnés sans lâcher le clavier.
   *
   * Entre deux manches, le jeu est détruit et recréé : sans cela, l'ancienne
   * partie continuerait de recevoir les clics.
   */
  reset(): void {
    this.actionListeners = [];
    this.clickListeners = [];
    this.pressed.clear();
    this.move.set(0, 0);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.actionListeners = [];
    this.clickListeners = [];
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Space') {
      e.preventDefault();
      for (const fn of this.actionListeners) fn();
      return;
    }
    if (KEY_AXES[e.code]) {
      this.pressed.add(e.code);
      this.recompute();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.pressed.delete(e.code)) this.recompute();
  };

  private onBlur = (): void => {
    this.pressed.clear();
    this.joystick.active = false;
    this.recompute();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.element.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.pointerInside = true;
    if (this.joystick.active) {
      this.joystick.current.set(e.clientX, e.clientY);
      this.recompute();
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    for (const fn of this.clickListeners) fn(e.button);
    if (e.pointerType === 'touch') {
      this.joystick.active = true;
      this.joystick.origin.set(e.clientX, e.clientY);
      this.joystick.current.copy(this.joystick.origin);
    }
  };

  private onPointerUp = (): void => {
    this.joystick.active = false;
    this.recompute();
  };

  private onPointerLeave = (): void => {
    this.pointerInside = false;
  };

  private recompute(): void {
    if (this.joystick.active) {
      // Rayon mort de 12 px, saturation à 70 px.
      const dx = this.joystick.current.x - this.joystick.origin.x;
      const dy = this.joystick.current.y - this.joystick.origin.y;
      const len = Math.hypot(dx, dy);
      if (len < 12) this.move.set(0, 0);
      else this.move.set(dx / len, dy / len).multiplyScalar(Math.min(1, len / 70));
      return;
    }
    this.move.set(0, 0);
    for (const code of this.pressed) {
      const axis = KEY_AXES[code];
      if (axis) this.move.x += axis[0], this.move.y += axis[1];
    }
    if (this.move.lengthSq() > 1) this.move.normalize();
  }
}
