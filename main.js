
const button = document.getElementById("startCamera");
const video = document.getElementById("video");

let stream = null;

button.addEventListener("click", async () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    button.textContent = "Start Camera";
    return;
  }

  button.textContent = "Opening camera...";
  button.disabled = true;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    button.textContent = "Stop Camera";
  } catch (error) {
    alert("Could not open camera: " + error.message);
    button.textContent = "Start Camera";
  } finally {
    button.disabled = false;
  }
});
