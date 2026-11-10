const production = process.argv.includes('--production');
const required = ['SKYCLIP_WORKSPACE_SECRET'];
const recommended = ['SKYCLIP_STT_URL', 'SKYCLIP_STT_TOKEN', 'SKYCLIP_HIGHLIGHT_URL', 'SKYCLIP_HIGHLIGHT_TOKEN'];
const missing = required.filter(key => !process.env[key]);
const absentRecommended = recommended.filter(key => !process.env[key]);
if (production && missing.length) { console.error(`FAIL production config: ${missing.join(', ')} 필요`); process.exit(1); }
console.log(`PASS config: ${production ? 'production' : 'development'} mode`);
if (absentRecommended.length) console.log(`INFO external adapters not configured: ${absentRecommended.join(', ')}`);
