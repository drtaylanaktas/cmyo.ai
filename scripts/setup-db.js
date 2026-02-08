const { sql } = require('@vercel/postgres');
const { config } = require('dotenv');

config({ path: '.env.local' });

async function createUsersTable() {
    try {
        const result = await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        surname VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        title VARCHAR(100),
        academic_unit VARCHAR(255),
        avatar TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
        console.log(`Created "users" table`);
        return result;
    } catch (error) {
        console.error('Error creating users table:', error);
        throw error;
    }
}

async function main() {
    await createUsersTable();
    console.log('Database setup complete.');
}

main();
