var amqp = require('amqplib/callback_api');
require('dotenv').config()

loadWorker = (msg, userId, proxyId) => {
  amqp.connect('amqp://guest:' + process.env.RABBIT_PASSWORD + '@rabbitmq', (error0, connection) => {
    if (error0) {
      throw error0;
    }
    connection.createChannel((error1, channel) => {
      if (error1) {
        throw error1;
      }
      let queue = 'avito_queue';
      channel.assertQueue(queue, {
        durable: true
      });
      let params = [msg, userId, proxyId];
      let sentMsg = JSON.stringify(params);
      channel.sendToQueue(queue, Buffer.from(sentMsg), {
        persistent: true
      });

      console.log(" [x] Отправлена ссылка " + msg + " и userId " + userId + " proxyId: " + proxyId);
      process.once('SIGINT', connection.close.bind(connection));
    });
  })
}

module.exports.loadWorker = loadWorker