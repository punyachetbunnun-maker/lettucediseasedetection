

const button = document.getElementById("startCamera");
const video = document.getElementById("video");

const latitude = document.getElementById("latitude");
const longitude = document.getElementById("longitude");
const locationStatus = document.getElementById("locationStatus");

let stream = null;
let locationWatch = null;

function startLocation() {
  if (!navigator.geolocation) {
    locationStatus.textContent = "Location is not supported.";
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
    return;
  }

  button.textContent = "Opening camera...";
  button.disabled = true;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: "environment" }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    button.textContent = "Stop Camera";
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
