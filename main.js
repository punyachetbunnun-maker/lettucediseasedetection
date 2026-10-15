const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

const startCameraBtn = document.getElementById("startCamera");
const stopCameraBtn = document.getElementById("stopCamera");
const startDetectionBtn = document.getElementById("startDetection");
const stopDetectionBtn = document.getElementById("stopDetection");

const cameraStatus = document.getElementById("cameraStatus");
const aiStatus = document.getElementById("aiStatus");
const detectionCount = document.getElementById("detectionCount");
const results = document.getElementById("results");
const apiUrl = document.getElementById("apiUrl");

const captureCanvas = document.createElement("canvas");
const captureCtx = captureCanvas.getContext("2d");

let stream = null;
let detectionTimer = null;
let sendingFrame = false;
let running = false;

// 1. Start the live camera
startCameraBtn.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    cameraStatus.textContent = "Online";
    startCameraBtn.disabled = true;
    stopCameraBtn.disabled = false;
    startDetectionBtn.disabled = false;
  } catch (error) {
    cameraStatus.textContent = "Camera error";
    alert("Could not access the camera: " + error.message);
  }
});

// 2. Stop the camera
stopCameraBtn.addEventListener("click", () => {
  stopDetection();

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;
  cameraStatus.textContent = "Offline";
  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  startDetectionBtn.disabled = true;

  clearOverlay();
});

// 3. Begin sending frames to the AI server
startDetectionBtn.addEventListener("click", () => {
  if (!stream || running) return;

  if (!apiUrl.value.trim()) {
    alert("Enter your YOLO API URL first.");
    return;
  }

  running = true;
  aiStatus.textContent = "Connecting...";
  startDetectionBtn.disabled = true;
  stopDetectionBtn.disabled = false;

  // Send a frame approximately every 300 ms.
  detectionTimer = setInterval(sendFrame, 300);
});

// 4. Stop sending frames
stopDetectionBtn.addEventListener("click", stopDetection);

function stopDetection() {
  running = false;

  if (detectionTimer !== null) {
    clearInterval(detectionTimer);
    detectionTimer = null;
  }

  sendingFrame = false;
  aiStatus.textContent = "Disconnected";
  startDetectionBtn.disabled = !stream;
  stopDetectionBtn.disabled = true;
  clearOverlay();
}

function clearOverlay() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  detectionCount.textContent = "0";
}

// 5. Capture one video frame and send it to Python
async function sendFrame() {
  if (!running || sendingFrame || video.readyState < 2) {
    return;
  }

  sendingFrame = true;

  try {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) return;

    captureCanvas.width = width;
    captureCanvas.height = height;

    captureCtx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise(resolve => {
      captureCanvas.toBlob(resolve, "image/jpeg", 0.8);
    });

    if (!blob) throw new Error("Could not capture video frame.");

    const formData = new FormData();
    formData.append("file", blob, "frame.jpg");

    const response = await fetch(apiUrl.value.trim(), {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();

    aiStatus.textContent = "Connected";
    renderDetections(data.detections || [], width, height);

  } catch (error) {
    aiStatus.textContent = "Connection error";
    console.error("Frame sending failed:", error);
  } finally {
    sendingFrame = false;
  }
}

// 6. Draw bounding boxes returned by the YOLO backend
function renderDetections(detections, sourceWidth, sourceHeight) {
  overlay.width = sourceWidth;
  overlay.height = sourceHeight;

  ctx.clearRect(0, 0, overlay.width, overlay.height);

  detectionCount.textContent = detections.length;
  results.replaceChildren();

  if (detections.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No objects detected.";
    results.appendChild(item);
    return;
  }

  for (const item of detections) {
    // Expected coordinates: x1, y1, x2, y2 in source-image pixels.
    const x = Number(item.x1);
    const y = Number(item.y1);
    const w = Number(item.x2) - x;
    const h = Number(item.y2) - y;

    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
      continue;
    }

    const label = String(item.label ?? "Object");
    const confidence = Number(item.confidence ?? 0);

    ctx.strokeStyle = "#22e58b";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    const text = `${label} ${(confidence * 100).toFixed(1)}%`;
    ctx.font = "16px Arial";

    const labelWidth = ctx.measureText(text).width + 12;
    const labelY = Math.max(0, y - 25);

    ctx.fillStyle = "#22e58b";
    ctx.fillRect(x, labelY, labelWidth, 25);

    ctx.fillStyle = "#07130d";
    ctx.fillText(text, x + 6, labelY + 17);

    const li = document.createElement("li");
    li.textContent = `${label} — ${(confidence * 100).toFixed(1)}%`;
    results.appendChild(li);
  }
}
