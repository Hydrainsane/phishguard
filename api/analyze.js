export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, language = 'English' } = req.body;

  if (!message || message.trim().length < 5) {
    return res.status(400).json({ error: 'Please provide a valid message' });
  }

  const prompt = `You are PhishGuard, an expert cybersecurity assistant specialized in Indian regional language phishing detection.

User message:
"""
${message}
"""

Analyze this carefully for phishing. Consider urgency, suspicious links, requests for OTP/Aadhaar/password, bank/government impersonation, lottery scams, etc.

Respond in **valid JSON only** with this exact structure:

{
  "verdict": "SAFE" | "SUSPICIOUS" | "PHISHING",
  "risk_score": number (0-100),
  "red_flags": ["short clear flag 1", "short clear flag 2"],
  "explanation": "Clear, easy-to-understand explanation in ${language} language. Use simple words suitable for normal users.",
  "safety_tip": "One practical, actionable safety advice in ${language} language."
}

Rules:
- If the user is asking a follow-up question (like "why", "explain", "is it safe", "tell me more"), give a helpful, direct answer while still referencing the original message.
- Keep explanation natural and culturally appropriate for Indian users.
- Be honest and educational.
- Never hallucinate links or facts.`;

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
            content: 'You are a precise JSON-only assistant. Always respond with valid JSON and nothing else.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.15,
        max_tokens: 1200,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || 'Groq API error');
    }

    let content = data.choices?.[0]?.message?.content || '{}';
    content = content.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      throw new Error("Failed to parse AI response");
    }

    // Safe defaults
    const safeResult = {
      verdict: ['SAFE', 'SUSPICIOUS', 'PHISHING'].includes(result.verdict) ? result.verdict : 'SUSPICIOUS',
      risk_score: Math.max(0, Math.min(100, parseInt(result.risk_score) || 60)),
      red_flags: Array.isArray(result.red_flags) ? result.red_flags.slice(0, 6) : [],
      explanation: result.explanation || "I analyzed the message. Please try rephrasing your question.",
      safety_tip: result.safety_tip || "Never share OTPs or click suspicious links. Verify directly from official apps/websites."
    };

    res.status(200).json(safeResult);

  } catch (error) {
    console.error("Backend error:", error);
    res.status(500).json({ 
      error: "Analysis failed. Please try again.",
      details: error.message 
    });
  }
}
