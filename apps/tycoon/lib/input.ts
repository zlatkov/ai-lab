import type { Game } from './game';
import { TILE_SIZE } from './constants';
import { lineTiles } from './game';

export class InputHandler {
  private game: Game;
  private keys = new Set<string>();
  private isDragging = false;
  private dragStart: { sx: number; sy: number; cx: number; cy: number } | null = null;
  private isPainting = false;
  private lastPaintTile: { x: number; y: number } | null = null;
  private rafPan: number | null = null;
  private pinchStartDist = 0;
  private pinchStartZoom = 1;
  private pointerDownAt: { sx: number; sy: number; t: number } | null = null;

  constructor(game: Game) { this.game = game; }

  attach() {
    const c = this.game.canvas;
    c.addEventListener('mousedown', this.onMouseDown);
    c.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    c.addEventListener('mouseleave', this.onMouseLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', this.onContextMenu);
    c.addEventListener('touchstart', this.onTouchStart, { passive: false });
    c.addEventListener('touchmove', this.onTouchMove, { passive: false });
    c.addEventListener('touchend', this.onTouchEnd);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.startKeyPanLoop();
  }

  detach() {
    const c = this.game.canvas;
    c.removeEventListener('mousedown', this.onMouseDown);
    c.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    c.removeEventListener('mouseleave', this.onMouseLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContextMenu);
    c.removeEventListener('touchstart', this.onTouchStart);
    c.removeEventListener('touchmove', this.onTouchMove);
    c.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    if (this.rafPan !== null) cancelAnimationFrame(this.rafPan);
  }

  private localXY(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.game.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    const [sx, sy] = this.localXY(e);
    this.pointerDownAt = { sx, sy, t: performance.now() };

    if (e.button === 1 || (e.button === 0 && (e.shiftKey || e.altKey))) {
      this.isDragging = true;
      this.dragStart = { sx, sy, cx: this.game.camera.x, cy: this.game.camera.y };
      this.game.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 2) {
      if (this.game.buildMode) {
        this.game.setBuildMode(null);
      }
      return;
    }

    if (e.button === 0) {
      const [tx, ty] = this.game.screenToTile(sx, sy);
      const mode = this.game.buildMode;
      if (mode?.kind === 'infra') {
        this.isPainting = true;
        this.lastPaintTile = { x: tx, y: ty };
        this.game.tryPlaceInfra(tx, ty);
      } else if (mode?.kind === 'demolish') {
        this.isPainting = true;
        this.lastPaintTile = { x: tx, y: ty };
        this.game.tryDemolish(tx, ty);
      } else if (mode?.kind === 'building') {
        this.game.tryPlaceBuilding(tx, ty);
      }
      // Don't select on mousedown — wait for mouseup so dragging doesn't select
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    const [sx, sy] = this.localXY(e);

    if (this.isDragging && this.dragStart) {
      const ts = TILE_SIZE * this.game.camera.zoom;
      this.game.camera.x = this.dragStart.cx - (sx - this.dragStart.sx) / ts;
      this.game.camera.y = this.dragStart.cy - (sy - this.dragStart.sy) / ts;
      return;
    }

    const [tx, ty] = this.game.screenToTile(sx, sy);
    this.game.hover = { x: tx, y: ty };

    if (this.isPainting) {
      const mode = this.game.buildMode;
      if (mode?.kind === 'infra' && this.lastPaintTile) {
        for (const [px, py] of lineTiles(this.lastPaintTile.x, this.lastPaintTile.y, tx, ty)) {
          this.game.tryPlaceInfra(px, py);
        }
        this.lastPaintTile = { x: tx, y: ty };
      } else if (mode?.kind === 'demolish') {
        this.game.tryDemolish(tx, ty);
      }
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0 && this.pointerDownAt && !this.isDragging && !this.isPainting && !this.game.buildMode) {
      const [sx, sy] = this.localXY(e);
      const dist = Math.hypot(sx - this.pointerDownAt.sx, sy - this.pointerDownAt.sy);
      if (dist < 5) {
        const [tx, ty] = this.game.screenToTile(sx, sy);
        this.game.selectAt(tx, ty);
      }
    }
    this.isDragging = false;
    this.isPainting = false;
    this.dragStart = null;
    this.lastPaintTile = null;
    this.pointerDownAt = null;
    this.game.canvas.style.cursor = this.game.buildMode ? 'crosshair' : 'default';
  };

  private onMouseLeave = () => {
    this.game.hover = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const [sx, sy] = this.localXY(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.game.zoomBy(factor, [sx, sy]);
  };

  private onContextMenu = (e: Event) => { e.preventDefault(); };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.keys.add(e.key.toLowerCase());

    if (e.key === 'Escape') {
      this.game.setBuildMode(null);
      this.game.selected = null;
      this.game.onSelect(null);
    } else if (e.key === ' ') {
      e.preventDefault();
      this.game.togglePause();
    } else if (e.key === '1') this.game.setSpeed(1);
    else if (e.key === '2') this.game.setSpeed(2);
    else if (e.key === '3') this.game.setSpeed(5);
    else if (e.key === '+' || e.key === '=') this.game.zoomBy(1.15);
    else if (e.key === '-' || e.key === '_') this.game.zoomBy(1 / 1.15);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private startKeyPanLoop = () => {
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const speed = 12 / Math.max(0.4, this.game.camera.zoom);
      let dx = 0, dy = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        this.game.panBy((dx / len) * speed * dt, (dy / len) * speed * dt);
      }
      this.rafPan = requestAnimationFrame(step);
    };
    this.rafPan = requestAnimationFrame(step);
  };

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const [sx, sy] = this.localXY(t);
      this.pointerDownAt = { sx, sy, t: performance.now() };
      const mode = this.game.buildMode;
      if (mode?.kind === 'building') {
        const [tx, ty] = this.game.screenToTile(sx, sy);
        this.game.tryPlaceBuilding(tx, ty);
      } else if (mode?.kind === 'infra') {
        const [tx, ty] = this.game.screenToTile(sx, sy);
        this.isPainting = true;
        this.lastPaintTile = { x: tx, y: ty };
        this.game.tryPlaceInfra(tx, ty);
      } else if (mode?.kind === 'demolish') {
        const [tx, ty] = this.game.screenToTile(sx, sy);
        this.isPainting = true;
        this.game.tryDemolish(tx, ty);
      } else {
        this.isDragging = true;
        this.dragStart = { sx, sy, cx: this.game.camera.x, cy: this.game.camera.y };
      }
    } else if (e.touches.length === 2) {
      this.isDragging = false;
      this.isPainting = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.pinchStartDist = Math.hypot(dx, dy);
      this.pinchStartZoom = this.game.camera.zoom;
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const [sx, sy] = this.localXY(t);
      if (this.isDragging && this.dragStart) {
        const ts = TILE_SIZE * this.game.camera.zoom;
        this.game.camera.x = this.dragStart.cx - (sx - this.dragStart.sx) / ts;
        this.game.camera.y = this.dragStart.cy - (sy - this.dragStart.sy) / ts;
      } else if (this.isPainting) {
        const [tx, ty] = this.game.screenToTile(sx, sy);
        const mode = this.game.buildMode;
        if (mode?.kind === 'infra' && this.lastPaintTile) {
          for (const [px, py] of lineTiles(this.lastPaintTile.x, this.lastPaintTile.y, tx, ty)) {
            this.game.tryPlaceInfra(px, py);
          }
          this.lastPaintTile = { x: tx, y: ty };
        } else if (mode?.kind === 'demolish') {
          this.game.tryDemolish(tx, ty);
        }
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (this.pinchStartDist > 0) {
        const factor = (dist / this.pinchStartDist) / (this.game.camera.zoom / this.pinchStartZoom);
        this.game.zoomBy(factor);
      }
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0 && this.pointerDownAt && !this.isDragging && !this.isPainting && !this.game.buildMode) {
      // Tap select
      const [sx, sy] = [this.pointerDownAt.sx, this.pointerDownAt.sy];
      const [tx, ty] = this.game.screenToTile(sx, sy);
      this.game.selectAt(tx, ty);
    }
    this.isDragging = false;
    this.isPainting = false;
    this.dragStart = null;
    this.lastPaintTile = null;
    this.pointerDownAt = null;
  };
}
