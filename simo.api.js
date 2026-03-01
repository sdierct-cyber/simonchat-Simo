const fetch = require('node-fetch');

exports.handler = async (event) => {
    const { prompt } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY; // Set in Netlify env vars (or xAI key)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    return { statusCode: 200, body: JSON.stringify({ text: data.choices[0].message.content, tool: parseTool(data.choices[0].message.content) }) }; // Parse if tool response
};

function parseTool(text) {
    // Simple parse for {tool: ..., data: ...}
    try { return JSON.parse(text.match(/\{.*\}/)[0]); } catch { return null; }
}
