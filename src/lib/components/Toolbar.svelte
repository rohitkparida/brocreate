<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { spring } from 'svelte/motion';
  import ColorDisc from './ColorPicker/ColorDisc.svelte';

  export let color: string = '#000000';
  export let lineWidth: number = 50;

  // This reactive statement ensures that if the color prop ever becomes invalid (e.g., null or ""),
  // it immediately resets to a valid default, preventing the DOM error.
  $: if (!color) color = '#000000';

  const dispatch = createEventDispatcher<{
    colorChange: string;
    lineWidthChange: number;
    clear: void;
  }>();

  let toolbar: HTMLElement;
  let isDragging = false;
  let selectedTool: string = 'Pointer'; // Default tool
  let isVertical = false;

  const position = spring(
    { x: 0, y: 20 },
    {
      stiffness: 0.2,
      damping: 0.7,
    }
  );

  const tools = [
    { id: 'Pointer', brushId: null, label: 'M' },
    { id: 'Pen', brushId: 'kb_0010', label: 'P' },
    { id: 'Brush', brushId: 'kb_0020', label: 'B' },
    { id: 'Pencil', brushId: 'kb_0030', label: 'P' },
    { id: 'divider1', brushId: null, label: '' },
    { id: 'Grid', brushId: null, label: '#' },
    { id: 'Square', brushId: null, label: 'S' },
    { id: 'Type', brushId: null, label: 'T' },
    { id: 'Circle', brushId: null, label: 'C' },
    { id: 'Wand', brushId: null, label: 'W' },
    { id: 'divider2', brushId: null, label: '' },
    { id: 'Pipette', brushId: null, label: 'P' },
    { id: 'Move', brushId: null, label: 'H' },
    { id: 'Code', brushId: null, label: '</>' },
    { id: 'divider3', brushId: null, label: '' },
    { id: 'Clear', brushId: null, label: 'X' },
  ];

  let showColorPicker = false;

  function selectTool(toolId: string, brushId: string | null) {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool || tool.id.startsWith('divider')) return; // Not a selectable tool

    selectedTool = toolId;
    if (brushId) {
      dispatch('selectBrush', { brushId });
    }
    if (toolId === 'Clear') {
      dispatch('clear');
    }
  }

  function handleColorChange(event: CustomEvent<string>) {
    color = event.detail;
    dispatch('colorChange', color);
  }

  function handleLineWidthChange(event: Event) {
    const target = event.target as HTMLInputElement;
    lineWidth = parseInt(target.value);
    dispatch('lineWidthChange', lineWidth);
  }

  function handleClear() {
    dispatch('clear');
  }

  function toggleColorPicker() {
    showColorPicker = !showColorPicker;
  }

  function closeColorPicker() {
    showColorPicker = false;
  }

  async function handleDoubleClick() {
    isVertical = !isVertical;
    await tick(); // Wait for the DOM to update with the new orientation
    snapToEdge(); // Re-run snap logic to ensure it's within bounds
  }

  function handleMouseDown(event: MouseEvent) {
    isDragging = true;
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = $position.x;
    const initialY = $position.y;

    function handleMouseMove(event: MouseEvent) {
      if (!isDragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      position.set({ x: initialX + dx, y: initialY + dy });
    }

    function handleMouseUp() {
      isDragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      snapToEdge();
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function snapToEdge() {
    if (!toolbar) return;
    let { width, height } = toolbar.getBoundingClientRect();
    let currentPos = $position;

    let newX = Math.max(0, Math.min(currentPos.x, window.innerWidth - width));
    let newY = Math.max(0, Math.min(currentPos.y, window.innerHeight - height));

    const snapThreshold = 50;

    if (newX < snapThreshold) {
      newX = 0;
    } else if (window.innerWidth - (newX + width) < snapThreshold) {
      newX = window.innerWidth - width;
    }

    if (newY < snapThreshold) {
      newY = 0;
    } else if (window.innerHeight - (newY + height) < snapThreshold) {
      newY = window.innerHeight - height;
    }

    position.set({ x: newX, y: newY });
    localStorage.setItem('toolbarState', JSON.stringify({ x: newX, y: newY, isVertical }));
  }

  onMount(async () => {
    const savedState = localStorage.getItem('toolbarState');
    if (savedState) {
      const { x, y, isVertical: savedIsVertical } = JSON.parse(savedState);
      isVertical = savedIsVertical;
      await tick(); // Let the DOM update before calculating position
      position.set({ x, y }, { hard: true });
      snapToEdge();
    } else {
      // Center the toolbar initially if no saved state
      position.set({ x: (window.innerWidth - toolbar.offsetWidth) / 2, y: 20 }, { hard: true });
    }
  });
</script>

<div
  class="toolbar"
  bind:this={toolbar}
  class:vertical={isVertical}
  style="transform: translate3d({$position.x}px, {$position.y}px, 0)"
>
  <div
    class="drag-handle"
    on:mousedown|preventDefault={handleMouseDown}
    on:dblclick|preventDefault={handleDoubleClick}
  />
  {#each tools as tool}
    {#if tool.id.startsWith('divider')}
      <div class="divider"></div>
    {:else}
      <div
        class="icon-button"
        class:active={selectedTool === tool.id}
        on:click|stopPropagation={() => selectTool(tool.id, tool.brushId)}
        on:mousedown|stopPropagation
        title={tool.id}
      >
        {tool.label}
      </div>
    {/if}
  {/each}

  <div class="control-wrapper">
    <div class="toolbar-section">
      <label>Brush Size</label>
    <input
      type="range"
      min="1"
        max="200"
        value={lineWidth}
      on:input={handleLineWidthChange}
        class="slider"
      />
      <span class="value">{lineWidth}px</span>
    </div>

    <div class="toolbar-section">
      <label>Color</label>
      <div class="color-picker-container">
        <button 
          class="color-preview" 
          style="background-color: {color}" 
          on:click={toggleColorPicker}
          title="Click to open color picker"
        >
          <span class="color-hex">{color}</span>
        </button>
        
        {#if showColorPicker}
          <div class="color-picker-overlay" on:click={closeColorPicker}>
            <div class="color-picker-modal" on:click|stopPropagation>
              <div class="color-picker-header">
                <h3>Colors</h3>
                <button class="close-btn" on:click={closeColorPicker}>×</button>
              </div>
              <ColorDisc 
                {color} 
                size={280} 
                on:colorChange={handleColorChange} 
              />
              <div class="color-info">
                <span class="current-color">{color}</span>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="toolbar-section">
      <button class="clear-btn" on:click={handleClear}>
        Clear Canvas
      </button>
    </div>
  </div>
</div>

<style>
  .toolbar {
    position: fixed;
    top: 0;
    left: 0;
    background-color: #333;
    color: white;
    padding: 5px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: default;
    user-select: none;
    z-index: 100;
    flex-direction: row;
  }
  .toolbar.vertical {
    flex-direction: column;
    width: auto;
    padding: 5px;
  }
  .drag-handle {
    width: 12px;
    height: 38px;
    background-color: #555;
    border-radius: 4px;
    cursor: grab;
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .toolbar.vertical .drag-handle {
    width: 38px;
    height: 12px;
  }
  .divider {
    width: 1px;
    height: 20px;
    background-color: #555;
  }
  .icon-button {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    font-weight: bold;
    font-size: 1.2em;
  }
  .icon-button.active {
    background-color: #007bff;
  }
  .icon-button:not(.active):hover {
    background-color: #555;
  }
  .control-wrapper {
    display: flex;
    flex-direction: column;
    padding: 0 5px;
    gap: 5px;
  }
  input[type='color'] {
    width: 38px;
    height: 38px;
    border: none;
    padding: 0;
    background: none;
    cursor: pointer;
  }
  input[type='range'] {
    width: 80px;
    cursor: pointer;
  }
  .toolbar.vertical .control-wrapper {
    flex-direction: row;
    align-items: center;
  }
  .toolbar.vertical input[type='range'] {
    writing-mode: vertical-lr;
    direction: rtl;
    width: auto;
    height: 80px;
  }
  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  label {
    color: white;
    font-size: 14px;
    font-weight: 500;
  }
  .slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #555;
    outline: none;
    appearance: none;
  }
  .slider::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #007AFF;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #007AFF;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  .value {
    color: #ccc;
    font-size: 12px;
    text-align: center;
  }
  .color-picker-container {
    position: relative;
  }
  .color-preview {
    width: 100%;
    height: 50px;
    border: 2px solid #555;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.2s ease;
    display: flex;
    align-items: end;
    justify-content: center;
    padding: 8px;
  }
  .color-preview:hover {
    border-color: #007AFF;
    transform: scale(1.02);
  }
  .color-hex {
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: monospace;
  }
  .color-picker-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .color-picker-modal {
    background: #2a2a2a;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    max-width: 90vw;
    max-height: 90vh;
  }
  .color-picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .color-picker-header h3 {
    color: white;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .close-btn {
    background: none;
    border: none;
    color: #ccc;
    font-size: 24px;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.2s ease;
  }
  .close-btn:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }
  .color-info {
    margin-top: 16px;
    text-align: center;
  }
  .current-color {
    color: #ccc;
    font-family: monospace;
    font-size: 14px;
    background: rgba(255, 255, 255, 0.1);
    padding: 8px 12px;
    border-radius: 6px;
    display: inline-block;
  }
  .clear-btn {
    background: #FF3B30;
    color: white;
    border: none;
    padding: 12px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s ease;
  }
  .clear-btn:hover {
    background: #FF2D20;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3);
  }
  .clear-btn:active {
    transform: translateY(0);
  }
</style> 