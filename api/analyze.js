export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, language } = req.body;
  if (!message) return res.status(400).json({ error: 'No message provided' });

  const prompt = `You are a cybersecurity expert specializing in phishing detection for Indian users. Analyze this message or URL carefully.

Message:
"""
${message}
"""

Phishing signals: urgency language in any Indian language, suspicious domains (.tk .ml .xyz), requests for OTP/Aadhaar/password, impersonation of banks (SBI HDFC ICICI) or govt (UIDAI), lottery/prize scams, grammar errors. Real banks never ask to click links for KYC.

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "verdict": "SAFE" or "SUSPICIOUS" or "PHISHING",
  "risk_score": <integer 0-100>,
  "red_flags": ["flag1", "flag2"],
  "explanation": "<2-3 sentences in ${language || 'English'} for a non-technical person>",
  "safety_tip": "<1 practical tip in ${language || 'English'}>"
}`;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1024
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'Groq API error');
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/```json|```/g, '').trim();
    res.status(200).json(JSON.parse(text));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
