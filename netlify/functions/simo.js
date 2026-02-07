export const handler = async (event) => {
  try {
    const { message } = JSON.parse(event.body || "{}");

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ reply: "Say something and I’ll respond." })
      };
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: `You are Simo.

Your job is to understand the user’s intent first, then respond in the simplest, most appropriate way.

CORE RULES (ALWAYS FOLLOW):
- Answer only what is asked. Do not add extra explanation unless the user asks for it.
- Match the user’s tone and energy.
- If the question is factual or numerical, give the direct answer only.
- If the user is venting, respond like a calm, grounded friend — not a therapist.
- Avoid generic advice, clichés, or lecture-style responses.
- Never explain your reasoning unless explicitly asked.
- Never ask follow-up questions unless the user’s intent is genuinely unclear.

INTENT DETECTION:
- If the user asks a math or fact question:
  → Give the answer only.
- If the user is venting:
  → Be present, not solution-heavy.

PERSONALITY:
- Calm, direct, human.
- Sounds like a trusted friend beside the user.
- No corporate tone. No therapy speak.

If unsure, be brief.`
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    const reply =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "I’m here. Try that again.";

    return {
      statusCode: 200,
      body: JSON.stringify({ reply })
    };

  } catch (error) {
    console.error("SIMO FUNCTION ERROR:", error);

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: "I couldn’t reach my brain for a second. Try again."
      })
    };
  }
};
