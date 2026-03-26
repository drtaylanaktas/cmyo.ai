import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/email';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limiter';

export async function POST(request: Request) {
    try {
        // Rate limiting
        const ip = getClientIP(request);
        const rateCheck = checkRateLimit(`register:${ip}`, RATE_LIMITS.register);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: `Çok fazla kayıt denemesi. ${rateCheck.resetIn} saniye sonra tekrar deneyin.` },
                { status: 429 }
            );
        }

        const { name, surname, email, password, role, title, academicUnit, avatar, termsAccepted, termsAcceptedAt } = await request.json();

        // Input validation
        if (!name || !surname || !email || !password || !role) {
            return NextResponse.json({ error: 'Tüm zorunlu alanları doldurun.' }, { status: 400 });
        }

        // Terms acceptance validation
        if (termsAccepted !== true) {
            return NextResponse.json({ error: 'Devam edebilmek için Kullanım Koşulları, KVKK Aydınlatma Metni ve Gizlilik Politikasını kabul etmelisiniz.' }, { status: 400 });
        }

        if (name.length < 2 || name.length > 50) {
            return NextResponse.json({ error: 'İsim 2-50 karakter arasında olmalıdır.' }, { status: 400 });
        }

        if (surname.length < 2 || surname.length > 50) {
            return NextResponse.json({ error: 'Soyisim 2-50 karakter arasında olmalıdır.' }, { status: 400 });
        }

        // Email format validation
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ error: 'Geçersiz e-posta formatı.' }, { status: 400 });
        }

        // Validate email domain based on role
        if (role === 'academic' && !email.endsWith('@ahievran.edu.tr')) {
            return NextResponse.json({ error: 'Akademisyenler sadece @ahievran.edu.tr uzantılı mail adresi ile kayıt olabilir.' }, { status: 400 });
        }

        if (role === 'student' && !email.endsWith('@ogr.ahievran.edu.tr')) {
            return NextResponse.json({ error: 'Öğrenciler sadece @ogr.ahievran.edu.tr uzantılı mail adresi ile kayıt olabilir.' }, { status: 400 });
        }

        // Password strength validation (server-side)
        if (password.length < 8) {
            return NextResponse.json({ error: 'Şifre en az 8 karakter olmalıdır.' }, { status: 400 });
        }
        if (!/[A-Z]/.test(password)) {
            return NextResponse.json({ error: 'Şifre en az bir büyük harf içermelidir.' }, { status: 400 });
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            return NextResponse.json({ error: 'Şifre en az bir özel karakter içermelidir.' }, { status: 400 });
        }

        // Check if user exists
        const existingUser = await sql`SELECT id FROM users WHERE email = ${email}`;
        if (existingUser.rows.length > 0) {
            return NextResponse.json({ error: 'Bu mail adresi zaten kayıtlı.' }, { status: 409 });
        }

        // Hash password (12 rounds for better security)
        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Insert user
        await sql`
            INSERT INTO users (name, surname, email, password, role, title, academic_unit, avatar, verification_token, email_verified, terms_accepted, terms_accepted_at)
            VALUES (${name}, ${surname}, ${email}, ${hashedPassword}, ${role}, ${title || null}, ${academicUnit || null}, ${avatar || null}, ${verificationToken}, FALSE, TRUE, ${termsAcceptedAt || new Date().toISOString()})
        `;

        // Send verification email
        try {
            const emailSent = await sendVerificationEmail(email, verificationToken);
            if (!emailSent) {
                console.error("Email sending returned false");
            }
        } catch (emailError) {
            console.error("Failed to send verification email:", emailError);
        }

        return NextResponse.json({
            message: 'Kayıt başarılı! Lütfen e-posta adresinize gönderilen doğrulama bağlantısına tıklayın.',
            requireVerification: true
        }, { status: 201 });
    } catch (error: any) {
        console.error('Registration error:', error);
        return NextResponse.json({ error: 'Kayıt oluşturulurken bir hata oluştu.' }, { status: 500 });
    }
}
