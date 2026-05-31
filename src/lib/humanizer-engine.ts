import OpenAI from 'openai';

export interface AIDetectionResult {
    score: number; // 0-100
    metrics: {
        perplexity: 'High' | 'Medium' | 'Low';
        burstiness: 'High' | 'Medium' | 'Low';
        repetitiveWordsScore: number;
        roboticTransitionsScore: number;
    };
    highlights: Array<{
        originalText: string;
        reason: string;
    }>;
    feedback: string;
}

export interface HumanizeResult {
    humanizedText: string;
    aiScoreAfter: number;
    auditLog: string[];
}

function getOpenAIClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API anahtarı bulunamadı. Lütfen OPENAI_API_KEY ortam değişkenini kontrol edin.');
    }
    return new OpenAI({ apiKey });
}

/**
 * Metindeki AI tespit olasılığını ve robotik kalıpları analiz eder.
 */
export async function detectAI(text: string): Promise<AIDetectionResult> {
    const openai = getOpenAIClient();

    const systemPrompt = `You are a strict, world-class academic AI writing detector similar to Turnitin, GPTZero, and Copyleaks.
Your job is to analyze the input text for patterns of AI generation. Focus on statistical markers such as:
1. Perplexity (predictability of words; AI tends to choose highly predictable words).
2. Burstiness (variation in sentence lengths and structure; AI writing has very low burstiness, i.e., sentences are of uniform length and structure).
3. Repetitive vocabulary and robotic transition words ('delve', 'testament', 'pinnacle', 'moreover', 'furthermore', 'not only... but also', 'it is worth noting').

You MUST analyze the text and respond ONLY with a raw JSON object matching the following TypeScript interface schema:
interface AIDetectionResult {
    score: number; // Overall probability score from 0 (100% human) to 100 (100% AI-generated)
    metrics: {
        perplexity: 'High' | 'Medium' | 'Low';
        burstiness: 'High' | 'Medium' | 'Low';
        repetitiveWordsScore: number; // 0 to 100
        roboticTransitionsScore: number; // 0 to 100
    };
    highlights: Array<{
        originalText: string; // The exact sentence or phrase that sounds highly robotic or AI-generated
        reason: string; // Brief explanation in Turkish of why this phrase was flagged (e.g., "Overused ChatGPT transition", "Uniform sentence structure")
    }>;
    feedback: string; // Helpful detailed feedback in Turkish for how the author can make the text sound more human and improve perplexity/burstiness.
}

Do not include any markdown code blocks (\`\`\`json) or conversational text. Return only the raw JSON.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Please analyze this text:\n\n${text}` }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
        throw new Error('Yapay zeka analiz raporu boş döndü.');
    }

    return JSON.parse(content) as AIDetectionResult;
}

/**
 * 4 aşamalı insansılaştırma playbook'unu uygulayarak metni yeniden yazar.
 */
export async function humanizeText(
    text: string, 
    voiceSample?: string, 
    targetLanguage?: 'auto' | 'tr' | 'en'
): Promise<HumanizeResult> {
    const openai = getOpenAIClient();

    let languageInstruction = "";
    if (targetLanguage === 'tr') {
        languageInstruction = "You MUST write the final humanizedText in Turkish (translate the text to Turkish if the input text is in English).";
    } else if (targetLanguage === 'en') {
        languageInstruction = "You MUST write the final humanizedText in English (translate the text to English if the input text is in Turkish).";
    } else {
        languageInstruction = "You MUST automatically detect the language of the input text (typically Turkish or English) and write the final humanizedText in the EXACT SAME LANGUAGE as the input text. Do not translate the text to another language; only rewrite it to bypass AI detectors in its original language.";
    }

    const systemPrompt = `You are an elite, world-class academic editor and writing humanizer. Your task is to rewrite the input text so that it sounds completely natural, organic, and written by a seasoned academic, effectively bypassing Turnitin and GPTZero detection while preserving 100% of the scientific facts, arguments, tables, and reference markers (like [1], (Smith et al., 2024)).

${languageInstruction}

Follow this 4-pass humanizing playbook:
1. Style Calibration: If a voiceSample is provided, analyze its rhythm, perplexity profile, active vs passive voice ratio, and average sentence length. Match this writing style closely in your rewrite.
2. AI-ism Removal: Eliminate ChatGPT/Claude transition slop (e.g. 'moreover', 'furthermore', 'crucial', 'essential', 'delve', 'in conclusion', 'not only... but also', 'it is worth noting', 'revolutionize', 'testament'). Use natural, smooth transition phrasing.
3. Sentence Length Variance (Burstiness): Mix short, punchy sentences (5-10 words) with longer, detailed academic sentences (20-30 words).
4. Academic Self-Audit: Verify that no original references, citations, or factual statements are altered, and that the text flows perfectly.

You MUST respond ONLY with a raw JSON object matching the following TypeScript interface schema:
interface HumanizeResult {
    humanizedText: string; // The fully rewritten, natural humanized text in the specified target language.
    aiScoreAfter: number; // Your estimated AI probability score (0-100) after this rewrite. It MUST be less than 10.
    auditLog: string[]; // List of specific improvements made.
}

Do not include any markdown code blocks (\`\`\`json) or conversational text. Return only the raw JSON.`;

    const userContent = voiceSample
        ? `Voice Style Sample to Calibrate:\n${voiceSample}\n\nInput Text to Humanize:\n${text}`
        : `Input Text to Humanize:\n${text}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
        throw new Error('İnsansılaştırma motorundan yanıt alınamadı.');
    }

    return JSON.parse(content) as HumanizeResult;
}
