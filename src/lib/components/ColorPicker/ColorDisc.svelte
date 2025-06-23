<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { oklchToHex, hexToOklch, oklchToRgb, createOklchColor, degToRad, getPosFromDegAndRadius } from './colorUtils';
  
  export let size: number = 300;
  export let color: string = '#ff0000';
  
  const dispatch = createEventDispatcher<{ colorChange: string }>();
  
  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let ctx: CanvasRenderingContext2D;
  
  let huePicker: HTMLDivElement;
  let wheelPicker: HTMLDivElement;
  
  // OKLCH State - using proper OKLCH terminology
  let hue = 0;        // 0-360 degrees
  let chroma = 0.25;  // 0-0.4 (typical range)
  let lightness = 65; // 0-100 percent
  let isDragging = false;
  let dragTarget: 'hue' | 'wheel' | null = null;
  
  // Expansion state for accessing full color gamut
  let isExpanded = false;
  let expandTimer: number | null = null;
  let animationProgress = 0; // 0 = circle, 1 = square
  let animationFrame: number | null = null;
  
  // Track mouse position for dot updates after animation
  let lastMousePos: { x: number, y: number } | null = null;
  
  // Dot animation state
  let dotAnimationStart: { chroma: number, lightness: number } | null = null;
  let dotAnimationTarget: { chroma: number, lightness: number } | null = null;
  
  // Store dot visual position during retraction to prevent blipping
  let dotVisualPosition: { x: number, y: number } | null = null;
  
  // Calculated dimensions
  $: padding = size * 0.05;
  $: half = size / 2;
  $: hueRingOuterR = half - padding;
  $: hueRingInnerR = hueRingOuterR * 0.75;
  $: hueRingWidth = hueRingOuterR - hueRingInnerR;
  $: wheelR = hueRingInnerR * 0.85;
  $: pickerSize = size / 40;
  
  onMount(() => {
    initCanvas();
    parseInitialColor();
    draw();
    setupEventListeners();
  });
  
  function initCanvas() {
    ctx = canvas.getContext('2d')!;
    canvas.width = size;
    canvas.height = size;
    ctx.translate(half, half);
  }
  
  function parseInitialColor() {
    const oklch = hexToOklch(color);
    hue = oklch.h;
    chroma = oklch.c;
    lightness = oklch.l;
  }
  
  // Unified OKLCH color calculation - single source of truth
  function getOklchAtPosition(canvasX: number, canvasY: number): { l: number, c: number, h: number } {
    // Map x position to chroma (left = gray, right = colorful)
    const normalizedChroma = Math.max(0, Math.min(1, (canvasX + wheelR) / (wheelR * 2)));
    const c = normalizedChroma * 0.25; // Scale to 0-0.25 chroma range
    
    // Map y position to lightness (top = bright, bottom = dark)
    const normalizedLightness = Math.max(0, Math.min(1, (wheelR - canvasY) / (wheelR * 2)));
    const l = normalizedLightness * 100; // Scale to 0-100 lightness range
    
    return { l, c, h: hue };
  }
  
  function draw() {
    // Clear canvas
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-half, -half, size, size);
    
    // Draw chromaticity wheel first (with masking)
    drawChromaticityWheel();
    
    // Draw hue ring after masking (so it's not affected)
    drawHueRing();
    
    updatePickers();
  }
  
  function drawHueRing() {
    // Fade out during expansion
    const ringOpacity = 1 - animationProgress;
    
    if (ringOpacity <= 0) return; // Don't draw if fully transparent
    
    ctx.save();
    ctx.globalAlpha = ringOpacity;

    // Create a conic gradient centered at (0,0), starting from the right (0 radians)
    const gradient = ctx.createConicGradient(0, 0, 0);

    // Add color stops for each degree of the hue wheel for a perfectly smooth gradient
    const stops = 360;
    for (let i = 0; i <= stops; i++) {
        const h = (i / stops) * 360;
        // Use the same LCh values as before for consistency
        const rgb = oklchToRgb(70, 0.25, h); 
        const color = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        // The stop position is a value between 0.0 and 1.0
        gradient.addColorStop(i / stops, color);
    }

    // Set the fill style to our new gradient
    ctx.fillStyle = gradient;

    // Draw the ring shape by creating a "donut"
    ctx.beginPath();
    // Draw the outer circle
    ctx.arc(0, 0, hueRingOuterR, 0, Math.PI * 2);
    // Create the inner cutout by drawing a counter-clockwise arc
    ctx.arc(0, 0, hueRingInnerR, 0, Math.PI * 2, true); 
    ctx.fill();

    ctx.restore();
  }
  
  function drawChromaticityWheel() {
    // Draw chromaticity wheel using optimized OKLCH gradient strips
    ctx.save();
    
    // Draw using vertical strips for better performance while maintaining OKLCH accuracy
    const stripWidth = 1; // Draw in 1-pixel wide strips for a seamless gradient
    
    for (let x = -wheelR; x < wheelR; x += stripWidth) {
      // Create vertical gradient for this strip
      const gradient = ctx.createLinearGradient(0, -wheelR, 0, wheelR);
      
      // Sample OKLCH colors at top, middle, and bottom of strip
      const topOklch = getOklchAtPosition(x, -wheelR);
      const midOklch = getOklchAtPosition(x, 0);
      const bottomOklch = getOklchAtPosition(x, wheelR);
      
      const topRgb = oklchToRgb(topOklch.l, topOklch.c, topOklch.h);
      const midRgb = oklchToRgb(midOklch.l, midOklch.c, midOklch.h);
      const bottomRgb = oklchToRgb(bottomOklch.l, bottomOklch.c, bottomOklch.h);
      
      gradient.addColorStop(0, `rgb(${topRgb.r}, ${topRgb.g}, ${topRgb.b})`);
      gradient.addColorStop(0.5, `rgb(${midRgb.r}, ${midRgb.g}, ${midRgb.b})`);
      gradient.addColorStop(1, `rgb(${bottomRgb.r}, ${bottomRgb.g}, ${bottomRgb.b})`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, -wheelR, stripWidth, wheelR * 2);
    }
    
    // Apply circular mask that expands during animation
    if (animationProgress < 1) {
      // Calculate expanding mask radius
      const maxRadius = wheelR * Math.sqrt(2); // Diagonal distance to fully reveal square
      const currentMaskRadius = wheelR + (animationProgress * (maxRadius - wheelR));
      
      // Create mask using destination-in composite operation
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.arc(0, 0, currentMaskRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    
    // Draw border for expanded mode
    if (animationProgress > 0) {
      ctx.strokeStyle = `rgba(102, 102, 102, ${animationProgress})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(-wheelR, -wheelR, wheelR * 2, wheelR * 2);
    }
    
    ctx.restore();
  }
  
  function updatePickers() {
    if (!huePicker || !wheelPicker) return;
    
    // Position hue picker
    const huePickerRadius = hueRingOuterR - hueRingWidth / 2;
    const huePos = getPosFromDegAndRadius(hue, huePickerRadius);
    huePicker.style.left = `${half + huePos.x - hueRingWidth / 2}px`;
    huePicker.style.top = `${half + huePos.y - hueRingWidth / 2}px`;
    
    const hueRgb = oklchToRgb(70, 0.25, hue);
    huePicker.style.backgroundColor = `rgb(${hueRgb.r}, ${hueRgb.g}, ${hueRgb.b})`;
    
    // Fade out hue picker during expansion
    const hueOpacity = 1 - animationProgress;
    huePicker.style.opacity = hueOpacity.toString();
    huePicker.style.pointerEvents = hueOpacity > 0 ? 'auto' : 'none';
    
    // Position chromaticity picker
    const wheelPos = getWheelPosition(chroma, lightness);
    wheelPicker.style.left = `${half + wheelPos.x - pickerSize}px`;
    wheelPicker.style.top = `${half + wheelPos.y - pickerSize}px`;
    
    const currentRgb = oklchToRgb(lightness, chroma, hue);
    wheelPicker.style.backgroundColor = `rgb(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b})`;
  }
  
  function getWheelPosition(c: number, l: number): { x: number, y: number } {
    // If we're animating during retraction, use stored visual position
    if (dotVisualPosition && animationProgress > 0) {
      return dotVisualPosition;
    }
    
    // Map chroma (0-0.25) to x position (left = 0, right = max)
    const x = ((c / 0.25) * wheelR * 2) - wheelR;  // -wheelR to +wheelR
    
    // Map lightness (0-100) to y position (top = bright, bottom = dark)
    const y = wheelR - ((l / 100) * wheelR * 2);   // wheelR to -wheelR (inverted)
    
    // Only constrain to circle when not expanded
    if (!isExpanded && animationProgress < 0.5) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > wheelR) {
        const scale = wheelR / distance;
        return { x: x * scale, y: y * scale };
      }
    }
    
    // When expanded or expanding, allow full square movement
    return { x, y };
  }
  
  function setupEventListeners() {
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('touchstart', handleMouseDown);
    
    huePicker.addEventListener('mousedown', handleHueDragStart);
    huePicker.addEventListener('touchstart', handleHueDragStart);

    // Global mouse/touch events for continuous dragging
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
  }
  
  function handleHueDragStart(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    e.stopPropagation(); // Prevent canvas handler from also firing

    isDragging = true;
    dragTarget = 'hue';
    updateHue(e);
    
    // Add document-level listeners for dragging
    document.addEventListener('mousemove', updateHue);
    document.addEventListener('touchmove', updateHue);
  }
  
  function handleMouseDown(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    const pos = getCanvasPosition(e);
    const x = pos.x - half;
    const y = pos.y - half;
    const distance = Math.sqrt(x * x + y * y);
    
    // Only allow hue ring interaction when it's visible (not during expansion)
    if (distance >= hueRingInnerR && distance <= hueRingOuterR && animationProgress < 0.1) {
      isDragging = true;
      dragTarget = 'hue';
      updateHue(e);
      // Add event listeners for dragging
      document.addEventListener('mousemove', updateHue);
      document.addEventListener('touchmove', updateHue);
    } else if (distance <= wheelR || isExpanded) { // Simplified condition
      isDragging = true;
      dragTarget = 'wheel';
      updateWheel(e);
      // Add event listeners for dragging
      document.addEventListener('mousemove', updateWheel);
      document.addEventListener('touchmove', updateWheel);
    }
  }
  
  function handleMouseMove(e: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    
    e.preventDefault();
    if (dragTarget === 'hue') {
      updateHue(e);
    } else if (dragTarget === 'wheel') {
      updateWheel(e);
    }
  }
  
  function handleMouseUp() {
    if (!isDragging) return;
    
    isDragging = false;
    dragTarget = null;
    document.removeEventListener('mousemove', updateHue);
    document.removeEventListener('touchmove', updateHue);
    document.removeEventListener('mousemove', updateWheel);
    document.removeEventListener('touchmove', updateWheel);
    
    // Handle dot animation on mouse up if retracting
    if (dotAnimationStart && !isExpanded) {
      dotVisualPosition = getWheelPosition(chroma, lightness);
      // The original code started an animation here, but the function was removed.
      // We will re-evaluate if this animation is needed. For now, it's removed to fix the error.
    }
  }
  
  function updateHue(e: MouseEvent | TouchEvent) {
    const pos = getCanvasPosition(e);
    const x = pos.x - half;
    const y = pos.y - half;
    const angle = Math.atan2(y, x) * 180 / Math.PI;
    hue = angle < 0 ? angle + 360 : angle;
    draw();
    emitColorChange();
  }
  
  function updateWheel(e: MouseEvent | TouchEvent) {
    const pos = getCanvasPosition(e);
    const x = pos.x - half;
    const y = pos.y - half;
    const distance = Math.sqrt(x * x + y * y);
    
    // Track mouse position for animation completion updates
    lastMousePos = { x, y };
    
    // Track mouse position for animation completion updates
    lastMousePos = { x, y };
    
    // Handle expansion logic
    const isAtEdge = !isExpanded && distance > wheelR * 0.9; // Near edge threshold
    
    if (isAtEdge && !expandTimer) {
      // Start expansion timer when near edge - 0.75 seconds
      expandTimer = window.setTimeout(() => {
        isExpanded = true;
        animateToSquare();
      }, 750);
    } else if (!isAtEdge && expandTimer) {
      // Cancel expansion timer if moved away from edge
      clearTimeout(expandTimer);
      expandTimer = null;
    }
    
    // Constrain coordinates based on current mode
    let constrainedX = x;
    let constrainedY = y;
    
    if (!isExpanded && animationProgress < 1) {
      // Circular constraint for normal mode
      if (distance > wheelR) {
        const scale = wheelR / distance;
        constrainedX = x * scale;
        constrainedY = y * scale;
      }
    } else {
      // Square constraint for expanded mode - allow full square area
      constrainedX = Math.max(-wheelR, Math.min(wheelR, x));
      constrainedY = Math.max(-wheelR, Math.min(wheelR, y));
    }
    
    // Use unified OKLCH calculation for consistency
    const oklchColor = getOklchAtPosition(constrainedX, constrainedY);
    chroma = oklchColor.c;
    lightness = oklchColor.l;
    
    draw();
    emitColorChange();
  }
  
  function getCanvasPosition(e: MouseEvent | TouchEvent): { x: number, y: number } {
    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }
  
  function emitColorChange() {
    const hex = oklchToHex(lightness, chroma, hue);
    color = hex;
    dispatch('colorChange', hex);
  }
  
  function recalculateDotPosition() {
    if (!lastMousePos) return;
    
    const { x, y } = lastMousePos;
    const distance = Math.sqrt(x * x + y * y);
    
    // Constrain coordinates based on current mode
    let constrainedX = x;
    let constrainedY = y;
    
    if (!isExpanded && animationProgress < 1) {
      // Circular constraint for normal mode
      if (distance > wheelR) {
        const scale = wheelR / distance;
        constrainedX = x * scale;
        constrainedY = y * scale;
      }
    } else {
      // Square constraint for expanded mode - allow full square area
      constrainedX = Math.max(-wheelR, Math.min(wheelR, x));
      constrainedY = Math.max(-wheelR, Math.min(wheelR, y));
    }
    
    // Use unified OKLCH calculation for consistency
    const oklchColor = getOklchAtPosition(constrainedX, constrainedY);
    chroma = oklchColor.c;
    lightness = oklchColor.l;
    
    draw();
    emitColorChange();
  }
  
  function animateToSquare() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    
    // Calculate target dot position for animation
    if (lastMousePos) {
      const { x, y } = lastMousePos;
      // Store current position as animation start
      dotAnimationStart = { chroma, lightness };
      
      // Calculate target position (unconstrained square)
      const targetX = Math.max(-wheelR, Math.min(wheelR, x));
      const targetY = Math.max(-wheelR, Math.min(wheelR, y));
      
      const targetOklch = getOklchAtPosition(targetX, targetY);
      
      dotAnimationTarget = { chroma: targetOklch.c, lightness: targetOklch.l };
    }
    
    const startTime = performance.now();
    const duration = 300; // 300ms animation
    
    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing function
      animationProgress = progress * progress * (3 - 2 * progress);
      
      // Animate dot position if we have start and target
      if (dotAnimationStart && dotAnimationTarget) {
        const dotProgress = animationProgress;
        chroma = dotAnimationStart.chroma + (dotAnimationTarget.chroma - dotAnimationStart.chroma) * dotProgress;
        lightness = dotAnimationStart.lightness + (dotAnimationTarget.lightness - dotAnimationStart.lightness) * dotProgress;
      }
      
      draw();
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        animationFrame = null;
        // Clear animation state
        dotAnimationStart = null;
        dotAnimationTarget = null;
      }
    }
    
    animationFrame = requestAnimationFrame(animate);
  }
  
  function animateToCircle() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    
    // Store current visual position and calculate target position for smooth animation
    const currentVisualPos = getWheelPosition(chroma, lightness);
    
    // Calculate where the dot should end up (constrained to circle)
    const targetX = ((chroma / 0.25) * wheelR * 2) - wheelR;
    const targetY = wheelR - ((lightness / 100) * wheelR * 2);
    const distance = Math.sqrt(targetX * targetX + targetY * targetY);
    
    let finalX = targetX;
    let finalY = targetY;
    if (distance > wheelR) {
      const scale = wheelR / distance;
      finalX = targetX * scale;
      finalY = targetY * scale;
    }
    
    // Store positions for animation
    const startVisualPos = { x: currentVisualPos.x, y: currentVisualPos.y };
    const targetVisualPos = { x: finalX, y: finalY };
    
    // Keep color values the same
    dotAnimationStart = { chroma, lightness };
    dotAnimationTarget = { chroma, lightness };
    
    const startTime = performance.now();
    const duration = 300; // 300ms animation
    
    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Smooth easing function
      animationProgress = 1 - progress * progress * (3 - 2 * progress);
      
      // Animate visual position smoothly
      const visualProgress = progress * progress * (3 - 2 * progress);
      dotVisualPosition = {
        x: startVisualPos.x + (targetVisualPos.x - startVisualPos.x) * visualProgress,
        y: startVisualPos.y + (targetVisualPos.y - startVisualPos.y) * visualProgress
      };
      
      // Keep color values unchanged
      if (dotAnimationStart && dotAnimationTarget) {
        chroma = dotAnimationStart.chroma;
        lightness = dotAnimationStart.lightness;
      }
      
      draw();
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        animationFrame = null;
        animationProgress = 0;
        // Clear animation state
        dotAnimationStart = null;
        dotAnimationTarget = null;
        dotVisualPosition = null; // Clear stored position
      }
    }
    
    animationFrame = requestAnimationFrame(animate);
  }
  
  // Reactive updates
  $: if (canvas && ctx) {
    draw();
  }
</script>

<div class="color-disc" bind:this={container} style="width: {size}px; height: {size}px;">
  <canvas bind:this={canvas} />
  
  <!-- Hue Picker -->
  <div 
    class="hue-picker" 
    bind:this={huePicker}
    style="width: {hueRingWidth}px; height: {hueRingWidth}px;"
  />
  
  <!-- Chromaticity Picker -->
  <div 
    class="wheel-picker" 
    bind:this={wheelPicker}
    style="width: {pickerSize * 2}px; height: {pickerSize * 2}px;"
  />
</div>

<style>
  .color-disc {
    position: relative;
    background-color: #2a2a2a;
    border-radius: 8px;
    user-select: none;
  }
  
  canvas {
    display: block;
    border-radius: 8px;
    cursor: pointer;
  }
  
  .hue-picker,
  .wheel-picker {
    position: absolute;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    pointer-events: none;
    z-index: 10;
    transition: transform 0.1s ease;
  }
  
  .hue-picker:hover,
  .wheel-picker:hover {
    transform: scale(1.1);
  }
</style> 