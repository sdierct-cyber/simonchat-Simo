import fetch from "node-fetch";

export const handler = async (event) => {
  try {
    const { message } = JSON.parse(event.body || "{}");

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ reply: "Say something and I’ll respond." })
      };
    }

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are Simo.

Your job is to understand the user’s intent first, then respond in the simplest, most appropriate way.

- Answer only what is asked.
- Match the user’s tone.
- Be brief by default.
- Never over-explain.
- If the user asks math or facts, give the answer only.
- If the user vents, respond like a grounded friend.

If unsure, be concise.`
            },
            {
              role: "user",
              content: message
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      throw new Error("No response from OpenAI");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: data.choices[0].message.content
      })
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
