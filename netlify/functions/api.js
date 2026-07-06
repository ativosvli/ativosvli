const serverless = require('serverless-http');
const app = require('../../app');

exports.handler = async (event, context) => {
  try {
    return await serverless(app)(event, context);
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: err.message, stack: (err.stack || '').split('\n').slice(0,3).join(' | ') })
    };
  }
};
