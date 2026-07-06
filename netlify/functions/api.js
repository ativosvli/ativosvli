const serverless = require('serverless-http');
const app = require('../../app');

exports.handler = async (event, context) => {
  try {
    return await serverless(app)(event, context);
  } catch (err) {
    console.error('Erro no handler:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ erro: err.message, stack: err.stack })
    };
  }
};
