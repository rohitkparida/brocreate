import { Application, FederatedPointerEvent } from 'pixi.js';
import { EventEmitter } from '@pixi/utils';

type InputEvent = 'start' | 'move' | 'end';

export class InputManager extends EventEmitter<InputEvent> {
  private app: Application;

  constructor(app: Application) {
    super();
    this.app = app;

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on('pointerdown', this.onPointerDown);
    this.app.stage.on('pointerup', this.onPointerUp);
    this.app.stage.on('pointerupoutside', this.onPointerUp);
    this.app.stage.on('pointermove', this.onPointerMove);
  }

  private onPointerDown = (event: FederatedPointerEvent) => {
    this.emit('start', event);
  };

  private onPointerMove = (event: FederatedPointerEvent) => {
    this.emit('move', event);
  };

  private onPointerUp = (event: FederatedPointerEvent) => {
    this.emit('end', event);
  };

  public destroy(): void {
    this.app.stage.off('pointerdown', this.onPointerDown);
    this.app.stage.off('pointerup', this.onPointerUp);
    this.app.stage.off('pointerupoutside', this.onPointerUp);
    this.app.stage.off('pointermove', this.onPointerMove);
    this.removeAllListeners();
  }
} 