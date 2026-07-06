const serverless = require('serverless-http');

let handler;
try {
  const app = require('../../app');
  handler = serverless(app);
} catch (err) {
  console.error('Erro ao carregar app:', err);
  handler = async () => ({
    statusCode: 500,
    body: JSON.stringify({ erro: 'Erro ao carregar aplicação', detalhe: err.message, stack: err.stack })
  });
}

exports.handler = async (event, context) => {
  try {
    return await handler(event, context);
  } catch (err) {
    console.error('Erro no handler:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ erro: err.message, stack: err.stack })
    };
  }
};
