<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';

	let canvasComponent: Canvas;
	let selectedColor: string = '#000000';
	let lineWidth: number = 50; // Updated to match brush system default

	function handleSelectBrush(event: CustomEvent) {
		// This functionality will be restored later with the new brush engine.
		console.log('Brush selection changed:', event.detail.brushId);
	}

	function handleClear() {
		if (canvasComponent) {
			canvasComponent.clear();
		}
	}

	function handleColorChange(event: CustomEvent<string>) {
		selectedColor = event.detail;
	}

	function handleLineWidthChange(event: CustomEvent<number>) {
		lineWidth = event.detail;
	}
</script>

<Toolbar
	on:selectBrush={handleSelectBrush}
	on:clear={handleClear}
	on:colorChange={handleColorChange}
	on:lineWidthChange={handleLineWidthChange}
	color={selectedColor}
	{lineWidth}
/>

<Canvas bind:this={canvasComponent} color={selectedColor} size={lineWidth} />

<style>
	:global(body) {
		margin: 0;
		background: #1a1a1a;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
</style>
