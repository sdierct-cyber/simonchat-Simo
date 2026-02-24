exports.handler = async (event) => {
  const { key } = JSON.parse(event.body || "{}");
  
  // Your secret key (change this later when you add payments)
  const VALID_KEY = "SIMO-PRO-2026";
  
  if (key === VALID_KEY) {
    return {
      statusCode: 200,
      body: JSON.stringify({ valid: true })
    };
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ valid: false })
  };
};
