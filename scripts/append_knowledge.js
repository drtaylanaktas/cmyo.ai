
const fs = require('fs');
const path = require('path');

const kbPath = path.join(process.cwd(), 'src/data/knowledge_base.json');

// Get arguments
const filename = process.argv[2];
const contentFilePath = process.argv[3];

if (!filename || !contentFilePath) {
    console.error('Usage: node append_knowledge.js <filename> <content_file_path>');
    process.exit(1);
}

const content = fs.readFileSync(contentFilePath, 'utf-8');

try {
    let knowledgeBase = [];
    if (fs.existsSync(kbPath)) {
        const fileContent = fs.readFileSync(kbPath, 'utf-8');
        knowledgeBase = JSON.parse(fileContent);
    }

    // Check if exists and update or append
    const existingIndex = knowledgeBase.findIndex(item => item.filename === filename);

    if (existingIndex > -1) {
        knowledgeBase[existingIndex].content = content;
        console.log(`Updated existing entry: ${filename}`);
    } else {
        knowledgeBase.push({
            filename: filename,
            content: content
        });
        console.log(`Added new entry: ${filename}`);
    }

    fs.writeFileSync(kbPath, JSON.stringify(knowledgeBase, null, 2), 'utf-8');
    console.log('Knowledge base saved successfully.');

} catch (error) {
    console.error('Error updating knowledge base:', error);
    process.exit(1);
}
