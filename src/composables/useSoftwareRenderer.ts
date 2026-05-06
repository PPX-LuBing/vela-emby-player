import { computed, shallowRef, type Ref } from 'vue'
import type { PlayerBounds } from './usePlayerEngine'
import type { usePlayerEngine } from './usePlayerEngine'

interface UseSoftwareRendererOptions {
  canvasRef: Ref<HTMLCanvasElement | null>
  getBounds: () => PlayerBounds | null
  renderFrame: ReturnType<typeof usePlayerEngine>['renderFrame']
  onError: (error: unknown) => void
}

export function useSoftwareRenderer(options: UseSoftwareRendererOptions) {
  const isSoftwareRendering = shallowRef(false)
  const hasRenderedFrame = shallowRef(false)
  const hasActiveSoftwarePlayback = computed(
    () => isSoftwareRendering.value || hasRenderedFrame.value,
  )
  let renderLoopId = 0

  function beginSoftwareRendering() {
    isSoftwareRendering.value = true
    hasRenderedFrame.value = false
    startRenderLoop()
  }

  function resetSoftwareRendering() {
    stopRenderLoop()
    isSoftwareRendering.value = false
    hasRenderedFrame.value = false
  }

  function stopRenderLoop() {
    if (renderLoopId) {
      window.clearTimeout(renderLoopId)
      renderLoopId = 0
    }
  }

  function startRenderLoop() {
    stopRenderLoop()

    const draw = async () => {
      if (!isSoftwareRendering.value) {
        return
      }

      await renderFrameToCanvas()
      renderLoopId = window.setTimeout(draw, 66)
    }

    renderLoopId = window.setTimeout(draw, 0)
  }

  async function renderFrameToCanvas() {
    const canvas = options.canvasRef.value
    const bounds = options.getBounds()
    if (!canvas || !bounds) {
      return
    }

    const width = Math.max(2, Math.min(960, Math.round(bounds.width)))
    const height = Math.max(2, Math.round(width * (bounds.height / bounds.width)))

    try {
      const frame = await options.renderFrame({ width, height })
      drawRgbaFrame(canvas, frame)
      hasRenderedFrame.value = true
    } catch (error) {
      options.onError(error)
      stopRenderLoop()
    }
  }

  return {
    beginSoftwareRendering,
    hasActiveSoftwarePlayback,
    hasRenderedFrame,
    isSoftwareRendering,
    resetSoftwareRendering,
    stopRenderLoop,
  }
}

function drawRgbaFrame(
  canvas: HTMLCanvasElement,
  frame: { width: number; height: number; rgbaBase64: string },
) {
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  canvas.width = frame.width
  canvas.height = frame.height
  const binary = atob(frame.rgbaBase64)
  const pixels = new Uint8ClampedArray(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    pixels[index] = binary.charCodeAt(index)
  }
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = 255
  }

  context.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0)
}
