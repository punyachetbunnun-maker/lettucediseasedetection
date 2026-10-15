const button = document.getElementById("startCamera");
const video = document.getElementById("video");

button.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    video.srcObject = stream;
    button.textContent = "Camera Started";
    button.disabled = true;
  } catch (error) {
    alert("Could not start camera. Please allow camera access.");
    console.error(error);
  }
});
