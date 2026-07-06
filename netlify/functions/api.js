const serverless = require('serverless-http');

let handler;
try {
  const app = require('../../app');
  handler = serverless(app);
} catch (err) {
  console.error('Erro ao carregar app:', err);
  handler = async () => ({
    statusCode: 500,
    body: JSON.stringify({ erro: 'Erro ao carregar app', msg: err.message, stack: err.stack?.split('\n').slice(0,5).join('\\n') })
  });
}

exports.handler = async (event, context) => {
  try {
    return await handler(event, context);
  } catch (err) {
    console.error('Erro handler:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ erro: err.message, stack: err.stack?.split('\n').slice(0,5).join('\\n') })
    };
  }
};
