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
            latitude.textContent = position.coords.latitude.toFixed(6);
            longitude.textContent = position.coords.longitude.toFixed(6);
            locationStatus.textContent =
                "Location tracking active (accuracy: " +
                Math.round(position.coords.accuracy) + " m)";
        },
        error => {
            locationStatus.textContent = "Location error: " + error.message;
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
}

function stopLocation() {
    if (locationWatch !== null) {
        navigator.geolocation.clearWatch(locationWatch);
        locationWatch = null;
    }
    locationStatus.textContent = "Location tracking stopped.";
}

button.addEventListener("click", async () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
        stopLocation();

        button.textContent = "Start Camera";
        detectButton.disabled = true;
        resultBox.textContent = "Camera stopped.";
        return;
    }

    button.disabled = true;
    button.textContent = "Opening camera...";

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        button.textContent = "Stop Camera";
        detectButton.disabled = false;
        resultBox.textContent = "Camera ready. Tap Detect Disease.";
        startLocation();
    } catch (error) {
        stream = null;
        video.srcObject = null;
        button.textContent = "Start Camera";
        detectButton.disabled = true;
        resultBox.textContent = "Camera error: " + error.message;
    } finally {
        button.disabled = false;
    }
});

detectButton.addEventListener("click", async () => {
    resultBox.textContent = "Detect button clicked.";

    if (!stream || !video.videoWidth) {
        resultBox.textContent = "Please start the camera first.";
        return;
    }

    detectButton.disabled = true;
    detectButton.textContent = "Analyzing...";

    try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                file => file ? resolve(file) : reject(
                    new Error("Could not capture camera image.")
                ),
                "image/jpeg",
                0.9
            );
        });

        const imageFile = new File([blob], "lettuce.jpg", {
            type: "image/jpeg"
        });

        resultBox.textContent = "Connecting to AI...";

        const client = await getAIClient();
        const response = await client.predict("/predict", [imageFile]);

        const prediction = response.data?.[0];
        resultBox.textContent = typeof prediction === "string"
            ? prediction
            : JSON.stringify(prediction ?? response.data, null, 2);

    } catch (error) {
        console.error(error);
        resultBox.textContent =
            "Detection failed: " + (error.message || String(error));
    } finally {
        detectButton.disabled = !stream;
        detectButton.textContent = "Detect Disease";
    }
});

detectButton.disabled = true;
