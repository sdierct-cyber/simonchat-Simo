exports.handler = async (event) => {

if(event.httpMethod !== "POST"){
  return { statusCode:405, body:"Use POST" };
}

const { key } = JSON.parse(event.body || "{}");

const validKeys = (process.env.PRO_LICENSE_KEYS || "").split(",");

if(validKeys.includes(key)){
  return {
    statusCode:200,
    body:JSON.stringify({ ok:true })
  };
}

return {
  statusCode:200,
  body:JSON.stringify({ ok:false })
};
};
