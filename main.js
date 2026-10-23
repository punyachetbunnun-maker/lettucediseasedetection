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

// Connect to the public Hugging Face Space.
// The model repository can remain private.
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
        locationStatus.textContent =
            "Location is not supported by this browser.";
        return;
    }

    locationStatus.textContent = "Requesting location permission...";

    locationWatch = navigator.geolocation.watchPosition(
        (position) => {
            latitude.textContent =
                position.coords.latitude.toFixed(6);

            longitude.textContent =
                position.coords.longitude.toFixed(6);

            locationStatus.textContent =
                "Location tracking active (accuracy: " +
                Math.round(position.coords.accuracy) + " m)";
        },
        (error) => {
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

button.addEventListener("click", async () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;

        stopLocation();

        button.textContent = "Start Camera";
        detectButton.disabled = true;
        resultBox.textContent = "";

        return;
    }

    button.textContent = "Opening camera...";
    button.disabled = true;

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
    } catch (error) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        video.srcObject = null;
        button.textContent = "Start Camera";

        alert("Could not start camera: " + error.message);
    } finally {
        button.disabled = false;
    }
});

detectButton.addEventListener("click", async () => {
    if (!stream || !video.videoWidth) {
        resultBox.textContent =
            "Please start the camera first.";
        return;
    }

    detectButton.disabled = true;
    detectButton.textContent = "Analyzing...";
    resultBox.textContent =
        "Sending image to the AI. Please wait...";

    try {
        // Capture one frame from the live camera.
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                imageBlob => {
                    if (imageBlob) {
                        resolve(imageBlob);
                    } else {
                        reject(new Error("Could not capture image."));
                    }
                },
                "image/jpeg",
                0.90
            );
        });

        const imageFile = new File(
            [blob],
            "lettuce.jpg",
            { type: "image/jpeg" }
        );

        // Send the captured image to the Gradio prediction API.
        const client = await getAIClient();
        const response = await client.predict("/predict", [imageFile]);

        const prediction = response.data?.[0];

        resultBox.textContent =
            typeof prediction === "string"
                ? prediction
                : JSON.stringify(prediction ?? response.data);

    } catch (error) {
        console.error("Disease detection failed:", error);

        resultBox.textContent =
            "Detection failed: " + (error.message || String(error)) +
            "\nCheck that the Hugging Face Space is public and running.";
    } finally {
        detectButton.disabled = !stream;
        detectButton.textContent = "Detect Disease";
    }
});

// Camera detection is unavailable until the camera starts.
detectButton.disabled = true;
