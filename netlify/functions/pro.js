exports.handler = async (event) => {
  try {
    const { key } = JSON.parse(event.body || "{}");
    const VALID_KEY = "SIMO-PRO-2026";

    if (key === VALID_KEY) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: true, message: "Pro unlocked!" })
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ valid: false, message: "Invalid key" })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ valid: false }) };
  }
};
