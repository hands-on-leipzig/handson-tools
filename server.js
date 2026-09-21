require('dotenv').config();

const dns = require('dns');
dns.setDefaultResultOrder('verbatim');

const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`handson.tools gateway on :${PORT}`);
});

const dispatchUpgrade = app.get('dispatchUpgrade');
if (dispatchUpgrade) {
  server.on('upgrade', dispatchUpgrade);
}
