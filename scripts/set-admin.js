const { sql } = require('@vercel/postgres');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

async function setAdminRole() {
    try {
        console.log('Checking current user roles...');
        const { rows } = await sql`SELECT id, email, role FROM users LIMIT 10;`;
        console.log('Users:', rows);

        // Give the appropriate user admin role. Assuming user is dr.aktas@... or similar
        // For safety, let's just make all current users "admin" if this is a single-user project at the moment, 
        // or check for specific email containing "aktas"
        
        const res = await sql`
            UPDATE users 
            SET role = 'admin' 
            WHERE email LIKE '%aktas%';
        `;
        
        console.log(`Updated ${res.rowCount} users to admin role.`);
        
    } catch (error) {
        console.error('Error updating role:', error);
    }
}

setAdminRole().then(() => process.exit(0));
