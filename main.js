

"use strict";

// ============================================
// LETTUCE AI VISION
// Camera + Live Frames + YOLO API
// ============================================

const $ = (id) => document.getElementById(id);

const video = $("video");
const overlay = $("overlay");
const ctx = overlay.getContext("2d");

const startCameraBtn = $("startCamera");
const stopCameraBtn = $("stopCamera");
const startDetectionBtn = $("startDetection");
const stopDetectionBtn = $("stopDetection");

const cameraStatus = $("cameraStatus");
const cameraBadge = $("cameraBadge");
const cameraMetric = $("cameraMetric");
const cameraMetricDot = $("cameraMetricDot");

const aiStatus = $("aiStatus");
const aiMetricDot = $("aiMetricDot");
const detectionCount = $("detectionCount");

const results = $("results");
const resultsEmpty = $("resultsEmpty");
const apiUrl = $("apiUrl");

const cameraPlaceholder = $("cameraPlaceholder");
const videoLabel = $("videoLabel");
const sessionBadge = $("sessionBadge");

const themeToggle = $("themeToggle");
const themeIcon = $("themeIcon");
const themeText = $("themeText");

const captureCanvas = document.createElement("canvas");
const captureCtx = captureCanvas.getContext("2d");

let stream = null;
let detectionTimer = null;
let sendingFrame = false;
let running = false;
let requestController = null;

const FRAME_INTERVAL = 500;

// ============================================
// STATUS HELPERS
// ============================================

function setDot(element, state) {
  if (!element) return;

  element.classList.remove("online", "error");

  if (state === "online") {
    element.classList.add("online");
  } else if (state === "error") {
    element.classList.add("error");
  }
}

function setCameraStatus(text, state = "offline") {
  cameraStatus.textContent = text;
  cameraMetric.textContent = text;
  cameraBadge.innerHTML = "";

  const dot = document.createElement("span");
  dot.className = "indicator-dot";

  if (state === "online") dot.classList.add("online");
  if (state === "error") dot.classList.add("error");

  cameraBadge.append(dot, document.createTextNode(" " + (
    state === "online" ? "Online" :
    state === "error" ? "Error" : "Offline"
  )));

  setDot(cameraMetricDot, state);
}

function setAIStatus(text, state = "offline") {
  aiStatus.textContent = text;
  setDot(aiMetricDot, state);
}

function setSessionStatus(text, state = "offline") {
  sessionBadge.replaceChildren();

  const dot = document.createElement("span");
  dot.className = "indicator-dot";

  if (state === "online") dot.classList.add("online");
  if (state === "error") dot.classList.add("error");

  sessionBadge.append(dot, document.createTextNode(" " + text));
}

// ============================================
// 1. CAMERA
// ============================================

startCameraBtn.addEventListener("click", startCamera);
stopCameraBtn.addEventListener("click", stopCamera);

async function startCamera() {
  if (stream) return;

  startCameraBtn.disabled = true;
  setCameraStatus("Requesting permission...");
  setSessionStatus("Starting camera");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera access is unavailable. Open this site using HTTPS."
      );
    }

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    // The user might have stopped the camera while permission was pending.
    if (startCameraBtn.disabled === false) {
      newStream.getTracks().forEach(track => track.stop());
      return;
    }

    stream = newStream;
    video.srcObject = stream;

    await video.play();

    cameraPlaceholder.classList.add("hidden");
    videoLabel.classList.add("recording");
    videoLabel.textContent = "LIVE CAMERA";

    setCameraStatus("Online", "online");
    setSessionStatus("Camera active", "online");

    stopCameraBtn.disabled = false;
    startDetectionBtn.disabled = false;

    console.log("Camera started.");

  } catch (error) {
    console.error("Camera error:", error);

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }

    video.srcObject = null;
    cameraPlaceholder.classList.remove("hidden");
    videoLabel.classList.remove("recording");
    videoLabel.textContent = "LIVE PREVIEW";

    setCameraStatus(error.message || "Camera error", "error");
    setSessionStatus("Camera error", "error");

    startCameraBtn.disabled = false;
    stopCameraBtn.disabled = true;
    startDetectionBtn.disabled = true;

    alert(
      "Unable to start the camera.\n\n" +
      (error.name || "Error") + ": " + error.message +
      "\n\nCheck your browser's camera permission."
    );
  }
}

function stopCamera() {
  stopDetection();

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;

  cameraPlaceholder.classList.remove("hidden");
  videoLabel.classList.remove("recording");
  videoLabel.textContent = "LIVE PREVIEW";

  setCameraStatus("Offline");
  setAIStatus("Disconnected");
  setSessionStatus("Standby");

  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  startDetectionBtn.disabled = true;
  stopDetectionBtn.disabled = true;

  clearOverlay();

  console.log("Camera stopped.");
}

// ============================================
// 2. START AND STOP DETECTION
// ============================================

startDetectionBtn.addEventListener("click", startDetection);
stopDetectionBtn.addEventListener("click", stopDetection);

function startDetection() {
  if (!stream || running) return;

  const endpoint = apiUrl.value.trim();

  if (!endpoint) {
    alert("Enter your YOLO backend URL first.");
    return;
  }

  try {
    new URL(endpoint);
  } catch {
    alert("Please enter a valid backend URL.");
    return;
  }

  running = true;

  startDetectionBtn.disabled = true;
  stopDetectionBtn.disabled = false;

  setAIStatus("Connecting...");
  setSessionStatus("Detection running", "online");

  // Start immediately, then process another frame when ready.
  sendFrame();

  detectionTimer = setInterval(() => {
    if (!sendingFrame) sendFrame();
  }, FRAME_INTERVAL);

  console.log("Detection started.");
}

function stopDetection() {
  running = false;

  if (detectionTimer !== null) {
    clearInterval(detectionTimer);
    detectionTimer = null;
  }

  if (requestController) {
    requestController.abort();
    requestController = null;
  }

  setAIStatus("Disconnected");

  stopDetectionBtn.disabled = true;
  startDetectionBtn.disabled = !stream;

  if (stream) {
    setSessionStatus("Camera active", "online");
  } else {
    setSessionStatus("Standby");
  }

  clearOverlay();
}

// ============================================
// 3. CAPTURE AND SEND A FRAME
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
  const controller = new AbortController();
  requestController = controller;

  try {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      throw new Error("Waiting for video frames.");
    }

    captureCanvas.width = width;
    captureCanvas.height = height;

    captureCtx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise(resolve => {
      captureCanvas.toBlob(resolve, "image/jpeg", 0.8);
    });

    if (!blob) {
      throw new Error("Could not capture the camera frame.");
    }

    const formData = new FormData();
    formData.append("file", blob, "frame.jpg");

    const response = await fetch(apiUrl.value.trim(), {
      method: "POST",
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Backend returned HTTP ${response.status}.`);
    }

    const data = await response.json();

    if (!running) return;

    setAIStatus("Connected", "online");
    setSessionStatus("Detection running", "online");

    renderDetections(
      Array.isArray(data.detections) ? data.detections : [],
      width,
      height
    );

  } catch (error) {
    if (error.name === "AbortError") return;

    console.error("AI request failed:", error);

    if (running) {
      setAIStatus("Connection error", "error");
      setSessionStatus("Backend unavailable", "error");
    }

  } finally {
    if (requestController === controller) {
      requestController = null;
    }

    sendingFrame = false;
  }
}

// ============================================
// 4. RENDER DETECTIONS
// Expected API response:
// {
//   "detections": [
//     {
//       "label": "leaf_disease",
//       "confidence": 0.94,
//       "x1": 100, "y1": 80,
//       "x2": 260, "y2": 220
//     }
//   ]
// }
// ============================================

function renderDetections(detections, width, height) {
  overlay.width = width;
  overlay.height = height;

  ctx.clearRect(0, 0, width, height);

  detectionCount.textContent = String(detections.length);

  results.replaceChildren();
  resultsEmpty.classList.toggle("hidden", detections.length > 0);

  if (detections.length === 0) {
    const li = document.createElement("li");
    li.className = "result-placeholder";
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

    const label = String(detection.label ?? "Object");
    const confidence = Number(detection.confidence ?? 0);
    const percent = Number.isFinite(confidence)
      ? (confidence * 100).toFixed(1)
      : "0.0";

    // Draw bounding box.
    ctx.strokeStyle = "#82c83e";
    ctx.lineWidth = Math.max(2, width / 320);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    // Draw a label background and text.
    const text = `${label} ${percent}%`;
    const fontSize = Math.max(14, width / 40);

    ctx.font = `600 ${fontSize}px Arial`;

    const padding = 7;
    const labelHeight = fontSize + padding * 2;
    const labelWidth = ctx.measureText(text).width + padding * 2;
    const labelY = Math.max(0, y1 - labelHeight);

    ctx.fillStyle = "#82c83e";
    ctx.fillRect(x1, labelY, labelWidth, labelHeight);

    ctx.fillStyle = "#172411";
    ctx.fillText(text, x1 + padding, labelY + fontSize + 1);

    // Use textContent to keep labels safe.
    const li = document.createElement("li");
    li.textContent = `${label} — ${percent}% confidence`;
    results.appendChild(li);
  }

  resultsEmpty.classList.toggle(
    "hidden",
    results.children.length > 0
  );
}

// ============================================
// 5. RESET OVERLAY
// ============================================

function clearOverlay() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  detectionCount.textContent = "0";

  results.replaceChildren();

  const li = document.createElement("li");
  li.className = "result-placeholder";
  li.textContent = "Waiting for detections...";
  results.appendChild(li);

  resultsEmpty.classList.remove("hidden");
}

// ============================================
// 6. DARK MODE
// ============================================

themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");

  themeIcon.textContent = isDark ? "☀" : "☾";
  themeText.textContent = isDark ? "Light mode" : "Dark mode";

  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#111720" : "#f6f8fa");
});

// ============================================
// 7. INITIAL STATE
// ============================================

startCameraBtn.disabled = false;
stopCameraBtn.disabled = true;
startDetectionBtn.disabled = true;
stopDetectionBtn.disabled = true;

setCameraStatus("Offline");
setAIStatus("Disconnected");
setSessionStatus("Standby");

clearOverlay();

console.log("Lettuce AI Vision initialized.");
