import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cmyoai.app',
  appName: 'ÇMYO.AI',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    url: 'https://cmyo-ai.vercel.app', // Production URL
    cleartext: true
  }
};

export default config;
