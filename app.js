// ==================== app.js - COMPLETE WITH PRICING & NATURAL PERSONALITY (Feb 26 2026) ====================

let isPro = false;
let isTeam = false;
let currentUserVoice = 'female';
let simoMemory = JSON.parse(localStorage.getItem('simoMemory')) || [];
let messageCountToday = parseInt(localStorage.getItem('messageCountToday') || '0');
let todayDate = localStorage.getItem('todayDate') || new Date().toDateString();
let animationFrame;

const features = [
    {id:2, name:"Image Upload & Analysis", icon:"fas fa-camera", desc:"Upload any photo — Simo describes & helps"},
    {id:3, name:"3D Rendering & Rotate", icon:"fas fa-cube", desc:"Patent-ready 3D models — spin 360°"},
    {id:4, name:"Business Plans & Startups", icon:"fas fa-briefcase", desc:"Full plans generated instantly"},
    {id:5, name:"Stock Market & Portfolios", icon:"fas fa-chart-line", desc:"Live-style tracker + advice"},
    {id:6, name:"Mockups & App Designs", icon:"fas fa-mobile-alt", desc:"All platforms — iOS, Android, Web"}
];

// Reset daily message count
if (todayDate !== new Date().toDateString()) {
    messageCountToday = 0;
    localStorage.setItem('messageCountToday', '0');
    localStorage.setItem('todayDate', new Date().toDateString());
}

function init() {
    const nav = document.getElementById('featureList');
    nav.innerHTML = '';
    features.forEach(f => {
        const btn = document.createElement('button');
        btn.className = "w-full flex items-center gap-4 px-5 py-4 rounded-3xl hover:bg-zinc-800 text-left transition-all";
        btn.innerHTML = `<i class="${f.icon} text-3xl w-10"></i><div><div class="font-semibold">${f.name}</div><div class="text-sm text-zinc-400">${f.desc}</div></div>`;
        btn.onclick = () => openFeature(f.id);
        nav.appendChild(btn);
    });

    document.getElementById('chatArea').innerHTML = '';
    if (simoMemory.length === 0) {
        addMessage("simo", "Hey! I'm Simo 🤗 Here whenever you need to vent, share ideas, brainstorm, or just talk. What's on your mind?");
    } else {
        simoMemory.forEach(msg => addMessage(msg.sender, msg.text));
    }
}

function openFeature(id) {
    const f = features.find(x => x.id === id);
    document.getElementById('currentFeature').textContent = f.name;
    if (id === 2) showImageUploadModal();
    if (id === 3) show3DModal();
    if (id === 4) showBusinessModal();
    if (id === 5) showStockModal();
    if (id === 6) alert("Mockups & App Designs coming in next update ❤️");
}

function togglePro() {
    if (isPro) {
        isPro = false;
        isTeam = false;
        document.getElementById('proBtn').classList.remove('pro-glow');
        document.getElementById('proBtn').innerHTML = `<span>⭐ PRO MODE</span><i class="fas fa-star"></i>`;
        addMessage("simo", "Back to free tier 😊");
    } else {
        showPricingModal();
    }
}

function showPricingModal() {
    const html = `
        <div class="p-8">
            <h2 class="text-3xl font-bold mb-8 text-center">Choose Your Plan</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- Free -->
                <div class="bg-zinc-800 rounded-3xl p-6">
                    <h3 class="text-2xl font-bold">Free</h3>
                    <p class="text-4xl font-bold mt-4">$0</p>
                    <ul class="mt-6 space-y-3 text-sm">
                        <li>✅ 20 messages per day</li>
                        <li>✅ Basic chat & voice</li>
                        <li>❌ No downloads or exports</li>
                    </ul>
                    <button onclick="selectPlan('free')" class="mt-8 w-full py-4 bg-zinc-700 rounded-3xl font-bold">Stay Free</button>
                </div>
                <!-- Pro -->
                <div class="bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-6 text-white relative">
                    <div class="absolute top-4 right-4 bg-white text-black text-xs px-3 py-1 rounded-full font-bold">POPULAR</div>
                    <h3 class="text-2xl font-bold">Pro</h3>
                    <p class="text-4xl font-bold mt-4">$9.99<span class="text-sm font-normal">/mo</span></p>
                    <ul class="mt-6 space-y-3 text-sm">
                        <li>✅ Unlimited messages</li>
                        <li>✅ Downloads & 3D exports</li>
                        <li>✅ Save chats forever</li>
                        <li>✅ Priority voice</li>
                    </ul>
                    <button onclick="selectPlan('pro')" class="mt-8 w-full py-4 bg-white text-black rounded-3xl font-bold">Upgrade to Pro</button>
                </div>
                <!-- Team -->
                <div class="bg-zinc-800 rounded-3xl p-6">
                    <h3 class="text-2xl font-bold">Team</h3>
                    <p class="text-4xl font-bold mt-4">$29<span class="text-sm font-normal">/mo</span></p>
                    <ul class="mt-6 space-y-3 text-sm">
                        <li>✅ Everything in Pro</li>
                        <li>✅ Up to 5 users</li>
                        <li>✅ Shared chats & projects</li>
                        <li>✅ Admin controls</li>
                    </ul>
                    <button onclick="selectPlan('team')" class="mt-8 w-full py-4 bg-zinc-700 rounded-3xl font-bold">Choose Team</button>
                </div>
            </div>
            <p class="text-center text-xs text-zinc-500 mt-8">Cancel anytime • Test mode for now</p>
        </div>
    `;
    showModal(html);
}

function selectPlan(plan) {
    closeModal();
    if (plan === 'pro') {
        isPro = true;
        isTeam = false;
        document.getElementById('proBtn').classList.add('pro-glow');
        document.getElementById('proBtn').innerHTML = `⭐ PRO UNLOCKED — Everything downloadable!`;
        addMessage("simo", "🎉 Welcome to Pro! Unlimited messages, downloads, 3D exports, and more are now unlocked. Let's create!");
    } else if (plan === 'team') {
        isPro = true;
        isTeam = true;
        document.getElementById('proBtn').classList.add('pro-glow');
        document.getElementById('proBtn').innerHTML = `⭐ TEAM UNLOCKED — Multi-user & shared projects!`;
        addMessage("simo", "🎉 Team mode activated! Up to 5 people can now share chats and projects. Invite your team whenever you're ready.");
    }
}

// ==================== REAL AI BRAIN (Natural & Supportive) ====================
async function sendMessage() {
    const input = document.getElementById('userInput');
    const text = input.value.trim();
    if (!text) return;

    // Free tier limit
    if (!isPro && messageCountToday >= 20) {
        addMessage("simo", "You've reached the daily free limit (20 messages). Upgrade to Pro for unlimited chats ❤️");
        return;
    }

    addMessage("user", text);
    input.value = "";

    messageCountToday++;
    localStorage.setItem('messageCountToday', messageCountToday);

    const apiKey = localStorage.getItem('grokApiKey');
    if (!apiKey) {
        addMessage("simo", "I need an API key to think properly! Open Settings and add your free Grok key.");
        return;
    }

    const thinkingId = 'thinking-' + Date.now();
    addMessage("simo", `<span class="thinking">thinking<span class="dots">...</span></span>`, thinkingId);

    try {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "grok-4-fast-reasoning",
                messages: [
                    { role: "system", content: "You are Simo, a warm, supportive, fun close friend AI. Talk exactly like a real best friend texting — casual, natural, varied sentence starters. Be encouraging, kind, playful when it fits, use emojis sparingly but naturally. Call the user 'best friend' only occasionally (once every 3–5 messages max), never force it. Skip greetings like 'Hey best friend' most of the time — just dive into the conversation unless it feels right. Keep replies human-like, concise when possible, empathetic, and engaging. No repetitive phrases." },
                    { role: "user", content: text }
                ],
                stream: false
            })
        });

        const data = await res.json();
        const reply = data.choices[0].message.content;

        document.querySelector(`[data-id="${thinkingId}"]`)?.remove();
        addMessage("simo", reply);

    } catch (err) {
        document.querySelector(`[data-id^="thinking-"]`)?.remove();
        addMessage("simo", "Oops, connection issue 😅 Check your API key in Settings and try again.");
    }
}

function addMessage(sender, text, customId = null) {
    const area = document.getElementById('chatArea');
    const div = document.createElement('div');
    div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} message`;
    if (customId) div.setAttribute('data-id', customId);
    div.innerHTML = `<div class="${sender === 'simo' ? 'simo-bubble' : 'user-bubble'} px-6 py-4 rounded-3xl max-w-[75%]">${text}</div>`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;

    if (sender !== 'thinking') {
        simoMemory.push({sender, text});
        if (simoMemory.length > 50) simoMemory.shift();
        localStorage.setItem('simoMemory', JSON.stringify(simoMemory));
    }
}

// ==================== VOICE INPUT ====================
let recognition = null;
let isListening = false;

function toggleVoiceInput() {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        alert("Your browser doesn't support voice input 😅 Try Chrome or Edge!");
        return;
    }

    if (!recognition) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('userInput').value = transcript;
            sendMessage();
        };

        recognition.onerror = () => {
            isListening = false;
            document.getElementById('voiceBtn').innerHTML = `<i class="fas fa-microphone"></i>`;
            addMessage("simo", "Sorry, didn't catch that 😅 Try again?");
        };

        recognition.onend = () => {
            isListening = false;
            document.getElementById('voiceBtn').innerHTML = `<i class="fas fa-microphone"></i>`;
        };
    }

    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
        isListening = true;
        document.getElementById('voiceBtn').innerHTML = `<i class="fas fa-microphone text-red-500 animate-pulse"></i>`;
        addMessage("simo", "Listening... speak whenever you're ready 🎤");
    }
}

// ==================== MODALS & HELPERS (rest remains the same as before) ====================
function showModal(contentHTML) {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modalContent');
    content.innerHTML = `<button onclick="closeModal()" class="absolute top-6 right-6 text-4xl text-zinc-400 hover:text-white z-10">✕</button>${contentHTML}`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (animationFrame) cancelAnimationFrame(animationFrame);
}

// ... (the rest of your modals - showImageUploadModal, show3DModal, showBusinessModal, showStockModal, showSettings, saveApiKey, setTheme, showSignup, startNewChat, confirmClearHistory are unchanged from the last clean version I gave you)

window.onload = init;
