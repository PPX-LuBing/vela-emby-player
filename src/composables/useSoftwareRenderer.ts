import { computed, shallowRef, type Ref } from 'vue'
import type { PlayerBounds } from './usePlayerEngine'
import type { usePlayerEngine } from './usePlayerEngine'

interface UseSoftwareRendererOptions {
  canvasRef: Ref<HTMLCanvasElement | null>
  getBounds: () => PlayerBounds | null
  renderFrame: ReturnType<typeof usePlayerEngine>['renderFrame']
  onError: (error: unknown) => void
  onVisibleFrame?: () => void
}

export function useSoftwareRenderer(options: UseSoftwareRendererOptions) {
  const isSoftwareRendering = shallowRef(false)
  const hasRenderedFrame = shallowRef(false)
  const hasActiveSoftwarePlayback = computed(
    () => isSoftwareRendering.value || hasRenderedFrame.value,
  )
  let renderLoopId = 0
  let invisibleFrameCount = 0

  function beginSoftwareRendering() {
    isSoftwareRendering.value = true
    hasRenderedFrame.value = false
    invisibleFrameCount = 0
    startRenderLoop()
  }

  function resetSoftwareRendering() {
    stopRenderLoop()
    isSoftwareRendering.value = false
    hasRenderedFrame.value = false
    invisibleFrameCount = 0
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
      const pixels = decodeRgbaFrame(frame.rgbaBase64)
      drawRgbaFrame(canvas, frame.width, frame.height, pixels)
      if (!hasRenderedFrame.value && isFirstDisplayableFrame(pixels)) {
        hasRenderedFrame.value = true
        options.onVisibleFrame?.()
      }
    } catch (error) {
      options.onError(error)
      stopRenderLoop()
      isSoftwareRendering.value = false
    }
  }

  function isFirstDisplayableFrame(pixels: Uint8ClampedArray<ArrayBuffer>) {
    if (hasVisibleFrame(pixels)) {
      return true
    }

    invisibleFrameCount += 1
    return invisibleFrameCount >= 90
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

function hasVisibleFrame(pixels: Uint8ClampedArray<ArrayBuffer>) {
  const pixelCount = Math.floor(pixels.length / 4)
  const pixelStep = Math.max(1, Math.floor(pixelCount / 96))
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += pixelStep) {
    const index = pixelIndex * 4
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    if (red > 8 || green > 8 || blue > 8) {
      return true
    }
  }

  return false
}

function decodeRgbaFrame(rgbaBase64: string): Uint8ClampedArray<ArrayBuffer> {
  const binary = atob(rgbaBase64)
  const pixels = new Uint8ClampedArray(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    pixels[index] = binary.charCodeAt(index)
  }
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = 255
  }
  return pixels
}

function drawRgbaFrame(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  pixels: Uint8ClampedArray<ArrayBuffer>,
) {
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  canvas.width = width
  canvas.height = height
  context.putImageData(new ImageData(pixels, width, height), 0, 0)
}
