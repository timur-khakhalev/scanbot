var amqp = require('amqplib/callback_api');
var avito = require('./avito')
require('dotenv').config()

amqp.connect('amqp://guest:'+process.env.RABBIT_PASSWORD+'@rabbitmq', function(error0, connection) {
  if (error0) {
    throw error0;
  }
   connection.createChannel(function(error1, channel) {
    if (error1) {
      throw error1;
    }
    var queue = 'avito_queue';

    channel.assertQueue(queue, {
      durable: true
    });
    channel.prefetch(1);
    console.log(" [*] Waiting for messages in " + queue);
    channel.consume(queue, function(msg) {
      let rcvd = [];
      rcvd = msg.content.toString().replace(/"|\[|\]/g, '').split(',')
      let link = rcvd[0];
      let userId = rcvd[1];
      let proxyId = rcvd[2];
      console.log(" [x] Received " + link + " userId: " + userId + " proxyId " + proxyId);
      avito.startScan(link, userId, proxyId)
      channel.ack(msg)
      delMsg = () => {
        channel.nack(msg, true, false)
      }
      module.exports.delMsg = delMsg;
    }, {
      noLocal: true,
      noAck: false,
    });
  });
});

