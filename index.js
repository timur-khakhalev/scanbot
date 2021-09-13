const Telegraf = require('telegraf');
const Telegram = require('telegraf/telegram');
const {MongoClient} = require("mongodb");
const Composer = require('telegraf/composer')
const session = require('telegraf/session')
const Stage = require('telegraf/stage')
const Scene = require('telegraf/scenes/base')
const Extra = require('telegraf/extra')
const {loadWorker} = require('./task');

const mongoUrl = `mongodb://${process.env.MONGODB_LOGIN}:${process.env.MONGODB_PASSWORD}@mongo`
const mongoClient = new MongoClient(mongoUrl)
const dbName = 'scanbot'

const bot = new Telegraf(process.env.BOT_TOKEN)
const tgbot = new Telegram(process.env.BOT_TOKEN)

const scanScene = new Scene('start-scan')
const startScene = new Scene('super-wizard')
startScene.enter(async (ctx) => {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  let user = await colUsers.findOne({userId: ctx.from.id})
  if (!user) {
  await ctx.reply(`Добрый день, ${ctx.from.first_name}!\nЯ — Сканнер недвижимости на сайте Авито. Вы даёте мне ссылку на список объявлений с Авито (Необходимо перейти в категорию Недвижимость и выбрать одну из подкатегорий. (Например, квартиры в новостройках). Также, можно указать необходимые настройки фильтрации).\nИ далее, я раз в 2 минуты я буду обновлять эту ссылку, и если появятся новые объявления, то я вас оповещу об этом!\n\nСтоимость пользования на данный момент — 500₽/мес. Но на первые сутки (24 часа) я дам Вам доступ абсолютно бесплатно, все существующие возможности будут при этом работать.\nПросто, чтобы вы попробовали и оценили. После нажатия кнопки "Да" пробный период на сутки начнется. Согласны начать промо период?`, Extra.markup((m) =>
  m.inlineKeyboard([
      m.callbackButton('Да', 'startpromo'),
  ])))
  } else if (user.ban) {
    await ctx.reply('Доступ запрещен')
  } else if (user.link) {
    await ctx.reply('К сожалению, на данный момент не предусмотрен одновременный запуск более одного Сканера. Чтобы сменить ссылку, остановите Сканер командой /stop и потом запустите командой /start')
  }
  else {
    ctx.scene.enter('start-scan')
  }
  await mongoClient.close();
})

checkStatus = async (usr) => {
    try {
    mongoClient.connect();
    const db = mongoClient.db(dbName)
    const colUsers = db.collection('users')
    if ((Date.parse(usr.nextpay)) < Date.parse(new Date())){
      await colUsers.updateOne({userId: usr.userId}, {$set: {status: 'unpaid'}}, {upsert: true})
    } else {
      await colUsers.updateOne({userId: usr.userId}, {$set: {status: 'paid'}}, {upsert: true})
    }
    await mongoClient.close();
    } catch(e) {
      console.log(e)
    }
  }


scanScene.enter(async (ctx) => {
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  let date = new Date();
  let nextPay = new Date();
  nextPay.setHours(nextPay.getHours()+24)
  let currentUser = await colUsers.findOne({userId: ctx.from.id});
  if(!currentUser) {
    await colUsers.updateOne({userId: ctx.from.id}, {$set: {userId: ctx.from.id, name: ctx.from.first_name+" "+ctx.from.last_name, promoDate: date, nextpay: nextPay, payment: '500 р', status: 'paid'}}, {upsert: true})
    await ctx.reply('Зайдите на avito.ru с браузера, зайдите в категорию "Недвижимость" и выберите необходимую подкатегорию (Например, недвижимость в новостройках или квартиры посуточно) настройте параметры поиска и отправьте мне ссылку:');
  } else {
    await checkStatus(currentUser)
    if (currentUser.status == 'paid'){
      await ctx.reply('Зайдите на avito.ru с браузера, зайдите в категорию "Недвижимость" и выберите необходимую подкатегорию (Например, недвижимость в новостройках или квартиры посуточно) настройте параметры поиска и отправьте мне ссылку:');
    } else {
      await ctx.reply('К сожалению, необходимо пополнить баланс. Команда /pay подскажет вам, как можно оплатить.')
    }
  }
  mongoClient.close();
  } catch (e) {
    console.log(e)
  }
})

startScene.action('startpromo', (ctx) => {
  ctx.answerCbQuery()
  ctx.scene.enter('start-scan')
})


scanScene.hears(/avito.ru/, async (ctx) => {
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  let currentUser = await colUsers.findOne({userId: ctx.from.id});
  if (currentUser.status == 'paid') {
    if (/(nedvizhimost)$|(nedvizhimost\?cd)/.test(ctx.message.text)){
      await ctx.reply('Вы отправили мне ссылку главного раздела недвижимости. Попробуйте уточнить ссылку. Что именно мы ищем?')
    } else {
      let buff = ctx.message.text.replace(/-(\w){10,50}\??/, '?');
      ctx.session.editedLink = buff.replace(/m\./, '')
      await ctx.reply(`Я сохранил и отредактировал вашу ссылку, удалив лишнее: ${ctx.session.editedLink}. \n\nЗапускать?`, Extra.markup((m) =>
      m.inlineKeyboard([
          m.callbackButton('Запускать!', 'scan'),
          m.callbackButton('Прислать другую ссылку', 'another_link')
      ])))
  }
  } else {
    await ctx.reply('К сожалению, необходимо пополнить баланс. Команда /pay подскажет вам, как можно оплатить.')
  }
  await mongoClient.close();
} catch(e) {
  console.log(e)
}
})


scanScene.action('another_link', (ctx) => {
  ctx.answerCbQuery()
  ctx.scene.enter('start-scan')
})

scanScene.action('scan', async (ctx) => {
  await ctx.answerCbQuery()
  let msg = encodeURI(ctx.session.editedLink);
  let userId = ctx.from.id;

  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colProxy = db.collection('proxy')
  const colUsers = db.collection('users')
    let findNotBusy = await colProxy.findOne({"counts":{$lte:1}})
    if (!findNotBusy) { // При достаточном количестве консюмеров и проксей, это условие вообще не должно выполняться. Если выполняется, нужно добавить прокси или консьюмеры
      ctx.reply('Занято, попробуйте позже');
      await mongoClient.close();
    } else if (findNotBusy.counts < 1) {
      let date = new Date();
      await colProxy.updateOne({proxyId: findNotBusy.proxyId},{$set: {userId1: ctx.from.id, startMin1: date.getMinutes(), startSec1: date.getSeconds(), counts: 1, link1: msg}}, {upsert:true})
      await ctx.reply('Запускаю Сканер')
      loadWorker(msg, userId, findNotBusy.proxyId);
      await colUsers.updateOne({userId: userId}, {$set: {proxyId: findNotBusy.proxyId, link: msg}}, {upsert: true})
      await ctx.scene.leave()
      await mongoClient.close();
    }

    else if (findNotBusy.counts == 1) { // Если один скрипт на проксе уже запущен
      let nowDate = new Date();

      if (findNotBusy.startMin1) { // Проверяем, запущен ли первый скрипт. Если да, то заполняем второй...
      let minute = 1;
      if (findNotBusy.startMin1%2 != nowDate.getMinutes()%2) minute = 60; // Проверяем чтоб второй скрипт запустился в следующую минуту
      let sleepTime = 60 - nowDate.getSeconds() + findNotBusy.startSec1;
      if (findNotBusy.startSec1 != nowDate.getSeconds()) { // Если сохраненная секунда не равна текущей, то ждем еще минуту...
          ctx.reply('Запускаю Сканер!');
          try {
          colProxy.updateOne({proxyId: findNotBusy.proxyId}, {$set: {userId2: ctx.from.id, counts: 2, link2: msg}}, {upsert:true})
          .then(() => console.log("itsok"),
          (err) => console.log('itserr: ' + err))

          colUsers.updateOne({userId: userId}, {$set: {proxyId: findNotBusy.proxyId, link: msg}}, {upsert: true})
          .then(() => console.log("itsok"),
          (err) => console.log('itserr: ' + err))
          } catch (e) {
            console.log(e)
          }
          setTimeout(async () => {
          let Date2 = new Date();
          loadWorker(msg, userId, findNotBusy.proxyId);
          await colProxy.updateOne({proxyId: findNotBusy.proxyId},{$set: {startMin2: Date2.getMinutes(), startSec2: Date2.getSeconds()}}, {upsert:true})
          ctx.scene.leave();
          }, (sleepTime + minute)*1000) // Ставим отложенный старт на определенное кол-во сек.
        }
        else { // ... Иначе, запускаем прямо сейчас, при условии что совпадает четность у сохраненной и текущей минут. 
          ctx.reply('Запускаю Сканер!');
          try {
          colProxy.updateOne({proxyId: findNotBusy.proxyId},{$set: {userId2: ctx.from.id, counts: 2, link2: msg}}, {upsert:true})
          .then(() => console.log("itsok"),
          (err) => console.log('itserr: ' + err))
          colUsers.updateOne({userId: userId}, {$set: {proxyId: findNotBusy.proxyId, link: msg}}, {upsert: true})
          .then(() => console.log("itsok"),
          (err) => console.log('itserr: ' + err))
          } catch (e) {
            console.log(e)
          }
          setTimeout(async () => {
          let Date2 = new Date();
          loadWorker(msg, userId, findNotBusy.proxyId);
          await colProxy.updateOne({proxyId: findNotBusy.proxyId},{$set: {startMin2: Date2.getMinutes(), startSec2: Date2.getSeconds()}}, {upsert:true})
          ctx.scene.leave();
          }, (minute)*1000)
        }
      } else { // ... Если нет, заполняем первый
          let minute = 1;
          if (findNotBusy.startMin2%2 != nowDate.getMinutes()%2) minute = 60; // Проверяем чтоб второй скрипт запустился в следующую минуту
          let sleepTime = 60 - nowDate.getSeconds() + findNotBusy.startSec2;
          if (findNotBusy.startSec2 != nowDate.getSeconds()) { // Если сохраненная секунда не равна текущей, то ждем еще минуту...
            ctx.reply('Запускаю Сканер!');
            
            try {
            colProxy.updateOne({proxyId: findNotBusy.proxyId},{$set: {userId1: ctx.from.id, counts: 2, link1: msg}}, {upsert:true})
            .then(() => console.log("itsok"),
            (err) => console.log('itserr: ' + err))
            colUsers.updateOne({userId: userId}, {$set: {proxyId: findNotBusy.proxyId, link: msg}}, {upsert: true})
            .then(() => console.log("itsok"),
            (err) => console.log('itserr: ' + err))
            } catch (e) {
              console.log(e)
            }
            setTimeout(async () => {
            let Date2 = new Date();
            loadWorker(msg, userId, findNotBusy.proxyId);
            await colProxy.updateOne({proxyId: findNotBusy.proxyId},{$set: {startMin1: Date2.getMinutes(), startSec1: Date2.getSeconds()}}, {upsert:true})
            ctx.scene.leave();
            }, (sleepTime + minute)*1000) // Ставим отложенный старт на определенное кол-во сек.
          }
          else { // ... Иначе, запускаем прямо сейчас, при условии что совпадает четность у сохраненной и текущей минут. 
            ctx.reply('Запускаю Сканер!');
            
            try {
            colProxy.updateOne({proxyId: findNotBusy.proxyId},{$set: {userId1: ctx.from.id, counts: 2, link1: msg}}, {upsert:true})
            .then(() => console.log("itsok"),
            (err) => console.log('itserr: ' + err))
            colUsers.updateOne({userId: userId}, {$set: {proxyId: findNotBusy.proxyId, link: msg}}, {upsert: true})
            .then(() => console.log("itsok"),
            (err) => console.log('itserr: ' + err))
            } catch (e) {
              console.log(e)
            }
            setTimeout(async () => {
            let Date2 = new Date();
            loadWorker(msg, userId, findNotBusy.proxyId);
            await colProxy.updateOne({proxyId: findNotBusy.proxyId},{$set: {startMin1: Date2.getMinutes(), startSec1: Date2.getSeconds()}}, {upsert:true})
            ctx.scene.leave();
            }, (minute)*1000)
          }
      }
    }
} catch (e) {console.log(e)} 
})

const stage = new Stage([startScene, scanScene])
bot.use(session())
bot.use(stage.middleware())
bot.command('start', (ctx) => ctx.scene.enter('super-wizard'))

bot.command('stop', async (ctx) => {
    await ctx.reply('Останавливаю Сканер')
    try {
      await mongoClient.connect();
      const db = mongoClient.db(dbName)
      const colUsers = db.collection('users')
      await colUsers.updateOne({userId: ctx.from.id}, {$set: {stop: 1}})
      await mongoClient.close();
    } catch(e) {
      console.log(e)
    }

})

bot.command('pay', async (ctx) => {
  ctx.replyWithHTML('<b>Как оплатить доступ?</b>\nАбонентская плата составляет 500₽/мес. На данный момент, оплатить можно только переводом на карту Сбер:\n\n<pre>4274320052271510</pre>\n\nСкопируйте номер карты выше.\nНа данный момент, проверка оплаты происходит в ручном режиме человеком, поэтому, пожалуйста, оплачивайте заранее, чтобы не потерять доступ.')
})

bot.command('status', async (ctx) => {
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  let user = await colUsers.findOne({userId: ctx.from.id})
  let i = Date.parse(user.nextpay)
  let date = new Date(i)
  let status
  user.status == 'paid' ? status = '✅ Оплачено' : status = '❌ Не оплачено'
  if (user.ban) {
    ctx.reply('Доступ запрещен')
  } else {
  ctx.replyWithHTML("Статус аккаунта: <b>" + status + "</b>\n" + "Оплатить ДО: 🕓 <b>" + date.toLocaleString('ru-RU', { timeZone:"Europe/Moscow", year: 'numeric', weekday: 'short', month: 'short', day: 'numeric', minute:'2-digit', hour:'2-digit'})+ "</b>" + "\nАбонентская плата: 💵 <b>" + user.payment + "</b>\n" + "Текущая ссылка: 🔗 " + user.link + "\n\nВоспользуйтесь командой /pay, чтобы узнать, как можно оплатить доступ.")
  }
  await mongoClient.close();
  } catch (e) {
    console.log(e)
  }
})

var admin = new Composer();

admin.command("glu", async (ctx) => { // /getlastusers
  
  let com = ctx.message.text.split(' ').slice(1)
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  let arr2 = await colUsers.find({}).map((res)=>{
    if ((Date.parse(res.nextpay)) < Date.parse(new Date())){
    colUsers.updateOne({userId: res.userId}, {$set: {status: 'unpaid'}}, {upsert: true})
  } else {
    colUsers.updateOne({userId: res.userId}, {$set: {status: 'paid'}}, {upsert: true})
  }
  return ""
  }).limit(Number.parseInt(com[0])).sort({"_id":-1}).toArray()

  let arr = await colUsers.find({}).map((r)=>{
    let i = Date.parse(r.nextpay)
    let date = new Date(i)
    let status
    r.status == 'paid' ? status = '✅ Оплачено' : status = '❌ Не оплачено'
    let active
    r.link ? active = '✅ Активен' : active = '❌ Не активен'
    return "Статус аккаунта: <b>" + status + "</b>\n" + "Сканер: <b>" + active + "</b>\n" + "UserID: <b>" + r.userId + "</b>\n" + "Имя: <b>" + r.name + "</b>\n" + "Следующий платеж: <b>" + date.toLocaleString('ru-RU', { timeZone:"Europe/Moscow", year: 'numeric', month: 'short', day: 'numeric', minute:'2-digit', hour:'2-digit'}) + "</b>\n\n"
  }).limit(Number.parseInt(com[0])).sort({"_id":-1}).toArray()
  let msg = '';
  for(let i of arr) {
    msg += i
  }
  ctx.replyWithHTML(msg)
  } catch (e) {
    console.log(e)
  } finally{
    mongoClient.close()
  }
})

admin.command('au', async (ctx) => { // /adduser
  let com = ctx.message.text.split(' ').slice(1)
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  let user = await colUsers.findOne({userId: Number.parseInt(com[0])})
  await colUsers.updateOne({userId: Number.parseInt(com[0])}, {$set: {nextpay: new Date(Date.parse(user.nextpay)+2592000000), status: 'paid'}})
  let updatedUser = await colUsers.findOne({userId: Number.parseInt(com[0])})
  let date = new Date(updatedUser.nextpay)
  let status
  updatedUser.status == 'paid' ? status = '✅ Оплачено' : status = '❌ Не оплачено'
  let msg = "Статус аккаунта: <b>" + status + "</b>\n" + "UserID: <b>" + updatedUser.userId + "</b>\n" + "Имя: <b>" + updatedUser.name + "</b>\n" + "Следующий платеж: <b>" + date.toLocaleString('ru-RU', { timeZone:"Europe/Moscow", year: 'numeric', weekday: 'short', month: 'short', day: 'numeric', minute:'2-digit', hour:'2-digit'}) + "</b>"
  ctx.replyWithHTML(msg)
  } catch (e) {console.log(e)}
  finally{
    mongoClient.close()
  }
})

admin.command('gu', async (ctx) => { // /getuser
  let com = ctx.message.text.split(' ').slice(1)
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  let user = await colUsers.findOne({userId: Number.parseInt(com[0])})
  await checkStatus(user);
  let date = new Date(user.nextpay)
  let promoDate = new Date(user.promoDate)
  let status
  user.status == 'paid' ? status = '✅ Оплачено' : status = '❌ Не оплачено'
  let active
  user.link ? active = '✅ Активен' : active = '❌ Не активен'
  let msg = "Статус аккаунта: <b>" + status + "</b>\n" + "Сканер: <b>" + active + "</b>\n"  +"UserID: <b>" + user.userId + "</b>\n" + "Имя: <b>" + user.name + "</b>\n" + "Следующий платеж: <b>" + date.toLocaleString('ru-RU', { timeZone:"Europe/Moscow", year: 'numeric', weekday: 'short', month: 'short', day: 'numeric', minute:'2-digit', hour:'2-digit'}) + "</b>\n" + "Дата начала промо: <b>" + promoDate.toLocaleString('ru-RU', { timeZone:"Europe/Moscow", year: 'numeric', weekday: 'short', month: 'short', day: 'numeric', minute:'2-digit', hour:'2-digit'}) + "</b>\n" + "Платеж: <b>" + user.payment + "</b>\n" + "Ссылка: " + user.link + "\n" + "ID прокси: " + user.proxyId
  ctx.replyWithHTML(msg)
  } catch (e) {
    console.log(e)
  } finally{
    mongoClient.close()
  }
})

admin.command('ap', async (ctx) => { // /addpromo
  let com = ctx.message.text.split(' ').slice(1)
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  let hour = Number.parseInt(com[1]) * 3600000
  await colUsers.updateOne({userId: Number.parseInt(com[0])}, {$set: {promoDate: new Date(Date.now()), nextpay: new Date(Date.now()+hour)}})
  let user = await colUsers.findOne({userId: Number.parseInt(com[0])})
  await checkStatus(user)
  await mongoClient.connect();
  let updatedUser = await colUsers.findOne({userId: Number.parseInt(com[0])})
  let date = new Date(updatedUser.promoDate)
  let nextPay = new Date(user.nextpay)
  let status
  updatedUser.status == 'unpaid' ? status = 'Не оплачено' : status = 'Оплачено'
  let msg = "Статус аккаунта: <b>" + status + "</b>\n" + "UserID: <b>" + updatedUser.userId + "</b>\n" + "Имя: <b>" + updatedUser.name + "</b>\n" + "Промо обновлено: <b>" + date.toLocaleString('ru-RU', { timeZone:"Europe/Moscow", year: 'numeric', weekday: 'short', month: 'short', day: 'numeric', minute:'2-digit', hour:'2-digit'}) + "</b>\n" + "Следующий платеж: <b>" + nextPay.toLocaleString('ru-RU', { timeZone:"Europe/Moscow", year: 'numeric', weekday: 'short', month: 'short', day: 'numeric', minute:'2-digit', hour:'2-digit'}) + "</b>\n"
  ctx.replyWithHTML(msg)
  } catch (e) {
    console.log(e)
  } finally{
    mongoClient.close()
  }
})

admin.command('all', async (ctx) => {
  let msg = ctx.message.text.replace(/\/all /, '')
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  colUsers.find({}).map((res) => {
    return setTimeout(()=> {
      tgbot.sendMessage(res.userId, msg)
    }, 300)
  }).toArray()
  } catch (e) {
    console.log(e)
  }
})

admin.command('gp', async (ctx) => {
  try {
    await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colProxy = db.collection('proxy')
  colProxy.find({}).map((res) => {
    return ctx.replyWithHTML("proxyId: <b>" + res.proxyId + "</b>\n" + "counts: <b>" + res.counts + "</b>\n" + "startMin1: <b>" + res.startMin1 + "</b>\n" + "startSec1: <b>" + res.startSec1 + "</b>\n" + "userId1: <b>" + res.userId1 + "</b>\n" + "link1: " + res.link1 + "\n" + "startMin2: <b>" + res.startMin2 + "</b>\n" + "startSec2: <b>" + res.startSec2 + "</b>\n" + "userId2: <b>" + res.userId2 + "</b>\n" + "link2: " + res.link2, {disable_web_page_preview:'true'})
  }).toArray()
  } catch (e) {
    console.log(e)
  }
})

admin.command('ban', async (ctx) => {
  let com = ctx.message.text.split(' ').slice(1)
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  await colUsers.updateOne({userId: Number.parseInt(com[0])}, {$set: {ban: 1}}, {upsert: true})
  let user = await colUsers.findOne({userId: Number.parseInt(com[0])})
  ctx.replyWithHTML('Пользователь ' + com[0] + ' забанен. ' + 'user.ban: ' + user.ban)
  } catch (e) {
    console.log(e)
  } finally{
    mongoClient.close()
  }
})

admin.command('unban', async (ctx) => {
  let com = ctx.message.text.split(' ').slice(1)
  try {
  await mongoClient.connect();
  const db = mongoClient.db(dbName)
  const colUsers = db.collection('users')
  await colUsers.updateOne({userId: Number.parseInt(com[0])}, {$set: {ban: ""}}, {upsert: true})
  let user = await colUsers.findOne({userId: Number.parseInt(com[0])})
  ctx.replyWithHTML('Пользователь ' + com[0] + ' разбанен. ' + 'user.ban: ' + user.ban)
  } catch (e) {
    console.log(e)
  } finally{
    mongoClient.close()
  }
})


admin.command('sw', async (ctx) => {
  ctx.session.com = ctx.message.text.split(' ').slice(1)
  if (ctx.session.com[0]) {
    await ctx.reply('Уверен? ' + '\nproxyId: ' + ctx.session.com[0] + ' и ссылка номер ' + ctx.session.com[1], Extra.markup((m) =>
      m.inlineKeyboard([
          m.callbackButton('Да', 'startSw'),
          m.callbackButton('Нет', 'noSw')
      ])))
  } else {
    await ctx.reply('Уверен?', Extra.markup((m) =>
      m.inlineKeyboard([
          m.callbackButton('Да', 'startSw'),
          m.callbackButton('Нет', 'noSw')
      ])))
  }
})

admin.action('startSw', (ctx) => {
  ctx.answerCbQuery()
  if (ctx.session.com[0]) {
    try {
      mongoClient.connect();
      const db = mongoClient.db(dbName)
      const colProxy = db.collection('proxy')
      colProxy.findOne({proxyId: Number.parseInt(ctx.session.com[0])}).then((r) => {
        if (r) {
          if (ctx.session.com[1] === 1) {
            if (r.startMin1) {
              let nowDate = new Date();
              let minute = 1;
              if (r.startMin1%2 != nowDate.getMinutes()%2) minute = 60; // Проверяем чтоб второй скрипт запустился в следующую минуту
              let sleepTime = 60 - nowDate.getSeconds() + r.startSec1;
              ctx.reply('1. Нашел у UID ' + r.userId1 + ' proxy ' + r.proxyId + ' link ' + r.link1 + '\n\nОтправлю в воркер через ' + (sleepTime+minute) + ' секунд', {disable_web_page_preview: 'true'})
              setTimeout(async () => {
                let time = new Date();
                await colProxy.updateOne({proxyId: r.proxyId}, {$set: {startMin1: time.getMinutes(), startSec1: time.getSeconds()}}, {upsert:true})
                loadWorker(r.link1, r.userId1, r.proxyId)
              }, (sleepTime + minute) * 1000)
            } else {
              ctx.reply('Нашел у UID ' + r.userId1 + ' proxy ' + r.proxyId + ' link ' + r.link1 + '\n\nСтартую прямо сейчас', {disable_web_page_preview: 'true'})
              loadWorker(r.link1, r.userId1, r.proxyId)
            }
          } else {
            if(r.startMin2) {
              let nowDate = new Date();
              let minute = 1;
              if (r.startMin2%2 != nowDate.getMinutes()%2) minute = 60; // Проверяем чтоб второй скрипт запустился в следующую минуту
              let sleepTime = 60 - nowDate.getSeconds() + r.startSec2;
              ctx.reply('2. Нашел у UID ' + r.userId2 + ' proxy ' + r.proxyId + ' link ' + r.link2 + '\n\nОтправлю в воркер через ' + (sleepTime+minute) + ' секунд', {disable_web_page_preview: 'true'})
              setTimeout(async () => {
                let date = new Date();
                await colProxy.updateOne({proxyId: r.proxyId}, {$set: {startMin2: date.getMinutes(), startSec2: date.getSeconds()}}, {upsert:true})
                loadWorker(r.link2, r.userId2, r.proxyId)
              }, (sleepTime + minute) * 1000)
            } else {
              ctx.reply('Нашел у UID ' + r.userId2 + ' proxy ' + r.proxyId + ' link ' + r.link2 + '\n\nСтартую прямо сейчас', {disable_web_page_preview: 'true'})
              loadWorker(r.link2, r.userId2, r.proxyId)
            }
          }
        }
      }).catch((e) => console.log(e))
    } catch (e) {
      console.log(e)
    }
  } else {
    
  try {
    mongoClient.connect();
    const db = mongoClient.db(dbName)
    const colProxy = db.collection('proxy')
    colProxy.find({'link1':/avito.ru/g}).map((m) => {
      if (m) {
        if (m.startMin1) {
          let nowDate = new Date();
          let minute = 1;
          if (m.startMin1%2 != nowDate.getMinutes()%2) minute = 60; // Проверяем чтоб второй скрипт запустился в следующую минуту
          let sleepTime = 60 - nowDate.getSeconds() + m.startSec1;
          ctx.reply('1. Нашел у UID ' + m.userId1 + ' proxy ' + m.proxyId + ' link ' + m.link1 + '\n\nОтправлю в воркер через ' + (sleepTime+minute) + ' секунд', {disable_web_page_preview: 'true'})
          return setTimeout(async () => {
            let time = new Date();
            await colProxy.updateOne({proxyId: m.proxyId}, {$set: {startMin1: time.getMinutes(), startSec1: time.getSeconds()}}, {upsert:true})
            loadWorker(m.link1, m.userId1, m.proxyId)
          }, (sleepTime + minute) * 1000)
        } else {
          ctx.reply('Нашел у UID ' + m.userId1 + ' proxy ' + m.proxyId + ' link ' + m.link1 + '\n\nСтартую прямо сейчас', {disable_web_page_preview: 'true'})
          return loadWorker(m.link1, m.userId1, m.proxyId)
        }
      }
    }).toArray()

    colProxy.find({'link2':/avito.ru/g}).map((m) => {
      if (m) {
        if(m.startMin2) {
          let nowDate = new Date();
          let minute = 1;
          if (m.startMin2%2 != nowDate.getMinutes()%2) minute = 60; // Проверяем чтоб второй скрипт запустился в следующую минуту
          let sleepTime = 60 - nowDate.getSeconds() + m.startSec2;
          ctx.reply('2. Нашел у UID ' + m.userId2 + ' proxy ' + m.proxyId + ' link ' + m.link2 + '\n\nОтправлю в воркер через ' + (sleepTime+minute) + ' секунд', {disable_web_page_preview: 'true'})
          return setTimeout(async () => {
            let date = new Date();
            await colProxy.updateOne({proxyId: m.proxyId}, {$set: {startMin2: date.getMinutes(), startSec2: date.getSeconds()}}, {upsert:true})
            loadWorker(m.link2, m.userId2, m.proxyId)
          }, (sleepTime + minute) * 1000)
        } else {
          ctx.reply('Нашел у UID ' + m.userId2 + ' proxy ' + m.proxyId + ' link ' + m.link2 + '\n\nСтартую прямо сейчас', {disable_web_page_preview: 'true'})
          return loadWorker(m.link2, m.userId2, m.proxyId)
        }
      }
    }).toArray()
  } catch (e) {
    console.log(e)
  }

  }
  ctx.session.com = []
})

admin.action('noSw', (ctx) => {
  ctx.answerCbQuery()
  ctx.reply('Ну нет так нет')
})



admin.command('help', (ctx) => {
  ctx.replyWithHTML('<b>/glu</b> - [кол-во юзеров с конца]\nВыводит инфу по юзерам. Новые юзеры будут в начале\n\n<b>/gu</b> - [userId]\nВывод инфы по конкретному юзеру.\n\n<b>/au</b> - [userId]\nДобавление оплаты от юзера. Добавляет 30 суток к полю nextpay. Возвращает обновленную запись.\n\n<b>/ap</b> - [userId] - [Кол-во часов]\nДобавляет N количество бесплатных часов для пользования. Т. е. к nextpay добавляет N часов. Возвращает обновленную запись.\n\n<b>/all</b> - [Текст]\nОтправить сообщение всем пользователям в бд\n\n<b>/gp</b>\nВывод всех прокси из бд\n\n<b>/ban</b> - [userId]\nЗабанить пользователя\n\n<b>/unban</b> - [userId]\nРазбанить пользователя\n\n<b>/sw</b>\nЕсли произошел ребут консьюмеров, отправляет текущие ссылки новым консьюмерам')
})


var anyuser = new Composer();
anyuser.command('help', (ctx) => {
  ctx.replyWithHTML('<b>/start</b> - запуск Сканера.\n\n<b>/stop</b> - остановка Сканера.\n\n<b>/status</b> - текущий статус Вашего аккаунта.\n\n<b>/pay</b> - узнать о том, как оплатить.\n\n<b>/help</b> - показать все доступные команды')
})



bot.use(Composer.acl(1045450, admin));

bot.use(anyuser)

bot.launch()
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))