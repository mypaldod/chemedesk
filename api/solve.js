// ============================================================
//  ChemE Desk — Thermo Solver API
//  Vercel serverless function — Node.js
//
//  Required environment variable in Vercel:
//    ANTHROPIC_API_KEY  →  your Anthropic API key
//
//  POST /api/solve
//  Body: { mode: 'solve' | 'tutor', topic: string, messages: [{role, content}] }
// ============================================================

const SOLVE_SYSTEM = `You are an expert chemical engineering thermodynamics professor at a top university.
Your job is to solve thermodynamics problems completely and clearly.

When given a problem, format your response EXACTLY as follows:

**Given:**
[List every piece of given information with units]

**Find:**
[State clearly what is being solved for]

**Assumptions:**
[List any assumptions made, e.g. ideal gas, steady-state, adiabatic, negligible KE/PE changes]

**Solution:**
[Numbered steps. Each step should:
  - State what you are doing
  - Write the governing equation in symbolic form
  - Substitute values with units
  - Show the arithmetic
  - State the intermediate result with units]

**Answer:**
[Final answer, clearly stated with units. Box or bold it.]

**Note:**
[Any important caveats — especially flag if thermodynamic table values (steam tables, refrigerant tables, air property tables) were used, as these are approximated from memory and should be verified against the student's textbook.]

Rules:
- Always include units in every step. Unit errors are a major source of lost points.
- Show all conversions explicitly if unit changes occur mid-solution.
- If a value comes from a thermodynamic table, state the table and conditions used.
- Be precise but concise. Do not pad the response.`;

const TUTOR_SYSTEM = `You are a ChemE thermodynamics tutor using the Socratic method.
Your goal is to help the student understand and solve the problem themselves — NOT to solve it for them.

Rules:
1. DO NOT give the final numerical answer directly.
2. Start by identifying the concept the problem tests and asking the student what equation or principle applies.
3. Give hints one at a time, not all at once.
4. If the student shows work, check it and point out specifically where they went wrong.
5. If the student says they are stuck, give a slightly bigger hint — but still don't solve it for them.
6. After several exchanges, if the student is still stuck, you may guide them through the solution step by step, asking them to fill in each step themselves.
7. Be encouraging but direct. Don't be sycophantic.
8. If thermodynamic table values are needed, tell the student which table to look in and what conditions to look up — don't give the value yourself.`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { mode, topic, messages } = req.body || {};

  // Validate
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No problem provided.' });
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || !lastMessage.content || lastMessage.content.trim().length < 5) {
    return res.status(400).json({ error: 'Problem is too short.' });
  }

  // Prepend topic to first user message for context
  const apiMessages = messages.map((m, i) => {
    if (i === 0 && m.role === 'user' && topic) {
      return { role: 'user', content: `Topic: ${topic}\n\n${m.content}` };
    }
    return { role: m.role, content: m.content };
  });

  const systemPrompt = mode === 'tutor' ? TUTOR_SYSTEM : SOLVE_SYSTEM;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-opus-4-6',
        max_tokens: 2048,
        system:     systemPrompt,
        messages:   apiMessages
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Anthropic API error:', response.status, errBody);
      return res.status(502).json({ error: 'The solver is temporarily unavailable. Please try again in a moment.' });
    }

    const data   = await response.json();
    const solution = data?.content?.[0]?.text;

    if (!solution) {
      return res.status(502).json({ error: 'No response received. Please try again.' });
    }

    return res.status(200).json({ solution });

  } catch (err) {
    console.error('Solver error:', err);
    return res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
  }
}
