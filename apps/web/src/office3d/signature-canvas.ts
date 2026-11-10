import type SignaturePad from 'signature_pad';

export function resizeSignatureCanvas(canvas: HTMLCanvasElement, pad: SignaturePad, previous: { width: number; height: number }, pixelRatio: number) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height || (width === previous.width && height === previous.height)) return;
  const strokes = pad.toData();
  const ratio = Math.max(pixelRatio || 1, 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (previous.width && previous.height) {
    for (const stroke of strokes) for (const point of stroke.points) {
      point.x *= width / previous.width;
      point.y *= height / previous.height;
    }
  }
  pad.fromData(strokes);
  previous.width = width;
  previous.height = height;
}
