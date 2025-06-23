<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as PIXI from 'pixi.js';
  import { InputManager } from '$lib/core/InputManager';
  import { Brush } from '$lib/core/brushes/Brush';
  import { catmullRomPoint, catmullRomLength } from '$lib/core/math/Spline';

  // --- Props ---
  // These will soon be controlled by a settings panel
  export let color: string = '#000000';
  export let size: number = 50;

  // --- Component State ---
  let canvasContainer: HTMLDivElement;

  // --- PIXI State ---
  let app: PIXI.Application;
  let inputManager: InputManager;
  let isDrawing = false;
  
  // --- Brush Engine ---
  let brush: Brush;
  let pathPoints: PIXI.Point[] = [];
  let pressurePoints: number[] = [];
  
  // Stamping and Flattening state
  const trail: PIXI.Sprite[] = []; // Holds the sprites for the current stroke
  let permanentSprite: PIXI.Sprite; // Holds the flattened texture of all previous strokes
  let flattenTimeout: any;

  // --- Lifecycle ---
  onMount(async () => {
    app = new PIXI.Application();
    await app.init({
      resizeTo: window,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      backgroundColor: 0xffffff,
      preference: 'webgpu',
    });

    canvasContainer.appendChild(app.canvas);
    
    permanentSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
    app.stage.addChild(permanentSprite);

    brush = new Brush();
    try {
      // Try to load both shape and grain textures
      await brush.loadTexture('/brushes/brush_01.png');
      // Optionally try to load a grain texture
      // await brush.loadGrainTexture('/brushes/grain_01.png');
    } catch (e) {
      console.warn("Could not load image brush, falling back to generated brush.", e);
      brush.shape.texture = createFallbackBrushTexture(app.renderer, 100);
    }

    inputManager = new InputManager(app);
    inputManager.on('start', onDrawStart);
    inputManager.on('move', onDrawMove);
    inputManager.on('end', onDrawEnd);
  });

  onDestroy(() => {
    inputManager?.destroy();
    app?.destroy(true, { children: true, texture: true });
    clearTimeout(flattenTimeout);
  });

  $: if (brush) {
    brush.color = color;
    brush.size = size;
  }

  // --- Drawing Logic ---

  function onDrawStart(event: PIXI.FederatedPointerEvent) {
    isDrawing = true;
    pathPoints = [event.global.clone()];
    pressurePoints = [event.pressure];
    // Remove the immediate stamp - let the spline system handle all drawing
  }

  function onDrawMove(event: PIXI.FederatedPointerEvent) {
    if (!isDrawing) return;

    const newPoint = event.global.clone();
    const lastPoint = pathPoints[pathPoints.length - 1];
    if (Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y) < 4) return;
    
    pathPoints.push(newPoint);
    pressurePoints.push(event.pressure);

    // Start drawing immediately when we have 2 points
    if (pathPoints.length === 2) {
      // For the first segment, use the first point as both p0 and p1
      const p0 = pathPoints[0];
      const p1 = pathPoints[0];
      const p2 = pathPoints[1];
      const p3 = pathPoints[1];
      
      const pressure1 = pressurePoints[0];
      const pressure2 = pressurePoints[1];

      drawSplineSegment(p0, p1, p2, p3, pressure1, pressure2);
      return;
    }

    const i = pathPoints.length - 2;
    if (i < 1) return;

    const p0 = pathPoints[i - 1] || pathPoints[i];
    const p1 = pathPoints[i];
    const p2 = pathPoints[i + 1];
    const p3 = pathPoints[i + 2] || p2;
    
    const pressure1 = pressurePoints[i];
    const pressure2 = pressurePoints[i + 1];

    drawSplineSegment(p0, p1, p2, p3, pressure1, pressure2);
  }
  
  function onDrawEnd() {
    if (isDrawing && pathPoints.length > 1) {
      const i = pathPoints.length - 2;
      const p0 = pathPoints[i - 1] || pathPoints[i];
      const p1 = pathPoints[i];
      const p2 = pathPoints[i + 1] || p1;
      const p3 = p2;
      const pressure1 = pressurePoints[i];
      const pressure2 = pressurePoints[i+1] || pressure1;
      drawSplineSegment(p0, p1, p2, p3, pressure1, pressure2);
    }
    isDrawing = false;
    pathPoints = [];
    pressurePoints = [];
    scheduleFlatten();
  }
  
  function drawSplineSegment(p0: PIXI.Point, p1: PIXI.Point, p2: PIXI.Point, p3: PIXI.Point, pressure1: number, pressure2: number) {
    const segmentLength = catmullRomLength(p0, p1, p2, p3);
    const avgPressure = (pressure1 + pressure2) / 2;
    const actualPressure = avgPressure > 0 ? avgPressure : 0.5;
    const brushSize = brush.size * actualPressure;
    const spacing = Math.max(1, brushSize * brush.stroke.spacing);
    const numSteps = Math.max(1, Math.ceil(segmentLength / spacing));

    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const pointOnSpline = catmullRomPoint(t, p0, p1, p2, p3);
      const interpolatedPressure = pressure1 + (pressure2 - pressure1) * t;
      paintBrush(pointOnSpline.x, pointOnSpline.y, interpolatedPressure);
    }
  }

  // Creates and adds a single brush stamp to the stage
  function paintBrush(x: number, y: number, pressure: number) {
    const actualPressure = pressure > 0 ? pressure : 0.5;
    const stampSize = brush.size * actualPressure;

    const stamp = new PIXI.Sprite(brush.shape.texture);
    stamp.anchor.set(0.5);
    
    const jitter = stampSize * brush.stroke.jitter;
    const randomX = x + (Math.random() - 0.5) * jitter;
    const randomY = y + (Math.random() - 0.5) * jitter;
    stamp.position.set(randomX, randomY);
    
    stamp.width = stamp.height = stampSize;
    stamp.alpha = Math.max(0.2, actualPressure * brush.alpha);
    
    // Apply color using ColorMatrixFilter for better color control
    const colorHex = parseInt(brush.color.replace(/^#/, ''), 16);
    const r = ((colorHex >> 16) & 0xFF) / 255;
    const g = ((colorHex >> 8) & 0xFF) / 255;
    const b = (colorHex & 0xFF) / 255;
    
    const filters = [];
    
    // Create a color matrix that replaces the texture color with our desired color
    const colorMatrix = new PIXI.ColorMatrixFilter();
    colorMatrix.matrix = [
      0, 0, 0, 0, r,  // Red channel
      0, 0, 0, 0, g,  // Green channel
      0, 0, 0, 0, b,  // Blue channel
      0, 0, 0, 1, 0   // Alpha channel (preserve original alpha)
    ];
    filters.push(colorMatrix);
    
    // Apply grain texture if available
    if (brush.shape.grainTexture && brush.shape.grainTexture !== PIXI.Texture.EMPTY) {
      // Create a grain sprite for texture overlay
      const grainSprite = new PIXI.Sprite(brush.shape.grainTexture);
      grainSprite.anchor.set(0.5);
      grainSprite.position.set(randomX, randomY);
      grainSprite.width = stampSize * brush.grain.scale;
      grainSprite.height = stampSize * brush.grain.scale;
      grainSprite.rotation = brush.grain.rotation;
      grainSprite.alpha = brush.grain.intensity;
      grainSprite.blendMode = 'multiply'; // Blend with the brush shape
      
      // Add grain sprite first, then the main stamp
      app.stage.addChild(grainSprite);
      trail.push(grainSprite);
    }
    
    stamp.filters = filters;
    app.stage.addChild(stamp);
    trail.push(stamp);
  }

  // --- Flattening Logic ---

  function scheduleFlatten() {
    if (flattenTimeout) clearTimeout(flattenTimeout);
    flattenTimeout = setTimeout(flatten, 500);
  }

  function flatten() {
    const renderTexture = app.renderer.generateTexture({ target: app.stage });
    permanentSprite.texture = renderTexture;

    while (trail.length) {
      const sprite = trail.pop();
      if (sprite) {
        sprite.destroy();
      }
    }
  }

  // --- Utility Functions ---
  
  function createFallbackBrushTexture(renderer: PIXI.Renderer, size: number): PIXI.Texture {
    const graphics = new PIXI.Graphics();
    graphics.circle(size/2, size/2, size/2);
    graphics.fill({ color: 0xffffff }); // Use white as the base for tinting
    const texture = renderer.generateTexture({target: graphics, resolution: window.devicePixelRatio});
    graphics.destroy();
    return texture;
  }

  // --- Public API ---
  export function clear() {
    permanentSprite.texture = PIXI.Texture.EMPTY;

    while (trail.length) {
      const sprite = trail.pop();
      if (sprite) {
        sprite.destroy();
      }
    }
  }

</script>

<div class="canvas-wrapper" bind:this={canvasContainer} />

<style>
  .canvas-wrapper {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    cursor: crosshair;
  }
</style> 