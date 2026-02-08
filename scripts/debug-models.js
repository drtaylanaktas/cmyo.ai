const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function listModels() {
    console.log("Checking API Key: ", process.env.NEXT_PUBLIC_GEMINI_API_KEY ? "EXISTS" : "MISSING");
    const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY);

    try {
        console.log("Fetching available models...");
        // List models is not directly exposed in high-level simple API sometimes, 
        // but we can try a simple generation to see if it works with specific models,
        // OR use the model manager if available. 
        // Actually, for this SDK version, we might just try to hit a known model.

        // Let's try raw REST call to be sure, as SDK might hide details.
        const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.models) {
            console.log("AVAILABLE MODELS:");
            data.models.forEach(m => {
                if (m.supportedGenerationMethods.includes('generateContent')) {
                    console.log(`- ${m.name} (${m.displayName})`);
                }
            });
        } else {
            console.log("ERROR LISTING MODELS:", data);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

listModels();
