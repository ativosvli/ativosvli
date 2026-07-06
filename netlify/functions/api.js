require('dotenv').config({ path: `${__dirname}/../../.env` });
const serverless = require('serverless-http');
const app = require('../../app');

exports.handler = serverless(app);
