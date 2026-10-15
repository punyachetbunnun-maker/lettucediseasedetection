
const button = document.getElementById("startCamera");
const video = document.getElementById("video");

button.addEventListener("click", async () => {
  try {
    button.textContent = "Opening camera...";

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    button.textContent = "Camera Started";
  } catch (error) {
    button.textContent = "Start Camera";
    alert("Camera error: " + error.message);
    console.error(error);
  }
});
