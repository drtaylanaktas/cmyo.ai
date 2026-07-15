import OpenAI from 'openai';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

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
        patternCategory?: 'content' | 'language' | 'style';
    }>;
    feedback: string;
}

export interface AuditResult {
    passed: boolean;
    score: number;
    issues: string[];
}

export interface HumanizeResult {
    humanizedText: string;
    originalAiScore: number;
    finalAiScore: number;
    passCount: number;
    auditLog: string[];
    patterns: string[];
}

// ──────────────────────────────────────────────────────────────
// OpenAI client
// ──────────────────────────────────────────────────────────────

function getOpenAIClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API anahtarı bulunamadı. Lütfen OPENAI_API_KEY ortam değişkenini kontrol edin.');
    }
    return new OpenAI({ apiKey });
}

// ──────────────────────────────────────────────────────────────
// Blader-inspired 30-pattern AI Detection Prompt
// ──────────────────────────────────────────────────────────────

const AI_PATTERNS_KNOWLEDGE = `
## CONTENT PATTERNS (1-6)

1. **Significance/Legacy Inflation**: Phrases like "marking a pivotal moment", "stands as a testament", "a vital/crucial/pivotal role", "underscores its importance", "reflects broader", "symbolizing its enduring", "setting the stage for", "represents a shift", "key turning point", "evolving landscape", "indelible mark".
   - Problem: AI puffs up importance by adding statements about how things represent or contribute to broader topics.

2. **Notability/Media Name-dropping**: "independent coverage", "local/regional/national media outlets", "written by a leading expert", "active social media presence".
   - Problem: AI hits readers over the head with claims of notability.

3. **Superficial -ing Analyses**: "highlighting/underscoring/emphasizing...", "ensuring...", "reflecting/symbolizing...", "contributing to...", "cultivating/fostering...", "encompassing...", "showcasing..."
   - Problem: AI tacks present participle ("-ing") phrases onto sentences to add fake depth.

4. **Promotional/Advertisement Language**: "boasts a", "vibrant", "rich" (figurative), "profound", "enhancing its", "showcasing", "exemplifies", "commitment to", "natural beauty", "nestled", "in the heart of", "groundbreaking", "renowned", "breathtaking", "must-visit", "stunning".
   - Problem: AI has serious problems keeping neutral tone.

5. **Vague Attributions/Weasel Words**: "Industry reports", "Observers have cited", "Experts argue", "Some critics argue", "several sources/publications".
   - Problem: AI attributes opinions to vague authorities without specific sources.

6. **Formulaic "Challenges and Prospects"**: "Despite its... faces several challenges...", "Despite these challenges", "Challenges and Legacy", "Future Outlook".
   - Problem: AI includes formulaic challenges sections with optimistic conclusions.

## LANGUAGE PATTERNS (7-13)

7. **Overused AI Vocabulary**: actually, additionally, align with, crucial, delve, emphasizing, enduring, enhance, fostering, garner, highlight (verb), interplay, intricate/intricacies, key (adj), landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore (verb), valuable, vibrant, moreover, furthermore, particularly, notably, comprehensive, robust, leverage, streamline, facilitate, innovative, holistic, paradigm, synergy, nuanced.
   - Problem: These words appear far more frequently in post-2023 AI text. They often co-occur.

8. **Copula Avoidance**: "serves as" / "stands as" / "marks" / "represents" [a], "boasts" / "features" / "offers" [a].
   - Problem: AI substitutes elaborate constructions for simple "is" / "has" / "are".

9. **Negative Parallelisms**: "Not only... but also...", "It's not just about..., it's...", tailing negations like "no guessing", "no wasted motion".
   - Problem: Overused formulaic constructions.

10. **Rule of Three Overuse**: Forcing ideas into groups of three ("innovation, inspiration, and insights").
    - Problem: AI uses triads to appear comprehensive.

11. **Synonym Cycling (Elegant Variation)**: Using different synonyms for the same thing in consecutive sentences (protagonist → main character → central figure → hero).
    - Problem: AI repetition-penalty causes excessive synonym substitution.

12. **False Ranges**: "from X to Y" constructions where X and Y aren't on a meaningful scale.
    - Problem: AI creates artificial scope using false continuums.

13. **Passive Voice / Subjectless Fragments**: "No configuration file needed", "The results are preserved automatically".
    - Problem: AI hides the actor or drops the subject.

## STYLE PATTERNS (14-20)

14. **Em Dash Overuse**: "institutions—not the people—yet this continues—" → Use periods, commas, colons, or parentheses instead.

15. **Boldface Overuse**: "**OKRs**, **KPIs**, **BMC**" → "OKRs, KPIs, BMC". In paragraphs, bold should be rare.

16. **Inline-header Lists**: "**Performance:** Performance improved..." → Convert to prose.

17. **Title Case Headings Overuse**: "Strategic Negotiations And Partnerships" → "Strategic negotiations and partnerships".

18. **Filler Phrases**: "It's important to note that", "It's worth mentioning that", "It should be noted that", "As a matter of fact" → Delete entirely; start with the actual point.

19. **Soulless/Sterile Writing**: Every sentence the same length and structure; no opinions; no uncertainty; no first-person when appropriate; no humor or personality. Reads like a press release.

20. **Generic Opening/Closing**: "In today's rapidly evolving world", "In the ever-changing landscape of", "In conclusion, it is clear that", "As we move forward".

## TURKISH-SPECIFIC AI PATTERNS (21-26)

21. **Türkçe Şişirme Kalıpları**: "büyük önem taşımaktadır", "hayati bir rol oynamaktadır", "dikkat çekmektedir", "ön plana çıkmaktadır", "öne sürmektedir", "son derece kritik bir öneme sahiptir".

22. **Türkçe Formülatik Geçişler**: "Bu bağlamda", "Özellikle belirtmek gerekir ki", "Sonuç olarak", "Bununla birlikte", "Tüm bunlar göz önüne alındığında", "Bu noktada vurgulanması gereken".

23. **Türkçe Abartılı Bağlaçlar**: "Hem... hem de..." aşırı kullanımı, "Sadece... değil, aynı zamanda..." (not only...but also Türkçe versiyonu).

24. **Türkçe Pasif Yapı Aşırı Kullanımı**: "-maktadır/-mektedir" ile biten sürekli pasif cümleler, öznesiz yapılar.

25. **Türkçe Akademik Klişeler**: "literatürde yer alan çalışmalar incelendiğinde", "yapılan araştırmalar göstermektedir ki", "alan yazını incelendiğinde".

26. **Türkçe Sonuç Formülleri**: "Sonuç olarak, bu çalışmada X konusu ele alınmış ve Y sonuçlarına ulaşılmıştır" — Her zaman aynı kalıpta bitiş.
`;

// ──────────────────────────────────────────────────────────────
// Pass 1: Enhanced AI Detection (30 patterns)
// ──────────────────────────────────────────────────────────────

export async function detectAI(text: string): Promise<AIDetectionResult> {
    const openai = getOpenAIClient();

    const systemPrompt = `You are a strict academic writing-quality reviewer. You apply an INTERNAL heuristic based on Wikipedia's comprehensive "Signs of AI writing" guide (WikiProject AI Cleanup), which identifies 26 specific patterns commonly found in AI-generated text. This is an internal writing-quality signal only — it is NOT a Turnitin, GPTZero, or Copyleaks prediction and must never be presented as a guarantee about any third-party detector.

You must analyze the input text for ALL of the following pattern categories:

${AI_PATTERNS_KNOWLEDGE}

## STATISTICAL ANALYSIS

Beyond pattern matching, also evaluate:
- **Perplexity**: How predictable are the word choices? AI tends toward statistically likely words.
- **Burstiness**: How much variation exists in sentence lengths? AI writing has very low burstiness (uniform sentence length and structure).
- **Repetitive Vocabulary**: Frequency of the AI vocabulary words listed in Pattern #7.
- **Robotic Transitions**: Frequency of formulaic transitions listed in Patterns #18, #22.

## OUTPUT FORMAT

You MUST respond with a raw JSON object matching this schema:
{
    "score": number,        // 0 (100% human) to 100 (100% AI-generated)
    "metrics": {
        "perplexity": "High" | "Medium" | "Low",
        "burstiness": "High" | "Medium" | "Low",
        "repetitiveWordsScore": number,  // 0-100
        "roboticTransitionsScore": number // 0-100
    },
    "highlights": [
        {
            "originalText": "exact flagged sentence or phrase",
            "reason": "Brief explanation in Turkish (e.g., 'Kalıp #7: AI kelime hazinesi — crucial, pivotal aşırı kullanımı')",
            "patternCategory": "content" | "language" | "style"
        }
    ],
    "feedback": "Detailed feedback in Turkish: which specific patterns were found, how many sentences are affected, and concrete suggestions for making the text more human."
}

IMPORTANT RULES:
- The feedback MUST be in Turkish regardless of the input language.
- The reason in highlights MUST reference the specific pattern number and name.
- Flag at least 3 highlights if the score is above 30.
- Do NOT include markdown code blocks. Return ONLY raw JSON.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this text for AI patterns:\n\n${text}` }
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

// ──────────────────────────────────────────────────────────────
// Pass 2: Humanize — First Rewrite (Blader playbook)
// ──────────────────────────────────────────────────────────────

async function humanizePass1(
    text: string,
    voiceSample: string | undefined,
    targetLanguage: 'auto' | 'tr' | 'en'
): Promise<{ draft: string; improvements: string[] }> {
    const openai = getOpenAIClient();

    let languageInstruction = "";
    if (targetLanguage === 'tr') {
        languageInstruction = "You MUST write the output in Turkish. If the input is in English, translate it to Turkish while humanizing.";
    } else if (targetLanguage === 'en') {
        languageInstruction = "You MUST write the output in English. If the input is in Turkish, translate it to English while humanizing.";
    } else {
        languageInstruction = "You MUST detect the language of the input and write the output in the EXACT SAME LANGUAGE. Do NOT translate. If the input is in English, the output MUST be in English. If the input is in Turkish, the output MUST be in Turkish.";
    }

    const voiceCalibrationBlock = voiceSample ? `
## VOICE CALIBRATION — MANDATORY

The user provided a writing sample. You MUST analyze it FIRST and match the author's voice:

1. **Sentence length patterns**: short and punchy? Long and flowing? Mixed?
2. **Word choice level**: casual? academic? technical? somewhere between?
3. **Paragraph openings**: jump right in? Set context first?
4. **Punctuation habits**: lots of dashes? Parenthetical asides? Semicolons?
5. **Recurring phrases**: any verbal tics or favorite expressions?
6. **Transition handling**: explicit connectors? Or just start the next point?

Match their voice in the rewrite. Don't just remove AI patterns — replace them with patterns from the sample. If they write short sentences, don't produce long ones.

### User's Writing Sample:
${voiceSample}
` : `
## DEFAULT VOICE (No sample provided)
Write in a natural, varied voice. Mix sentence lengths. Have subtle personality. Avoid sterile, press-release-like writing. For academic text, maintain academic rigor but vary rhythm and structure.
`;

    const systemPrompt = `You are an elite academic editor. Your mission is to rewrite text so it reads naturally, fluently, and in the author's own voice — clear, well-structured, genuinely human academic prose that is free of robotic, formulaic AI-writing patterns. The goal is writing QUALITY and authenticity to the author's style, not evading any detection tool.

${languageInstruction}

${voiceCalibrationBlock}

## HUMANIZING PLAYBOOK — Based on Wikipedia's "Signs of AI Writing" (26 Patterns)

You MUST systematically scan for and eliminate ALL of the following AI patterns:

${AI_PATTERNS_KNOWLEDGE}

## REWRITING RULES

1. **Rewrite, don't delete**: Replace AI-isms with natural alternatives. Cover everything the original covers. If the original has five paragraphs, the rewrite has five paragraphs.
2. **Preserve meaning 100%**: Keep every fact, argument, and conclusion intact.
3. **Protect references**: NEVER alter citations [1], [2], (Smith et al., 2024), table references (Table 1, Şekil 2), or formula numbers (Equation 3). Copy them exactly.
4. **Protect technical terms**: Domain-specific terminology must remain unchanged (e.g., "nanoparticle", "in vivo", "p-value").
5. **Vary sentence rhythm**: Mix short punchy sentences (5-12 words) with longer detailed ones (18-30 words). NEVER write 3+ consecutive sentences of similar length.
6. **Use simple copulas**: Replace "serves as", "stands as", "boasts" with "is", "has", "are" where appropriate.
7. **Cut filler**: Delete "It's important to note that", "It's worth mentioning", "As a matter of fact" entirely.
8. **Cut em dashes**: Replace with periods, commas, colons, or parentheses.
9. **Natural transitions**: Replace "Moreover", "Furthermore", "Additionally" with varied connectors or simply start the next point.
10. **Avoid Rule of Three**: Don't force triads. Use the natural number of items.

## OUTPUT FORMAT

Respond with raw JSON only:
{
    "draft": "The fully rewritten text in the target language",
    "improvements": ["List of specific improvements made, in Turkish, referencing pattern numbers"]
}

Do NOT include markdown code blocks. Return ONLY raw JSON.`;

    const userContent = voiceSample
        ? `Voice Style Sample:\n${voiceSample}\n\nText to Humanize:\n${text}`
        : `Text to Humanize:\n${text}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ],
        temperature: 0.35,
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('İnsansılaştırma motorundan (Geçiş 1) yanıt alınamadı.');

    const parsed = JSON.parse(content);
    return {
        draft: parsed.draft || parsed.humanizedText || '',
        improvements: parsed.improvements || parsed.auditLog || []
    };
}

// ──────────────────────────────────────────────────────────────
// Pass 3: Audit — "Obviously AI" check
// ──────────────────────────────────────────────────────────────

async function auditPass(draft: string): Promise<AuditResult> {
    const openai = getOpenAIClient();

    const systemPrompt = `You are a ruthless AI writing auditor. Your ONLY job is to read the text below and determine if it STILL sounds like it was written by an AI.

Check for these residual problems:
1. Every sentence is the same length or structure (low burstiness)
2. Sterile, neutral reporting with no opinions or personality
3. Any remaining AI vocabulary words: crucial, delve, tapestry, testament, landscape (abstract), pivotal, showcase, underscore, furthermore, moreover, additionally, notably
4. Any remaining formulaic transitions or filler phrases
5. Synonym cycling (same concept referred to by different fancy words)
6. Copula avoidance ("serves as", "stands as" instead of "is")
7. Em dash overuse
8. Rule of Three patterns
9. "Not only... but also..." constructions
10. Generic openings/closings ("In today's rapidly evolving world...")

For Turkish text, also check:
- "-maktadır/-mektedir" ile biten monoton cümleler
- "Bu bağlamda", "Özellikle belirtmek gerekir ki", "Sonuç olarak" klişeleri
- "büyük önem taşımaktadır", "hayati bir rol oynamaktadır" şişirmesi

Respond with raw JSON only:
{
    "passed": boolean,   // true if text sounds genuinely human, false if AI traces remain
    "score": number,     // estimated AI score 0-100 after this audit
    "issues": ["list of remaining AI-isms found, in Turkish"]
}

Be STRICT. If you find even 2-3 clear AI patterns, set passed=false.
Do NOT include markdown code blocks. Return ONLY raw JSON.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Audit this text for remaining AI patterns:\n\n${draft}` }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('Audit denetimi yanıt vermedi.');

    return JSON.parse(content) as AuditResult;
}

// ──────────────────────────────────────────────────────────────
// Pass 4: Second Rewrite (targeted, only if audit fails)
// ──────────────────────────────────────────────────────────────

async function humanizePass2(
    draft: string,
    auditIssues: string[],
    targetLanguage: 'auto' | 'tr' | 'en'
): Promise<{ draft: string; improvements: string[] }> {
    const openai = getOpenAIClient();

    let languageInstruction = "";
    if (targetLanguage === 'tr') {
        languageInstruction = "The output MUST be in Turkish.";
    } else if (targetLanguage === 'en') {
        languageInstruction = "The output MUST be in English.";
    } else {
        languageInstruction = "Keep the output in the SAME language as the input. Do NOT translate.";
    }

    const systemPrompt = `You are an elite writing humanizer performing a SECOND PASS on a previously rewritten text. The first rewrite was audited and FAILED — specific AI patterns were still detected.

${languageInstruction}

## AUDIT FAILURES TO FIX

The audit found these remaining AI traces that you MUST eliminate:
${auditIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

## INSTRUCTIONS

1. Fix ONLY the issues identified above. Do not rewrite parts that are already natural.
2. Be more aggressive this time: use shorter sentences, simpler words, more varied rhythm.
3. Inject natural imperfections: occasional parenthetical asides, varied paragraph lengths.
4. NEVER alter citations, references, technical terms, table/figure references.
5. Preserve 100% of the factual content.

## OUTPUT FORMAT

Respond with raw JSON only:
{
    "draft": "The improved text with audit issues fixed",
    "improvements": ["List of specific fixes applied, in Turkish"]
}

Do NOT include markdown code blocks. Return ONLY raw JSON.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Text to improve (fix the audit failures):\n\n${draft}` }
        ],
        temperature: 0.45,
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('İnsansılaştırma motorundan (Geçiş 2) yanıt alınamadı.');

    const parsed = JSON.parse(content);
    return {
        draft: parsed.draft || parsed.humanizedText || '',
        improvements: parsed.improvements || parsed.auditLog || []
    };
}

// ──────────────────────────────────────────────────────────────
// Orchestrator: Full humanization pipeline
// ──────────────────────────────────────────────────────────────

export async function humanizeText(
    text: string,
    voiceSample?: string,
    targetLanguage?: 'auto' | 'tr' | 'en',
    onPhase?: (phase: string) => void
): Promise<HumanizeResult> {
    const lang = targetLanguage || 'auto';
    const allImprovements: string[] = [];
    const allPatterns: string[] = [];

    // ── Phase 1: Initial AI Detection ──
    onPhase?.('Metin morfolojisi ve 26 AI kalıbı taranıyor...');
    let originalDetection: AIDetectionResult;
    try {
        originalDetection = await detectAI(text);
    } catch {
        // If detection fails, still proceed with humanization
        originalDetection = {
            score: 50,
            metrics: { perplexity: 'Medium', burstiness: 'Medium', repetitiveWordsScore: 50, roboticTransitionsScore: 50 },
            highlights: [],
            feedback: 'Ön analiz yapılamadı, insansılaştırma devam ediyor.'
        };
    }

    // Collect detected pattern categories
    if (originalDetection.highlights) {
        originalDetection.highlights.forEach(h => {
            if (h.patternCategory) allPatterns.push(h.patternCategory);
        });
    }

    // ── Phase 2: First Humanization Pass ──
    onPhase?.('İlk iyileştirme geçişi uygulanıyor (üslup kalibrasyonu)...');
    const pass1 = await humanizePass1(text, voiceSample, lang);
    allImprovements.push(...pass1.improvements);

    // ── Phase 3: Audit Pass ──
    onPhase?.('Audit denetimi: robotik kalıntılar aranıyor...');
    const audit = await auditPass(pass1.draft);

    let finalDraft = pass1.draft;
    let passCount = 1;

    // ── Phase 4: Second Pass (conditional) ──
    if (!audit.passed && audit.score > 25) {
        onPhase?.('İkinci geçiş: kalan AI izleri temizleniyor...');
        const pass2 = await humanizePass2(pass1.draft, audit.issues, lang);
        finalDraft = pass2.draft;
        allImprovements.push(...pass2.improvements);
        passCount = 2;
    } else {
        allImprovements.push('✅ Audit geçişi başarılı — ikinci geçiş gerekmedi.');
    }

    // ── Phase 5: Final doğallık skoru ──
    // Maliyet/hız için ayrı bir GPT-4o `detectAI` çağrısı YAPMIYORUZ.
    // İkinci geçiş olmadıysa audit zaten finalDraft üzerinde çalıştı → skoru kullan.
    // İkinci geçiş olduysa yeni taslağı ucuz audit (gpt-4o-mini) ile yeniden puanla.
    let finalScore: number;
    if (passCount === 2) {
        onPhase?.('Final doğallık kontrolü yapılıyor...');
        try {
            const finalAudit = await auditPass(finalDraft);
            finalScore = finalAudit.score;
        } catch {
            finalScore = audit.score;
        }
    } else {
        finalScore = audit.score;
    }

    return {
        humanizedText: finalDraft,
        originalAiScore: originalDetection.score,
        finalAiScore: finalScore,
        passCount,
        auditLog: allImprovements,
        patterns: [...new Set(allPatterns)]
    };
}
