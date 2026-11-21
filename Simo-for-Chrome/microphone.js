const enable = document.getElementById("enable");
const result = document.getElementById("result");

enable.addEventListener("click", async () => {
  enable.disabled = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    stream.getTracks().forEach(track => track.stop());
    result.textContent = "Microphone enabled. Return to the Simo side panel and click its microphone.";
  } catch {
    result.textContent = "Microphone access is unavailable. Check the site's permissions in Chrome and try again.";
    enable.disabled = false;
  }
});
