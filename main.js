```javascript
// ============================================
// YOLO REAL-TIME VISION
// Frontend: Camera + Frame Capture + AI API
// ============================================

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

// Temporary canvas used to capture video frames
const captureCanvas = document.createElement("canvas");
const captureCtx = captureCanvas.getContext("2d");

// Application state
let stream = null;
let detectionTimer = null;
let sendingFrame = false;
let running = false;

// Send a frame every 300 milliseconds.
// Increase this value if your backend is slow.
const FRAME_INTERVAL = 300;

// ============================================
// 1. START CAMERA
// ============================================

startCameraBtn.addEventListener("click", startCamera);

async function startCamera() {
  if (stream) return;

  cameraStatus.textContent = "Requesting camera...";
  startCameraBtn.disabled = true;

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera API unavailable. Open the website over HTTPS."
      );
    }

    // Request camera access
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    // Display the live camera
    video.srcObject = stream;
    await video.play();

    cameraStatus.textContent = "Online";
    stopCameraBtn.disabled = false;
    startDetectionBtn.disabled = false;

    console.log("Camera started successfully.");

  } catch (error) {
    console.error("Camera error:", error);

    cameraStatus.textContent =
      `${error.name || "Error"}: ${error.message}`;

    startCameraBtn.disabled = false;
    stream = null;

    alert(
      "Could not start the camera.\n\n" +
      error.name + ": " + error.message +
      "\n\nCheck camera permission and use HTTPS."
    );
  }
}

// ============================================
// 2. STOP CAMERA
// ============================================

stopCameraBtn.addEventListener("click", stopCamera);

function stopCamera() {
  stopDetection();

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;

  cameraStatus.textContent = "Offline";
  aiStatus.textContent = "Disconnected";

  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  startDetectionBtn.disabled = true;
  stopDetectionBtn.disabled = true;

  clearOverlay();

  console.log("Camera stopped.");
}

// ============================================
// 3. START AI DETECTION
// ============================================

startDetectionBtn.addEventListener("click", startDetection);

function startDetection() {
  if (!stream || running) return;

  const endpoint = apiUrl.value.trim();

  if (!endpoint) {
    alert("Enter your YOLO backend URL first.");
    return;
  }

  running = true;

  aiStatus.textContent = "Connecting...";
  startDetectionBtn.disabled = true;
  stopDetectionBtn.disabled = false;

  // Send frames continuously without overlapping requests
  detectionTimer = setInterval(
    sendFrame,
    FRAME_INTERVAL
  );

  // Send the first frame immediately
  sendFrame();

  console.log("AI detection started.");
}

// ============================================
// 4. STOP AI DETECTION
// ============================================

stopDetectionBtn.addEventListener("click", stopDetection);

function stopDetection() {
  running = false;

  if (detectionTimer !== null) {
    clearInterval(detectionTimer);
    detectionTimer = null;
  }

  aiStatus.textContent = "Disconnected";

  startDetectionBtn.disabled = !stream;
  stopDetectionBtn.disabled = true;

  clearOverlay();

  console.log("AI detection stopped.");
}

// ============================================
// 5. CAPTURE AND SEND VIDEO FRAMES
// ============================================

async function sendFrame() {
  if (
    !running ||
    sendingFrame ||
    !stream ||
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return;
  }

  sendingFrame = true;

  try {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      throw new Error("Waiting for camera video...");
    }

    // Capture the current video frame
    captureCanvas.width = width;
    captureCanvas.height = height;

    captureCtx.drawImage(
      video,
      0,
      0,
      width,
      height
    );

    // Convert the frame to JPEG
    const blob = await new Promise(resolve => {
      captureCanvas.toBlob(
        resolve,
        "image/jpeg",
        0.8
      );
    });

    if (!blob) {
      throw new Error("Could not capture video frame.");
    }

    // Package the image for the Python backend
    const formData = new FormData();

    formData.append(
      "file",
      blob,
      "frame.jpg"
    );

    // Send the image to YOLO's API
    const response = await fetch(apiUrl.value.trim(), {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(
        `Backend HTTP error: ${response.status}`
      );
    }

    const data = await response.json();

    if (!running) return;

    aiStatus.textContent = "Connected";

    renderDetections(
      Array.isArray(data.detections)
        ? data.detections
        : [],
      width,
      height
    );

  } catch (error) {
    console.error("Detection request failed:", error);

    if (running) {
      aiStatus.textContent = "Connection error";
    }

  } finally {
    sendingFrame = false;
  }
}

// ============================================
// 6. DISPLAY DETECTION RESULTS
// ============================================

function renderDetections(
  detections,
  sourceWidth,
  sourceHeight
) {
  overlay.width = sourceWidth;
  overlay.height = sourceHeight;

  ctx.clearRect(
    0,
    0,
    overlay.width,
    overlay.height
  );

  detectionCount.textContent = detections.length;
  results.replaceChildren();

  if (detections.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No objects detected.";
    results.appendChild(li);
    return;
  }

  for (const detection of detections) {
    const x1 = Number(detection.x1);
    const y1 = Number(detection.y1);
    const x2 = Number(detection.x2);
    const y2 = Number(detection.y2);

    if (
      ![x1, y1, x2, y2].every(Number.isFinite) ||
      x2 <= x1 ||
      y2 <= y1
    ) {
      continue;
    }

    const label = String(
      detection.label ?? "Object"
    );

    const confidence = Number(
      detection.confidence ?? 0
    );

    // Draw bounding box
    ctx.strokeStyle = "#22e58b";
    ctx.lineWidth = 3;

    ctx.strokeRect(
      x1,
      y1,
      x2 - x1,
      y2 - y1
    );

    // Draw label background
    const text =
      `${label} ${(confidence * 100).toFixed(1)}%`;

    ctx.font = "16px Arial";

    const textWidth =
      ctx.measureText(text).width + 12;

    const labelY = Math.max(0, y1 - 25);

    ctx.fillStyle = "#22e58b";

    ctx.fillRect(
      x1,
      labelY,
      textWidth,
      25
    );

    // Draw label text
    ctx.fillStyle = "#07130d";

    ctx.fillText(
      text,
      x1 + 6,
      labelY + 17
    );

    // Add result to the side panel
    const li = document.createElement("li");

    li.textContent =
      `${label} — ${(confidence * 100).toFixed(1)}%`;

    results.appendChild(li);
  }
}

// ============================================
// 7. CLEAR THE DETECTION OVERLAY
// ============================================

function clearOverlay() {
  ctx.clearRect(
    0,
    0,
    overlay.width,
    overlay.height
  );

  detectionCount.textContent = "0";

  results.replaceChildren();

  const li = document.createElement("li");
  li.textContent = "Waiting for detections...";

  results.appendChild(li);
}

// ============================================
// 8. INITIALIZE BUTTONS
// ============================================

stopCameraBtn.disabled = true;
startDetectionBtn.disabled = true;
stopDetectionBtn.disabled = true;

cameraStatus.textContent = "Offline";
aiStatus.textContent = "Disconnected";

console.log("YOLO Real-Time Vision initialized.");
```
