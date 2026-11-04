/**
 * Camera handling for Viewfinder
 * Uses getUserMedia for camera access
 */

export async function startCamera(videoElement) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });

    videoElement.srcObject = stream;
    await videoElement.play();
    return stream;
  } catch (err) {
    console.error('Camera error:', err);
    throw new Error(`Camera access denied: ${err.message}`);
  }
}

export function stopCamera(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

export function getVideoDimensions(video) {
  return {
    width: video.videoWidth,
    height: video.videoHeight,
  };
}