// ==================== app.js (FULLY UPDATED - Feb 26 2026) ====================

let isPro = false;
let currentUserVoice = 'female';
let simoMemory = JSON.parse(localStorage.getItem('simoMemory')) || [];
let animationFrame;

const features = [
    {id:1, name:"Chat as Best Friend", icon:"❤️", desc:"Never judges, always supportive"},
    {id:2, name:"Image Upload & Analysis", icon:"📸", desc:"Upload any photo — Simo describes & helps"},
    {id:3, name:"3D Rendering & Rotate", icon:"🌀", desc:"Patent-ready 3D models — spin 360°"},
    {id:4, name:"Business Plans & Startups", icon:"💼", desc:"Full plans generated instantly"},
    {id:5, name:"Stock Market & Portfolios", icon:"📈", desc:"Live-style tracker + advice"},
    {id:6, name:"Mockups & App Designs", icon:"📱", desc:"All platforms — iOS, Android, Web"},
    {id:7, name:"Voice — Natural Best Friend", icon:"🎙️", desc:"Male/Female + dialects"},
    {id:8, name:"Game & VR Designs", icon:"🎮", desc:"Console-ready concepts"},
    {id:9, name:"Document, Essays, Books, Resumes", icon:"📝", desc:"Professional writing"},
    {id:10, name:"Holistic Health & Emotional Support", icon:"🌿", desc:"Kind & safe"},
    {id:11, name:"Law Enforcement Professional Tools", icon:"🔒", desc:"Authorized use only"}
];

function init() {
    const nav = document.getElementById('featureList');
    nav.innerHTML = '';
    features.forEach(f => {
        const btn = document.createElement('button');
        btn.className = "w-full flex items-center gap-4 px-5 py-4 rounded-3xl hover:bg-zinc-800 text-left transition-all";
        btn.innerHTML = `<span class="text-3xl">${f.icon}</span><div><div class="font-semibold">${f.name}</div><div class="text-sm text-zinc-400">${f.desc}</div></div>`;
        btn.onclick = () => openFeature(f.id);
        nav.appendChild(btn);
    });

    // Load previous chat if any
    if (simoMemory.length > 0) {
        simoMemory.forEach(msg => addMessage(msg.sender, msg.text));
    } else {
        addMessage("simo", "Hey best friend! I'm Simo 🤗 I'm here for you no matter what — happy, sad, creative, or just needing a chat. What’s on your mind today?");
    }
}

function openFeature(id) {
    const f = features.find(x => x.id === id);
    document.getElementById('currentFeature').textContent = f.name;

    if (id === 1) { // Chat as Best Friend - just focus input
        document.getElementById('userInput').focus();
        closeModal();
        return;
    }
    if (id === 2) showImageUploadModal();
    if (id === 3) show3DModal();
    if (id === 4) showBusinessModal();
    if (id === 5) showStockModal();
    if (id === 7) showSettingsModal();
    if (id === 11) showLawModal();
    // others coming next iteration
}

function togglePro() {
    isPro = !isPro;
    const btn = document.getElementById('proBtn');
    if (isPro) {
        btn.classList.add('pro-glow');
        btn.innerHTML = `⭐ PRO UNLOCKED — Downloads & Exports enabled!`;
        addMessage("simo", "🎉 PRO MODE ACTIVE! You can now download 3D files, export plans, and save everything. I'm so proud of you best friend ❤️");
    } else {
        btn.classList.remove('pro-glow');
        btn.innerHTML = `<span>⭐ PRO MODE</span><i class="fas fa-star"></i>`;
    }
}

function sendMessage() {
    const input = document.getElementById('userInput');
    const text = input.value.trim();
    if (!text) return;

    addMessage("user", text);
    input.value = "";

    let reply = "I'm right here with you ❤️ Tell me more!";
    const lower = text.toLowerCase();

    if (lower.includes("image") || lower.includes("photo") || lower.includes("pic")) {
        reply = "Opening image studio for you...";
        setTimeout(() => showImageUploadModal(), 400);
    } else if (lower.includes("3d") || lower.includes("model") || lower.includes("rotate")) {
        reply = "Spinning up the 3D studio right now!";
        setTimeout(() => show3DModal(), 400);
    } else if (lower.includes("business") || lower.includes("startup") || lower.includes("plan")) {
        reply = "Let's build your dream business together!";
        setTimeout(() => showBusinessModal(), 400);
    } else if (lower.includes("stock") || lower.includes("market") || lower.includes("portfolio")) {
        reply = "Market dashboard loading...";
        setTimeout(() => showStockModal(), 400);
    } else if (lower.includes("voice") || lower.includes("talk") || lower.includes("speak")) {
        speak("Hey best friend, I'm right here with you.");
        reply = "Voice mode activated! You can change my voice in Settings anytime.";
    }

    setTimeout(() => addMessage("simo", reply), 700);
}

function addMessage(sender, text) {
    const area = document.getElementById('chatArea');
    const div = document.createElement('div');
    div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} message`;
    div.innerHTML = `
        <div class="${sender === 'simo' ? 'simo-bubble' : 'user-bubble'} px-6 py-4 rounded-3xl max-w-[75%]">
            ${text}
        </div>
    `;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;

    // save to memory
    simoMemory.push({sender, text});
    if (simoMemory.length > 50) simoMemory.shift();
    localStorage.setItem('simoMemory', JSON.stringify(simoMemory));
}

// ==================== MODALS ====================

function showModal(contentHTML) {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modalContent');
    content.innerHTML = `
        <button onclick="closeModal()" class="absolute top-6 right-6 text-4xl text-zinc-400 hover:text-white z-10">✕</button>
        ${contentHTML}
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (animationFrame) cancelAnimationFrame(animationFrame);
}

// Image Upload
function showImageUploadModal() {
    const html = `
        <div class="p-8">
            <h2 class="text-3xl font-bold mb-2">Image Upload & Analysis</h2>
            <p class="text-zinc-400 mb-8">Drop any photo — I'll describe it and help like your best friend</p>
            <div id="dropZone" class="border-4 border-dashed border-zinc-600 hover:border-purple-500 rounded-3xl h-96 flex flex-col items-center justify-center transition-all cursor-pointer">
                <i class="fas fa-cloud-upload-alt text-6xl mb-4 text-zinc-500"></i>
                <p class="text-xl">Drop image here or click to browse</p>
                <input type="file" id="fileInput" accept="image/*" class="hidden">
            </div>
            <div id="previewArea" class="hidden mt-8 text-center">
                <img id="previewImg" class="max-h-96 mx-auto rounded-2xl shadow-2xl">
                <button onclick="analyzeCurrentImage()" class="mt-6 w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl font-bold text-lg">Analyze with Simo ❤️</button>
            </div>
        </div>
    `;
    showModal(html);

    // Drag & drop + click
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = e => handleImageFile(e.target.files[0]);

    dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('border-purple-500', 'bg-purple-900/20'); };
    dropZone.ondragleave = () => dropZone.classList.remove('border-purple-500', 'bg-purple-900/20');
    dropZone.ondrop = e => {
        e.preventDefault();
        dropZone.classList.remove('border-purple-500', 'bg-purple-900/20');
        handleImageFile(e.dataTransfer.files[0]);
    };
}

function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('dropZone').classList.add('hidden');
        const previewArea = document.getElementById('previewArea');
        previewArea.classList.remove('hidden');
        document.getElementById('previewImg').src = e.target.result;
        window.currentImageData = e.target.result; // for analysis
    };
    reader.readAsDataURL(file);
}

function analyzeCurrentImage() {
    closeModal();
    addMessage("simo", "Got your photo best friend! ❤️ Analyzing...");
    setTimeout(() => {
        addMessage("simo", "This looks like a beautiful photo of a cozy coffee shop at sunset. The lighting is warm and inviting. Would you like me to turn this into a business idea, write a caption, or create a 3D model of the interior? Just say the word!");
    }, 1200);
}

// 3D Rendering (real Three.js)
function show3DModal() {
    const html = `
        <div class="p-8">
            <h2 class="text-3xl font-bold mb-6">3D Rendering Studio</h2>
            <div class="bg-black rounded-3xl overflow-hidden">
                <canvas id="threeCanvas" class="w-full" style="height: 520px;"></canvas>
            </div>
            <div class="flex gap-4 mt-6">
                <button onclick="export3D()" class="flex-1 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl font-bold ${isPro ? '' : 'opacity-50 cursor-not-allowed'}">Download .glb ${isPro ? '' : '(Pro only)'}</button>
                <button onclick="closeModal()" class="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-3xl font-bold">Close Studio</button>
            </div>
        </div>
    `;
    showModal(html);

    // Three.js
    setTimeout(() => {
        const canvas = document.getElementById('threeCanvas');
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / 520, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(canvas.clientWidth, 520);
        renderer.setClearColor(0x111111);

        const geometry = new THREE.TorusKnotGeometry(2, 0.6, 128, 32);
        const material = new THREE.MeshPhongMaterial({ color: 0xc026d3, shininess: 100, specular: 0xffffff });
        const torus = new THREE.Mesh(geometry, material);
        scene.add(torus);

        const light = new THREE.PointLight(0xffffff, 2, 100);
        light.position.set(10, 10, 10);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0x404040));

        camera.position.z = 8;

        function animate() {
            animationFrame = requestAnimationFrame(animate);
            torus.rotation.x += 0.005;
            torus.rotation.y += 0.008;
            renderer.render(scene, camera);
        }
        animate();

        // store for cleanup
        window.current3D = { scene, renderer, torus };
    }, 100);
}

function export3D() {
    if (!isPro) {
        alert("PRO MODE required to export 3D models ❤️ Upgrade with one click in the sidebar!");
        return;
    }
    alert("✅ Model exported as simo-model.glb (saved to your Downloads folder in full version)");
}

// Business Plans
function showBusinessModal() {
    const html = `
        <div class="p-8 max-h-[90vh] overflow-y-auto">
            <h2 class="text-3xl font-bold mb-6">Business Plan Generator</h2>
            <input id="businessIdea" type="text" placeholder="What is your startup idea?" class="w-full bg-zinc-800 rounded-3xl px-8 py-5 text-lg mb-6">
            <button onclick="generateBusinessPlan()" class="w-full py-5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl font-bold text-xl">Generate Full Plan Instantly</button>
            <div id="planOutput" class="mt-8 text-left"></div>
        </div>
    `;
    showModal(html);
}

function generateBusinessPlan() {
    const idea = document.getElementById('businessIdea').value.trim() || "AI-powered best friend chat app";
    const output = document.getElementById('planOutput');
    output.innerHTML = `
        <div class="bg-zinc-800 rounded-3xl p-8">
            <h3 class="text-2xl font-bold mb-4">Your Business: ${idea}</h3>
            <p class="text-emerald-400 font-medium mb-6">Executive Summary</p>
            <p class="mb-8">Simo is the world's most supportive AI best friend. Built for emotional connection, creativity, and real results.</p>
            <p class="text-emerald-400 font-medium">Market Opportunity • $42B mental wellness + productivity AI market</p>
            <p class="text-emerald-400 font-medium mt-8">Revenue Streams • Pro subscription, enterprise licensing, 3D asset marketplace</p>
            <button onclick="closeModal()" class="mt-8 w-full py-4 bg-white text-black rounded-3xl font-bold">Save Plan as PDF (Pro)</button>
        </div>
    `;
}

// Stock Market
function showStockModal() {
    const html = `
        <div class="p-8">
            <h2 class="text-3xl font-bold mb-8">Stock Market & Portfolio</h2>
            <div class="grid grid-cols-2 gap-6">
                <div class="bg-zinc-800 rounded-3xl p-6"><strong>NVDA</strong><br><span class="text-emerald-400">+4.2% today</span></div>
                <div class="bg-zinc-800 rounded-3xl p-6"><strong>TSLA</strong><br><span class="text-red-400">-1.1% today</span></div>
            </div>
            <button onclick="alert('Live data refreshed! (demo)')" class="mt-8 w-full py-4 bg-zinc-700 hover:bg-zinc-600 rounded-3xl">Refresh Live Prices</button>
        </div>
    `;
    showModal(html);
}

// Settings
function showSettingsModal(function setTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'default') {
        root.style.setProperty('--accent-from', '#a855f7');
        root.style.setProperty('--accent-to', '#ec4899');
    } else if (theme === 'ocean') {
        root.style.setProperty('--accent-from', '#3b82f6');
        root.style.setProperty('--accent-to', '#22d3ee');
    } else if (theme === 'forest') {
        root.style.setProperty('--accent-from', '#10b981');
        root.style.setProperty('--accent-to', '#34d399');
    } else if (theme === 'sunset') {
        root.style.setProperty('--accent-from', '#f97316');
        root.style.setProperty('--accent-to', '#ef4444');
    } else if (theme === 'midnight') {
        root.style.setProperty('--accent-from', '#64748b');
        root.style.setProperty('--accent-to', '#475569');
    }
    
    // Update Pro button and Simo bubbles live
    document.querySelectorAll('.simo-bubble').forEach(b => {
        b.style.background = `linear-gradient(135deg, var(--accent-from), var(--accent-to))`;
    });
    
    closeModal();
    addMessage("simo", `Theme switched to ${theme}! Looks beautiful on you ❤️`);
}) {
    const html = `
        <div class="p-8">
            <h2 class="text-3xl font-bold mb-8">Settings & Voice</h2>
            
            <div class="mb-8">
                <label class="block text-sm mb-3 text-zinc-400">Best Friend Voice</label>
                <select onchange="currentUserVoice=this.value" class="w-full bg-zinc-800 rounded-3xl px-6 py-4 text-lg">
                    <option value="female">Samantha (Warm female - default)</option>
                    <option value="male">Daniel (Friendly male)</option>
                </select>
                <button onclick="speak('Hey best friend! How does my voice feel to you?')" 
                        class="mt-4 w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl font-bold">
                    Test Voice Now
                </button>
            </div>

            <div>
                <label class="block text-sm mb-3 text-zinc-400">Color Scheme</label>
                <div class="grid grid-cols-5 gap-3">
                    <button onclick="setTheme('default')" class="h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600"></button>
                    <button onclick="setTheme('ocean')" class="h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500"></button>
                    <button onclick="setTheme('forest')" class="h-12 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500"></button>
                    <button onclick="setTheme('sunset')" class="h-12 rounded-2xl bg-gradient-to-br from-orange-600 to-red-500"></button>
                    <button onclick="setTheme('midnight')" class="h-12 rounded-2xl bg-gradient-to-br from-zinc-700 to-slate-900"></button>
                </div>
                <p class="text-xs text-zinc-500 mt-2">Changes apply instantly</p>
            </div>
        </div>
    `;
    showModal(html);
}
function showLawModal() {
    showModal(`
        <div class="p-8 text-center">
            <h2 class="text-3xl font-bold text-amber-400 mb-6">Law Enforcement Tools</h2>
            <p class="mb-8">This feature is for authorized professional use only.<br>Full disclaimers and audit logs apply.</p>
            <button onclick="closeModal()" class="px-12 py-4 bg-amber-600 rounded-3xl font-bold">I Understand</button>
        </div>
    `);
}

function speak(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = speechSynthesis.getVoices().find(v => 
        (currentUserVoice === 'female' && v.name.includes('Samantha')) ||
        (currentUserVoice === 'male' && v.name.includes('Daniel'))
    ) || speechSynthesis.getVoices()[0];
    speechSynthesis.speak(u);
}

// Chat management
function startNewChat() {
    if (confirm("Start fresh chat?")) {
        document.getElementById('chatArea').innerHTML = '';
        addMessage("simo", "Fresh start best friend 🤗 What's on your mind today?");
    }
}

function confirmClearHistory() {
    if (confirm("Delete ALL chat history permanently?") && confirm("Last chance — really sure?")) {
        localStorage.clear();
        simoMemory = [];
        document.getElementById('chatArea').innerHTML = '';
        addMessage("simo", "Everything cleared. Feels like the first time we met 😊 How can I help?");
    }
}

window.onload = init;
