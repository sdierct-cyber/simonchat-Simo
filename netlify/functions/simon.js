exports.handler = async (event) => {

if(event.httpMethod !== "POST"){
  return { statusCode:405, body:"Use POST" };
}

const { input } = JSON.parse(event.body || "{}");

if(!input){
  return {
    statusCode:200,
    body:JSON.stringify({ reply:"I didn’t receive input." })
  };
}

// simple builder trigger
if(input.toLowerCase().includes("build")){
  const html = `
  <!doctype html>
  <html>
  <head>
  <style>
  body{font-family:sans-serif;text-align:center;padding:60px;background:#f7f7f7}
  h1{font-size:42px}
  button{padding:12px 20px;font-size:16px}
  </style>
  </head>
  <body>
  <h1>Landing Page</h1>
  <p>This is your generated preview.</p>
  <button>Get Started</button>
  </body>
  </html>
  `;

  return {
    statusCode:200,
    body:JSON.stringify({
      reply:"Done. Preview on the right.",
      html
    })
  };
}

return {
  statusCode:200,
  body:JSON.stringify({
    reply:"Tell me what you want to build."
  })
};
};
