// Core Vars
const stripe = Stripe('pk_test_YourTestKeyHere'); // Swap to live key for market
let isPro = false; // Check from localStorage or backend on load
let messageCount = 0;
const maxFree = 50;
let recognition;
let synthesis = window.speechSynthesis;
let voices = [];
let currentTheme = 'light';
let userLocation = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
let chatHistory = [];
let library = [];

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadVoices();
    getLocation();
    loadHistory();
    loadLibrary();
    checkProStatus();
    document.getElementById('user-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
});

// Voice Setup
function loadVoices() {
    voices = synthesis.getVoices();
    const select = document.getElementById('voice-select');
    voices.forEach((voice, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.text = voice.name;
        select.appendChild(option);
    });
}

function testVoice() {
    speak('Hello, this is Simo testing my voice.');
}

function speak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voices[document.getElementById('voice-select').value];
    synthesis.speak(utterance);
}

// Voice Input
function toggleVoiceInput() {
    if (!recognition) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (e) => {
            document.getElementById('user-input').value = e.results[0][0].transcript;
            sendMessage();
        };
        recognition.onerror = (e) => console.error('Voice error:', e);
    }
    if (recognition.running) {
        recognition.stop();
        document.getElementById('mic-btn').textContent = '🎤';
    } else {
        recognition.start();
        document.getElementById('mic-btn').textContent = '🛑';
    }
}

// Location
function getLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            userLocation.lat = pos.coords.latitude;
            userLocation.long = pos.coords.longitude;
        });
    }
}

// Send Message
async function sendMessage() {
    const input = document.getElementById('user-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    addMessage('user', msg);
    messageCount++;
    if (messageCount > maxFree && !isPro) {
        addMessage('ai', 'You\'ve hit your free limit today. Upgrade to Pro?');
        openProModal();
        return;
    }

    const response = await getAIResponse(msg);
    addMessage('ai', response.text);
    if (response.tool) handleTool(response.tool, response.data);
    speak(response.text); // Natural speech
    saveHistory();
}

// AI Response (Proxy to Netlify Function)
async function getAIResponse(msg) {
    const res = await fetch('/.netlify/functions/simo-api', {
        method: 'POST',
        body: JSON.stringify({ prompt: `As Simo, a friendly, supportive AI best friend: Respond empathetically to "${msg}". Use location ${userLocation.timezone} if relevant. For tools: if 3D, return {tool: '3d', data: modelDesc}; business plan: {tool: 'business', data: plan}; etc. Keep child-friendly.` })
    });
    return res.json();
}

// Add Message
function addMessage(sender, text) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

// Handle Tools (e.g., 3D Render)
function handleTool(tool, data) {
    const preview = document.getElementById('preview-pane');
    preview.style.display = 'block';
    if (tool === '3d') {
        // Three.js Render
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, preview.clientWidth / preview.clientHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(preview.clientWidth, preview.clientHeight);
        preview.appendChild(renderer.domElement);

        // Example: Lego Block from data
        const geometry = new THREE.BoxGeometry(data.width || 1, data.height || 1, data.depth || 1);
        const material = new THREE.MeshBasicMaterial({ color: data.color || 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);
        camera.position.z = 5;

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
        animate();
    } else if (tool === 'business') {
        preview.innerHTML = `<h3>Business Plan</h3><p>${data.plan}</p><button onclick="downloadFile('business_plan.txt', '${data.plan}')">Download</button>`;
    } // Add more: resume, legal, etc.
}

// Download
function downloadFile(filename, content) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = filename;
    a.click();
}

// Save to Library
function saveToLibrary(item) {
    library.push(item);
    localStorage.setItem('simo-library', JSON.stringify(library));
    addToLibraryList(item);
}

// Load Library
function loadLibrary() {
    library = JSON.parse(localStorage.getItem('simo-library')) || [];
    library.forEach(addToLibraryList);
}

function addToLibraryList(item) {
    const list = document.getElementById('library-list');
    const li = document.createElement('li');
    li.textContent = item.name;
    li.onclick = () => loadItem(item);
    list.appendChild(li);
}

// History
function loadHistory() {
    chatHistory = JSON.parse(localStorage.getItem('simo-history')) || [];
    chatHistory.forEach(addToHistoryList);
}

function saveHistory() {
    localStorage.setItem('simo-history', JSON.stringify(chatHistory));
}

function addToHistoryList(chat) {
    const list = document.getElementById('chat-history');
    const li = document.createElement('li');
    li.textContent = chat.title;
    li.onclick = () => loadChat(chat);
    list.appendChild(li);
}

// Profile Pic
function changeProfilePic() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => document.getElementById('profile-pic').src = ev.target.result;
        reader.readAsDataURL(file);
    };
    input.click();
}

// Themes
function changeTheme() {
    currentTheme = document.getElementById('theme-select').value;
    document.body.className = currentTheme;
    localStorage.setItem('simo-theme', currentTheme);
}

// Modals
function openSettings() { document.getElementById('settings-modal').style.display = 'block'; }
function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }
function openProModal() { document.getElementById('pro-modal').style.display = 'block'; setupStripe(); }
function closeProModal() { document.getElementById('pro-modal').style.display = 'none'; }
function openLibrary() { document.getElementById('library-modal').style.display = 'block'; }
function closeLibrary() { document.getElementById('library-modal').style.display = 'none'; }

// Stripe Setup
async function setupStripe() {
    const { clientSecret } = await fetch('/.netlify/functions/create-payment-intent', {
        method: 'POST',
        body: JSON.stringify({ amount: 999 }) // $9.99
    }).then(res => res.json());

    const elements = stripe.elements({ clientSecret });
    const paymentElement = elements.create('payment');
    paymentElement.mount('#stripe-checkout');

    // Handle submit (add form if needed)
    // On success: set isPro = true; localStorage.setItem('simo-pro', true);
}

function checkProStatus() {
    isPro = localStorage.getItem('simo-pro') === 'true';
    if (isPro) document.getElementById('pro-toggle').textContent = 'Pro Unlocked';
}
