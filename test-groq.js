import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.error("❌ GROQ_API_KEY not found in environment variables.");
  process.exit(1);
}

const groq = new Groq({
  apiKey: apiKey
});

async function testGroq() {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are a professional academic performance evaluator."
        },
        {
          role: "user",
          content: `
Academic Score: 82
Video Confidence: 65
Survey Confidence: 70

Generate professional feedback with:
- Strengths
- Areas for improvement
- Exactly 2 actionable steps
`
        }
      ],
      temperature: 0.4
    });

    console.log("\nAI OUTPUT:\n");
    console.log(completion.choices[0].message.content);

  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }
}

testGroq();