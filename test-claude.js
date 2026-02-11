
require('dotenv').config({ path: '.env.local' });
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testModel(modelName) {
    try {
        console.log(`Testing model: ${modelName}`);
        const message = await anthropic.messages.create({
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hello' }],
            model: modelName,
        });
        console.log(`✅ Success with ${modelName}:`, message.content[0].text);
        return true;
    } catch (error) {
        console.error(`❌ Failed with ${modelName}:`, error.message);
        return false;
    }
}

async function main() {
    // Try the requested one first
    await testModel('claude-3-5-sonnet-20241022');

    // Try the previous stable one
    await testModel('claude-3-5-sonnet-20240620');

    // Try Claude 3 Sonnet (Original)
    await testModel('claude-3-sonnet-20240229');

    // Try Claude 3 Haiku
    await testModel('claude-3-haiku-20240307');

    // Try Claude 3 Opus
    await testModel('claude-3-opus-20240229');

    // Try the latest alias
    await testModel('claude-3-5-sonnet-latest');
}

main();
