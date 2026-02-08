// Native fetch is available in Node 18+

// If standard fetch is available (Node 18+), this works. Otherwise we might need to verify node version.
// Assuming Node 18+ based on Next.js 16 usage.

async function testChat() {
    try {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: "Merhaba",
                role: "user"
            }),
        });

        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Body:", text);
    } catch (error) {
        console.error("Error:", error);
    }
}

testChat();
