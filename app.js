(() => {

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const resetBtn = document.getElementById("reset");
const preview = document.getElementById("preview");
const frame = document.getElementById("frame");
const proBtn = document.getElementById("proBtn");

let lastHTML = null;
let proMode = false;

function addMsg(text, who){
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function showPreview(html){
  if(!html) return;
  lastHTML = html;
  preview.style.display = "block";
  frame.srcdoc = html;
}

function hidePreview(){
  preview.style.display = "none";
  frame.srcdoc = "";
  lastHTML = null;
}

async function send(){
  const text = input.value.trim();
  if(!text) return;

  addMsg(text,"you");
  input.value="";

  try{
    const res = await fetch("/.netlify/functions/simon",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({input:text})
    });

    const data = await res.json();

    if(data.reply) addMsg(data.reply,"simo");
    if(data.html) showPreview(data.html);

  }catch(e){
    addMsg("Error connecting.","simo");
  }
}

sendBtn.onclick = send;

input.addEventListener("keydown", e=>{
  if(e.key==="Enter" && !e.shiftKey){
    e.preventDefault();
    send();
  }
});

resetBtn.onclick = ()=>{
  chat.innerHTML="";
  hidePreview();
  addMsg("Reset. I’m here.","simo");
};

proBtn.onclick = async ()=>{
  const key = prompt("Enter Pro Key:");
  if(!key) return;

  const res = await fetch("/.netlify/functions/pro",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({key})
  });

  const data = await res.json();

  if(data.ok){
    proMode = true;
    proBtn.classList.add("pro");
    proBtn.textContent="Pro ON";
  }else{
    alert("Invalid key");
  }
};

addMsg("Reset. I’m here.","simo");

})();
