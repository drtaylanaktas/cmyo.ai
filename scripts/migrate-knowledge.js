const { sql } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function createTable() {
    try {
        console.log('Creating knowledge_documents table...');
        await sql`
            CREATE TABLE IF NOT EXISTS knowledge_documents (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) UNIQUE NOT NULL,
                content TEXT NOT NULL,
                category VARCHAR(100),
                priority INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log('Table created successfully.');
    } catch (error) {
        console.error('Error creating table:', error);
        throw error;
    }
}

async function migrateData() {
    try {
        const kbPath = path.join(__dirname, '..', 'src', 'data', 'knowledge_base.json');
        console.log(`Reading data from ${kbPath}...`);
        
        if (!fs.existsSync(kbPath)) {
            console.error('knowledge_base.json not found!');
            return;
        }

        const data = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
        console.log(`Found ${data.length} documents to migrate.`);

        // Determine category and priority based on filename
        const prepareDoc = (doc) => {
            const isInstitutional = doc.filename.startsWith('CMYO_');
            const category = isInstitutional ? 'kurumsal' : 'genel';
            const priority = isInstitutional ? 100 : 0;
            
            // PostgreSQL text columns cannot contain the null byte (\x00)
            const cleanContent = (doc.content || '').replace(/\0/g, '');

            return {
                filename: doc.filename,
                content: cleanContent,
                category,
                priority
            };
        };

        console.log('Inserting documents into database (this might take a minute)...');
        
        let successCount = 0;
        let errorCount = 0;

        // Process in chunks or sequentially to avoid overwhelming the database connection
        for (const doc of data) {
            const prepared = prepareDoc(doc);
            try {
                await sql`
                    INSERT INTO knowledge_documents (filename, content, category, priority)
                    VALUES (${prepared.filename}, ${prepared.content}, ${prepared.category}, ${prepared.priority})
                    ON CONFLICT (filename) DO UPDATE 
                    SET content = EXCLUDED.content, 
                        category = EXCLUDED.category, 
                        priority = EXCLUDED.priority,
                        updated_at = CURRENT_TIMESTAMP;
                `;
                successCount++;
                if (successCount % 50 === 0) {
                    console.log(`Progress: ${successCount}/${data.length}`);
                }
            } catch (err) {
                console.error(`Failed to insert document: ${prepared.filename}`, err);
                errorCount++;
            }
        }

        console.log(`Migration complete! Successfully migrated: ${successCount}, Errors: ${errorCount}`);

    } catch (error) {
        console.error('Migration failed:', error);
    }
}

async function main() {
    console.log('Starting knowledge base migration to Vercel Postgres...');
    await createTable();
    await migrateData();
    console.log('Done script.');
    process.exit(0);
}

main();
