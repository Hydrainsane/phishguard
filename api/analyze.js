export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, language = 'English' } = req.body;

  if (!message || message.trim().length < 10) {
    return res.status(400).json({ error: 'Please provide a valid message to analyze' });
  }

  const prompt = `You are PhishGuard, an expert cybersecurity AI for Indian users.

Message to analyze:
"""
${message}
"""

Analyze this message for phishing signs common in India (urgency, fake bank messages, OTP requests, suspicious links, lottery scams, Aadhaar/PAN fraud, etc.).

Respond **strictly in valid JSON only** (no extra text):

{
  "verdict": "SAFE" or "SUSPICIOUS" or "PHISHING",
  "risk_score": number between 0 and 100,
  "red_flags": ["flag 1", "flag 2", ...]  // maximum 5 short flags
  "explanation": "Clear explanation in ${language} language. Use simple, easy-to-understand words.",
  "safety_tip": "One useful safety advice in ${language} language."
}

Important instructions:
- Always reply in the language requested (${language}).
- If the user asks a follow-up question, answer it directly while referring to the original message.
- Keep explanations natural and helpful for normal Indian users.
- Do not use technical jargon unless necessary.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant that always responds with valid JSON only. Never add extra text.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1100,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || 'Groq API error');
    }

    let content = data.choices?.[0]?.message?.content || '{}';
    content = content.replace(/```json|```/g, '').trim();

    let result = JSON.parse(content);

    // Ensure safe output
    const safeResult = {
      verdict: ['SAFE', 'SUSPICIOUS', 'PHISHING'].includes(result.verdict?.toUpperCase()) 
        ? result.verdict.toUpperCase() 
        : 'SUSPICIOUS',
      risk_score: Math.max(0, Math.min(100, parseInt(result.risk_score) || 50)),
      red_flags: Array.isArray(result.red_flags) ? result.red_flags.slice(0, 5) : [],
      explanation: result.explanation || "Unable to generate explanation. Please try again.",
      safety_tip: result.safety_tip || "Never share your OTP or click on suspicious links."
    };

    res.status(200).json(safeResult);

  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ 
      error: "Failed to analyze the message. Please try again." 
    });
  }
}
