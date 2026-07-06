require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Gestão de Ativos HAAS VLI - Servidor Online`);
  console.log(`  http://0.0.0.0:${PORT}`);
  console.log(`========================================`);
  if (!process.env.TURSO_DATABASE_URL) {
    console.log(`  Admin: admin / admin123`);
    console.log(`========================================`);
  }
  console.log(`\n`);
});
