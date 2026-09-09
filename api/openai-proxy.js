// Serverless function that proxies requests to OpenAI, keeping your API key
// server-side. Written for Vercel's Node function format — see README.md for
// the Netlify/Cloudflare equivalents.
//
// Set OPENAI_API_KEY as an environment variable / secret in your hosting
// dashboard. Never put it in this file or in any client-side code.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { system, user, json } = req.body || {};
  if (!user) {
    return res.status(400).json({ error: "Missing 'user' field" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system || "You are a helpful assistant." },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "Upstream AI error", details: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({ content });
  } catch (err) {
    return res.status(500).json({ error: "Proxy failure", details: String(err) });
  }
}
