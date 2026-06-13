// Test environment setup
process.env.JWT_SECRET = 'test-secret-key-for-vitest-minimum-32-characters-long';
// NODE_ENV salt-okunur tiplenir; testte değer atamak için cast gerekir.
(process.env as Record<string, string>).NODE_ENV = 'test';
