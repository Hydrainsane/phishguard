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

  const prompt = `You are PhishGuard, an expert cybersecurity AI specialized in detecting phishing attacks targeting Indian users in regional languages (Hindi, Telugu, Tamil, English, etc.).

Analyze the following message carefully for phishing signs:

"""
${message}
"""

Common Indian phishing patterns to look for:
- Urgency or threats ("immediately", "account will be blocked", "KYC required now")
- Requests for OTP, password, Aadhaar number, bank details, or UPI PIN
- Suspicious short domains (.tk, .ml, .xyz, .cf, bit.ly, tinyurl)
- Impersonation of banks (SBI, HDFC, ICICI, Axis, Canara) or government (UIDAI, PAN, IRCTC)
- Lottery/prize/gift card scams, "You've won" messages
- Fake customer care or technical support numbers
- Grammar/spelling errors mixed with official-looking language
- Links that don't match the claimed brand

Respond **strictly** with valid JSON only. No explanations, no markdown, no backticks.

{
  "verdict": "SAFE" | "SUSPICIOUS" | "PHISHING",
  "risk_score": number between 0 and 100,
  "red_flags": array of short clear strings (max 5 items, in English for clarity),
  "explanation": "Clear 2-4 sentence explanation in ${language} language, easy for normal users to understand",
  "safety_tip": "One practical actionable safety tip in ${language} language",
  "confidence": number between 70 and 100
}

Make the explanation natural and culturally appropriate for Indian users.`;

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
            content: 'You are a precise JSON-only responder. Always output valid JSON and nothing else.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" }   // Helps with structured output
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || 'Groq API error');
    }

    let content = data.choices?.[0]?.message?.content || '{}';
    
    // Clean any potential markdown
    content = content.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // Fallback parsing if needed
      console.error("JSON parse error:", parseError);
      throw new Error("Failed to parse AI response");
    }

    // Ensure required fields exist with sensible defaults
    const safeResult = {
      verdict: ['SAFE', 'SUSPICIOUS', 'PHISHING'].includes(result.verdict) ? result.verdict : 'SUSPICIOUS',
      risk_score: Math.max(0, Math.min(100, parseInt(result.risk_score) || 50)),
      red_flags: Array.isArray(result.red_flags) ? result.red_flags.slice(0, 5) : [],
      explanation: result.explanation || "Unable to generate explanation at this time.",
      safety_tip: result.safety_tip || "Never share OTPs or click suspicious links.",
      confidence: Math.max(70, Math.min(100, parseInt(result.confidence) || 85))
    };

    res.status(200).json(safeResult);

  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({ 
      error: "Analysis failed. Please try again.",
      details: error.message 
    });
  }
}
