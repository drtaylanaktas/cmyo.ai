import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export const sendVerificationEmail = async (email: string, token: string) => {
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/verify?token=${token}`;

    const mailOptions = {
        from: '"KAEU AI Asistan" <' + process.env.SMTP_USER + '>',
        to: email,
        subject: 'KAEU.AI Hesap Doğrulama',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2563eb; text-align: center;">KAEU.AI Hoş Geldiniz!</h2>
        <p>Merhaba,</p>
        <p>Hesabınızı oluşturduğunuz için teşekkür ederiz. Lütfen aşağıdaki butona tıklayarak e-posta adresinizi doğrulayın:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Hesabımı Doğrula</a>
        </div>
        <p>veya şu bağlantıyı tarayıcınıza yapıştırın:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p style="color: #666; font-size: 12px; margin-top: 30px; text-align: center;">Bu e-postayı siz talep etmediyseniz lütfen dikkate almayınız.</p>
      </div>
    `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Verification email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Error sending verification email:', error);
        return false;
    }
};
