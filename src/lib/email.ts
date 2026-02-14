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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

  console.log(`Preparing to send email to: ${email}`);
  console.log(`SMTP Config: Host=${process.env.SMTP_HOST}, Port=${process.env.SMTP_PORT}, User=${process.env.SMTP_USER}`);

  const mailOptions = {
    from: process.env.SMTP_FROM || '"KAEU AI Asistan" <noreply@kaeu.ai>',
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
    console.log('Attempting to send mail...');
    const info = await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${email}. MessageId: ${info.messageId}`);
    return true;
  } catch (error: any) {
    console.error('Error sending verification email:', error);
    if (error.response) {
      console.error('SMTP Response:', error.response);
    }
    return false;
  }
};
