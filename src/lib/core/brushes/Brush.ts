import * as PIXI from 'pixi.js';

// Based on Procreate's Brush Studio settings

export interface BrushShape {
  texture: PIXI.Texture;
  grainTexture: PIXI.Texture;
  // Future properties: roundness, angle, etc.
}

export interface BrushStrokePath {
  spacing: number; // Percentage of brush size
  jitter: number;  // Percentage of brush size
  falloff: number; // Taper falloff
}

export interface BrushGrain {
  scale: number;    // Scale of the grain texture
  intensity: number; // How strong the grain effect is
  rotation: number;  // Rotation of the grain texture
}

export class Brush {
  public shape: BrushShape;
  public stroke: BrushStrokePath;
  public grain: BrushGrain;
  public size: number;
  public color: string;
  public alpha: number;
  // ... other top-level properties from Procreate (Rendering, Wet Mix, etc.)

  constructor() {
    // --- Default Brush Settings ---

    this.shape = {
      texture: PIXI.Texture.EMPTY,
      grainTexture: PIXI.Texture.EMPTY,
    };

    this.stroke = {
      spacing: 0.05, // Denser spacing for smoother strokes
      jitter: 0,     // No jitter
      falloff: 0,    // No taper
    };

    this.grain = {
      scale: 1.0,    // 100% scale
      intensity: 0.5, // 50% intensity
      rotation: 0,   // No rotation
    };

    this.size = 50;
    this.color = '#000000';
    this.alpha = 1.0;
  }

  public async loadTexture(shapeUrl: string, grainUrl?: string) {
    this.shape.texture = await PIXI.Assets.load(shapeUrl);
    
    if (grainUrl) {
      try {
        this.shape.grainTexture = await PIXI.Assets.load(grainUrl);
      } catch (e) {
        console.warn("Could not load grain texture, using empty texture.", e);
        this.shape.grainTexture = PIXI.Texture.EMPTY;
      }
    }
  }

  public async loadGrainTexture(grainUrl: string) {
    this.shape.grainTexture = await PIXI.Assets.load(grainUrl);
  }
} 