const button = document.getElementById("startCamera");
const detectButton = document.getElementById("detectDisease");
const video = document.getElementById("video");
const resultBox = document.getElementById("result");

const latitude = document.getElementById("latitude");
const longitude = document.getElementById("longitude");
const locationStatus = document.getElementById("locationStatus");

let stream = null;
let locationWatch = null;
let gradioClientPromise = null;
let detectionActive = false;
let detectionLoopRunning = false;

const FRAME_DELAY_MS = 500; // Wait after each completed prediction

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getAIClient() {
    if (!gradioClientPromise) {
        gradioClientPromise = import(
            "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js"
        ).then(({ Client }) =>
            Client.connect("punyachetbunnun/lettuce-disease-api")
        );
    }
    return gradioClientPromise;
}

function startLocation() {
    if (!navigator.geolocation) {
        locationStatus.textContent = "Location is not supported.";
        return;
    }

    locationStatus.textContent = "Requesting location permission...";

    locationWatch = navigator.geolocation.watchPosition(
        position => {
            latitude.textContent =
                position.coords.latitude.toFixed(6);
            longitude.textContent =
                position.coords.longitude.toFixed(6);
            locationStatus.textContent =
                "Location tracking active (accuracy: " +
                Math.round(position.coords.accuracy) + " m)";
        },
        error => {
            locationStatus.textContent =
                "Location error: " + error.message;
        },
        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 15000
        }
    );
}

function stopLocation() {
    if (locationWatch !== null) {
        navigator.geolocation.clearWatch(locationWatch);
        locationWatch = null;
    }
    locationStatus.textContent = "Location tracking stopped.";
}

function captureVideoFrame() {
    if (!video.videoWidth || !video.videoHeight) {
        throw new Error("Waiting for the camera video...");
    }

    const canvas = document.createElement("canvas");

    // Limit image size to reduce upload time.
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    canvas.getContext("2d").drawImage(
        video, 0, 0, canvas.width, canvas.height
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error("Could not capture video frame."));
                return;
            }

            resolve(new File([blob], "frame.jpg", {
                type: "image/jpeg"
            }));
        }, "image/jpeg", 0.8);
    });
}

async function detectLoop() {
    if (detectionLoopRunning) return;

    detectionLoopRunning = true;

    try {
        const client = await getAIClient();

        while (detectionActive && stream) {
            try {
                // Capture a new frame from the current live video.
                const frame = await captureVideoFrame();

                resultBox.textContent =
                    "Analyzing live video...";

                // Only one inference runs at a time.
                const response = await client.predict(
                    "/predict",
                    [frame]
                );

                if (!detectionActive || !stream) break;

                const prediction = response.data?.[0];

                resultBox.textContent =
                    typeof prediction === "string"
                        ? prediction
                        : JSON.stringify(
                            prediction ?? response.data,
                            null,
                            2
                        );

            } catch (error) {
                console.error("Frame detection failed:", error);

                if (!detectionActive || !stream) break;

                resultBox.textContent =
                    "Detection error: " +
                    (error.message || String(error));

                // Avoid repeatedly hammering the backend on errors.
                await sleep(2000);
            }

            // Wait after each prediction, then capture a NEW frame.
            if (detectionActive && stream) {
                await sleep(FRAME_DELAY_MS);
            }
        }
    } catch (error) {
        console.error("Could not connect to AI:", error);

        if (detectionActive) {
            resultBox.textContent =
                "AI connection failed: " +
                (error.message || String(error));
        }
    } finally {
        detectionLoopRunning = false;

        // Resume if detection was restarted while a previous
        // request was still finishing.
        if (detectionActive && stream) {
            void detectLoop();
        }
    }
}

function startDetection() {
    if (!stream || detectionActive) return;

    detectionActive = true;
    detectButton.textContent = "Pause Live Detection";
    resultBox.textContent = "Connecting to AI...";

    void detectLoop();
}

function stopDetection() {
    detectionActive = false;
    detectButton.textContent = "Resume Live Detection";
    resultBox.textContent = "Live detection paused.";
}

button.addEventListener("click", async () => {
    if (stream) {
        detectionActive = false;

        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;

        stopLocation();

        button.textContent = "Start Camera";
        detectButton.textContent = "Live Detection";
        detectButton.disabled = true;
        resultBox.textContent = "Camera stopped.";

        return;
    }

    button.disabled = true;
    button.textContent = "Opening camera...";

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        button.textContent = "Stop Camera";
        detectButton.disabled = false;

        startLocation();

        // Start AI analysis automatically with the live video.
        startDetection();

    } catch (error) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        stream = null;
        video.srcObject = null;
        button.textContent = "Start Camera";
        detectButton.disabled = true;

        resultBox.textContent =
            "Camera error: " + error.message;
    } finally {
        button.disabled = false;
    }
});

detectButton.addEventListener("click", () => {
    if (!stream) {
        resultBox.textContent = "Please start the camera first.";
        return;
    }

    if (detectionActive) {
        stopDetection();
    } else {
        startDetection();
    }
});

detectButton.disabled = true;
