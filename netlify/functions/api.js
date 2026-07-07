const serverless = require('serverless-http');
const app = require('../../app');

const handler = serverless(app, {
  request: (req, event, context) => {
    req.context = context;
  },
  binaryMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8'
  ]
});

exports.handler = async (event, context) => {
  try {
    return await handler(event, context);
  } catch (err) {
    console.error('Netlify Function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ erro: 'Erro interno', detalhe: err.message })
    };
  }
};
