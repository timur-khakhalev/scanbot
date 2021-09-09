const cheerio = require('cheerio');
const axios = require('axios');
const Telegram = require('telegraf/telegram');
require('dotenv').config()
const worker = require('./worker')
const {MongoClient} = require("mongodb");
let httpsProxyAgent = require("https-proxy-agent");

const mongoUrl = `mongodb://${process.env.MONGODB_LOGIN}:${process.env.MONGODB_PASSWORD}@mongo`
const mongoClient = new MongoClient(mongoUrl)
const dbName = 'scanbot'
const db = mongoClient.db(dbName)
const bot = new Telegram(process.env.BOT_TOKEN)

let newAds = [];
let stopScan;
let checkUserId1;
let checkUserId2;
let storedAds = new Set();

startScan = (parseLink, chatId, idProxy) => {
    let stop = 0;
 mainAds = async () => {

    await mongoClient.connect();
    const colProxy = db.collection('proxy')
    const colUsers = db.collection('users')
    let checkStop = await colUsers.findOne({userId: Number.parseInt(chatId)})
    let getProxy = await colProxy.findOne({proxyId: Number.parseInt(idProxy)})
    let dateNow = new Date();
    if ((Date.parse(checkStop.nextpay) < Date.parse(dateNow)) || checkStop.stop == 1 || checkStop.ban) {
        stopScript()
        // worker.delMsg();
        let stop = 1;
        let checkUserId1 = await colProxy.findOne({userId1: Number.parseInt(chatId)})
        let checkUserId2 = await colProxy.findOne({userId2: Number.parseInt(chatId)})
        if (checkUserId1) {
            await colProxy.updateOne({proxyId: Number.parseInt(idProxy)},{$set: {userId1: "", link1: "", startMin: "", startSec: ""}})
            await colProxy.updateOne({proxyId: Number.parseInt(idProxy)},{$inc: {counts: -1}})
        }
        if (checkUserId2) {
            await colProxy.updateOne({proxyId: Number.parseInt(idProxy)},{$set: {userId2: "", link2: "",  startMin2: "", startSec2: ""}})
            await colProxy.updateOne({proxyId: Number.parseInt(idProxy)},{$inc: {counts: -1}})
        }
        await colUsers.updateOne({userId: Number.parseInt(chatId)}, {$set: {proxyId: "", link: "", stop: 0}})
        if ((Date.parse(checkStop.nextpay) < Date.parse(dateNow))) await colUsers.updateOne({userId: Number.parseInt(chatId)}, {$set: {status: 'unpaid'}})
    }
    let user = await colUsers.findOne({userId: Number.parseInt(chatId)})

    newAds.length = 0;
getAds = async () => {
    
    let logTime = new Date()
    console.log('Iteration. storedAds.size=' + storedAds.size + " proxy id: " + idProxy + " link: " + parseLink + "\ntime: m:" + logTime.getMinutes() + ":s" + logTime.getSeconds())
    let agent = new httpsProxyAgent(`http://${getProxy.login}:${getProxy.password}@${getProxy.host}:${getProxy.port}`);
    try {
    let getHTML = async (parseLink) => {
        let {data} = await axios({
            url: parseLink,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36'
            },
            httpsAgent: agent
        })
        return cheerio.load(data);
    } 

    let $ = await getHTML(parseLink);
        $('div[class^=iva-item-root-]').each((i, elem) => {
            let somedata = {
                title: $(elem).find('h3[class^=title-root-]').text(),
                link: $(elem).find('a[class^=link-link-]').attr('href'),
                address: $(elem).find('span[class^=geo-address-]').text(),
                price: $(elem).find('span[class^=price-price-]').text(),
                date: $(elem).find('div[data-marker=item-date]').text(),
                description: $(elem).find('div[class^=iva-item-text-]').text(),
                username: $(elem).find('div[class^=iva-item-user]').children('div').text(),
                usertype: $(elem).find('div[class^=iva-item-user]').children('span:first').text()
            }
            newAds.push(somedata);
            // console.log(newAds[i])
        })
        return newAds
        } catch (e) {
    console.log(e)
}
        }
getAds().then(newAds => {
    if (storedAds.size == 0) { // первый проход
        somedata = [];
        data = [];
        for (let i of newAds) {
            if ((i.address) === undefined)  {continue};
            storedAds.add(i.link);            
        }
        try {
        // async () => {
        // mongoClient.connect();
        // const colUsers = db.collection('users')
        // let user = await colUsers.findOne({userId: chatId})
        if (user.link) {
        let TgMsg = `Я проверил страницу и жду новых объявлений! Если вы хотите остановить работу Сканнера, отправьте команду /stop`;
        bot.sendMessage(chatId, TgMsg, {parse_mode: 'HTML'})
        newAds.length = 0;
        }
    // }
        } catch (e) {
            console.log(e)
        }
    } else { // второй и последующие проходы
        
        for(let i of newAds) {
            if ((i.address) === undefined)  {continue};
            if (storedAds.has(i.link) || (/день/.test(i.date) || /дней/.test(i.date) || /дня/.test(i.date) || /час/.test(i.date) || /недел/.test(i.date) || /месяц/.test(i.date) || /минут /.test(i.date) || /[0-9]{2,2} минут/.test(i.date))) {       
                continue
            }; 
            storedAds.add(i.link);
            i.description = i.description.slice(0, 249);
            let formAds = "🔔 <b>Новое объявление</b> 🔔\n\n<b>" + i.title + "</b>" + "\nСтоимость: <b>" + i.price  + "</b>" + "\n<b>" + i.address + "</b>\n\n" + i.description + "\n\nДата поднятия: <b>" + i.date + "</b>\n" +  "<b>" + i.username + "\n" + i.usertype +"</b>" + "\nhttps://avito.ru" + i.link;
            TgMsg = formAds;
            try {
                bot.sendMessage(chatId, TgMsg, {parse_mode: 'HTML'})
            } catch (e) {console.log(e)}
        }
        somedata = [];
        data = [];
        newAds.length = 0;
    }
});
};
mainAds();
stopScan = setInterval(mainAds, 120000);
};

module.exports.startScan = startScan;


let stopScript = () => {console.log("Останавливаем из скрипта");clearTimeout(stopScan);storedAds.clear();}

module.exports.stopSript = stopScript;
