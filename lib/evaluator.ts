// lib/evaluator.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function evaluateJobCompatibility(jobs: any[], constraints: Record<string, string>) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

    const constraintText = Object.entries(constraints)
        .filter(([_, val]) => val.trim() !== "")
        .map(([key, val]) => `- ${key.replace('_', ' ')}: ${val}`)
        .join("\n");

    // We inject your profile so the AI actually has something to compare the job against
    const userProfile = `
    Current Role: Software Developer at Meridian Credit Union.
    Education: Master of Engineering in Electrical and Computer Engineering (University of Windsor); B.Tech in Computer Engineering.
    Current Focus & Skills: Cloud Architecture (Azure AI-102, AZ-104, AZ-204), Docker, self-hosted environments, Project Management (Scrum/PMP frameworks).
    `;

    const prompt = `
    You are a strict recruitment filter evaluating jobs for the following candidate:
    
    CANDIDATE PROFILE: 
    ${userProfile}
    
    ${constraintText
            ? `CONSTRAINTS: ${constraintText}`
            : "CONSTRAINTS: None provided. Act as a general assistant and evaluate the job suitability based on standard developer expectations."}

    IF A REQUIREMENT IS EXPLICITLY PROVIDED AND NOT MET, MARK AS INCOMPATIBLE.
    
    JOBS: ${JSON.stringify(jobs.map(j => ({ id: j.id, description: j.description })))}

    Return a JSON array where each item has an ID and evaluation. You MUST include arrays of specific technical skills the candidate matches based on their profile, and gap skills they are missing based on the job requirements:
    [{ 
        "id": "...", 
        "isCompatible": boolean,
        "score": number (0-100, where 100 is a perfect match),
        "reasoning": "...",
        "matchedSkills": ["skill1", "skill2"],
        "missingSkills": ["skill3", "skill4"]
    }]
  `;

    console.log("--- SENDING TO GEMINI ---");
    console.log("Prompt:", prompt);

    const result = await model.generateContent(prompt);
    const rawResponse = result.response.text();

    console.log("--- GEMINI RESPONSE ---");
    console.log(rawResponse);

    return JSON.parse(rawResponse.replace(/```json|```/g, ""));
}