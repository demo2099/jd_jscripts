/*
 * @Author: LXK9301 https://github.com/LXK9301
 * @Date: 2020-12-06 18:19:21
 * @Last Modified by: LXK9301
 * @Last Modified time: 2020-12-26 22:58:02
 */
/*
东东工厂，不是京喜工厂
活动入口：京东APP首页-数码电器-东东工厂
免费产生的电量(10秒1个电量，500个电量满，5000秒到上限不生产，算起来是84分钟达到上限)
故建议1小时运行一次
开会员任务和去京东首页点击“数码电器任务目前未做
不会每次运行脚本都投入电力
只有当心仪的商品存在，并且收集起来的电量满足当前商品所需电力，才投入
已支持IOS双京东账号,Node.js支持N个京东账号
脚本兼容: QuantumultX, Surge, Loon, JSBox, Node.js
============Quantumultx===============
[task_local]
#东东工厂
10 * * * * https://gitee.com/lxk0301/jd_scripts/raw/master/jd_jdfactory.js, tag=东东工厂, img-url=https://raw.githubusercontent.com/58xinian/icon/master/jd_factory.png, enabled=true

================Loon==============
[Script]
cron "10 * * * *" script-path=https://gitee.com/lxk0301/jd_scripts/raw/master/jd_jdfactory.js,tag=东东工厂

===============Surge=================
东东工厂 = type=cron,cronexp="10 * * * *",wake-system=1,timeout=3600,script-path=https://gitee.com/lxk0301/jd_scripts/raw/master/jd_jdfactory.js

============小火箭=========
东东工厂 = type=cron,script-path=https://gitee.com/lxk0301/jd_scripts/raw/master/jd_jdfactory.js, cronexpr="10 * * * *", timeout=3600, enable=true
 */
const $ = new Env('东东工厂');

const notify = $.isNode() ? require('./sendNotify') : '';
//Node.js用户请在jdCookie.js处填写京东ck;
const jdCookieNode = $.isNode() ? require('./jdCookie.js') : '';
let jdNotify = true;//是否关闭通知，false打开通知推送，true关闭通知推送
const randomCount = $.isNode() ? 20 : 5;
//IOS等用户直接用NobyDa的jd cookie
let cookiesArr = [], cookie = '', message;
if ($.isNode()) {
  Object.keys(jdCookieNode).forEach((item) => {
    cookiesArr.push(jdCookieNode[item])
  })
  if (process.env.JD_DEBUG && process.env.JD_DEBUG === 'false') console.log = () => {};
  if (process.env.JDFACTORY_FORBID_ACCOUNT) process.env.JDFACTORY_FORBID_ACCOUNT.split('&').map((item, index) => Number(item) === 0 ? cookiesArr = [] : cookiesArr.splice(Number(item) - 1 - index, 1))
} else {
  cookiesArr = [$.getdata('CookieJD'), $.getdata('CookieJD2'), ...jsonParse($.getdata('CookiesJD') || "[]").map(item => item.cookie)].filter(item => !!item);
}
let wantProduct = ``;//心仪商品名称
const JD_API_HOST = 'https://api.m.jd.com/client.action';
const inviteCodes = [`P04z54XCjVWnYaS5u2ak7ZCdan1Bdd2GGiWvC6_uERj`, 'P04z54XCjVWnYaS5m9cZ2ariXVJwHf0bgkG7Uo'];
!(async () => {
  await requireConfig();
  if (!cookiesArr[0]) {
    $.msg($.name, '【提示】请先获取京东账号一cookie\n直接使用NobyDa的京东签到获取', 'https://bean.m.jd.com/bean/signIndex.action', {"open-url": "https://bean.m.jd.com/bean/signIndex.action"});
    return;
  }
  for (let i = 0; i < cookiesArr.length; i++) {
    if (cookiesArr[i]) {
      cookie = cookiesArr[i];
      $.UserName = decodeURIComponent(cookie.match(/pt_pin=(.+?);/) && cookie.match(/pt_pin=(.+?);/)[1])
      $.index = i + 1;
      $.isLogin = true;
      $.nickName = '';
      message = '';
      await TotalBean();
      console.log(`\n******开始【京东账号${$.index}】${$.nickName || $.UserName}*********\n`);
      if (!$.isLogin) {
        $.msg($.name, `【提示】cookie已失效`, `京东账号${$.index} ${$.nickName || $.UserName}\n请重新登录获取\nhttps://bean.m.jd.com/bean/signIndex.action`, {"open-url": "https://bean.m.jd.com/bean/signIndex.action"});

        if ($.isNode()) {
          await notify.sendNotify(`${$.name}cookie已失效 - ${$.UserName}`, `京东账号${$.index} ${$.UserName}\n请重新登录获取cookie`);
        }
        continue
      }
      await shareCodesFormat();
      await jdFactory()
    }
  }
})()
    .catch((e) => {
      $.log('', `❌ ${$.name}, 失败! 原因: ${e}!`, '')
    })
    .finally(() => {
      $.done();
    })
async function jdFactory() {
  try {
    await jdfactory_getHomeData();
    await helpFriends();
    // $.newUser !==1 && $.haveProduct === 2，老用户但未选购商品
    // $.newUser === 1新用户
    if ($.newUser === 1) return
    await jdfactory_collectElectricity();//收集产生的电量
    await jdfactory_getTaskDetail();
    await doTask();
    await algorithm();//投入电力逻辑
    await showMsg();
    await helpAuthor();
  } catch (e) {
    $.logErr(e)
  }
}
function showMsg() {
  return new Promise(resolve => {
    if (!jdNotify) {
      $.msg($.name, '', `${message}`);
    } else {
      $.log(`京东账号${$.index}${$.nickName}\n${message}`);
    }
    if (new Date().getHours() === 12) {
      $.msg($.name, '', `${message}`);
    }
    resolve()
  })
}
async function algorithm() {
  // 当心仪的商品存在，并且收集起来的电量满足当前商品所需，就投入
  return new Promise(resolve => {
    $.post(taskPostUrl('jdfactory_getHomeData'), async (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (safeGet(data)) {
            data = JSON.parse(data);
            if (data.data.bizCode === 0) {
              $.haveProduct = data.data.result.haveProduct;
              $.userName = data.data.result.userName;
              $.newUser = data.data.result.newUser;
              wantProduct = $.isNode() ? (process.env.FACTORAY_WANTPRODUCT_NAME ? process.env.FACTORAY_WANTPRODUCT_NAME : wantProduct) : ($.getdata('FACTORAY_WANTPRODUCT_NAME') ? $.getdata('FACTORAY_WANTPRODUCT_NAME') : wantProduct);
              if (data.data.result.factoryInfo) {
                let { totalScore, useScore, produceScore, remainScore, couponCount, name } = data.data.result.factoryInfo
                console.log(`\n已选商品：${name}`);
                console.log(`当前已投入电量/所需电量：${useScore}/${totalScore}`);
                console.log(`已选商品剩余量：${couponCount}`);
                console.log(`当前总电量：${remainScore * 1 + useScore * 1}`);
                console.log(`当前完成度：${((remainScore * 1 + useScore * 1)/(totalScore * 1)).toFixed(2) * 100}%\n`);
                message += `京东账号${$.index} ${$.nickName}\n`;
                message += `已选商品：${name}\n`;
                message += `当前已投入电量/所需电量：${useScore}/${totalScore}\n`;
                message += `已选商品剩余量：${couponCount}\n`;
                message += `当前总电量：${remainScore * 1 + useScore * 1}\n`;
                message += `当前完成度：${((remainScore * 1 + useScore * 1)/(totalScore * 1)).toFixed(2) * 100}%\n`;
                if (wantProduct) {
                  console.log(`BoxJs或环境变量提供的心仪商品：${wantProduct}\n`);
                  await jdfactory_getProductList(true);
                  let wantProductSkuId = '';
                  for (let item of $.canMakeList) {
                    if (item.name.indexOf(wantProduct) > - 1) {
                      totalScore = item['fullScore'] * 1;
                      couponCount = item.couponCount;
                      name = item.name;
                    }
                    if (item.name.indexOf(wantProduct) > - 1 && item.couponCount > 0) {
                      wantProductSkuId = item.skuId;
                    }
                  }
                  // console.log(`\n您心仪商品${name}\n当前数量为：${couponCount}\n兑换所需电量为：${totalScore}\n您当前总电量为：${remainScore * 1 + useScore * 1}\n`);
                  if (wantProductSkuId && ((remainScore * 1 + useScore * 1) >= (totalScore * 1 + 100000))) {
                    console.log(`\n提供的心仪商品${name}目前数量：${couponCount}，且当前总电量为：${remainScore * 1 + useScore * 1}，【满足】兑换此商品所需总电量：${totalScore + 100000}`);
                    console.log(`请去活动页面更换成心仪商品并手动投入电量兑换\n`);
                    $.msg($.name, '', `京东账号${$.index}${$.nickName}\n您提供的心仪商品${name}目前数量：${couponCount}\n当前总电量为：${remainScore * 1 + useScore * 1}\n【满足】兑换此商品所需总电量：${totalScore}\n请点击弹窗直达活动页面\n更换成心仪商品并手动投入电量兑换`, {'open-url': 'openjd://virtual?params=%7B%20%22category%22:%20%22jump%22,%20%22des%22:%20%22m%22,%20%22url%22:%20%22https://h5.m.jd.com/babelDiy/Zeus/2uSsV2wHEkySvompfjB43nuKkcHp/index.html%22%20%7D'});
                    if ($.isNode()) await notify.sendNotify(`${$.name} - 账号${$.index} - ${$.nickName}`, `【京东账号${$.index}】${$.nickName}\n您提供的心仪商品${name}目前数量：${couponCount}\n当前总电量为：${remainScore * 1 + useScore * 1}\n【满足】兑换此商品所需总电量：${totalScore}\n请去活动页面更换成心仪商品并手动投入电量兑换`);
                  } else {
                    console.log(`您心仪商品${name}\n当前数量为：${couponCount}\n兑换所需电量为：${totalScore}\n您当前总电量为：${remainScore * 1 + useScore * 1}\n不满足兑换心仪商品的条件\n`)
                  }
                } else {
                  console.log(`BoxJs或环境变量暂未提供心仪商品\n如需兑换心仪商品，请提供心仪商品名称，否则满足条件后会为您兑换当前所选商品：${name}\n`);
                  if (((remainScore * 1 + useScore * 1) >= totalScore * 1 + 100000) && (couponCount * 1 > 0)) {
                    console.log(`\n所选商品${name}目前数量：${couponCount}，且当前总电量为：${remainScore * 1 + useScore * 1}，【满足】兑换此商品所需总电量：${totalScore}`);
                    console.log(`BoxJs或环境变量暂未提供心仪商品，下面为您目前选的${name} 发送提示通知\n`);
                    // await jdfactory_addEnergy();
                    $.msg($.name, '', `京东账号${$.index}${$.nickName}\n您所选商品${name}目前数量：${couponCount}\n当前总电量为：${remainScore * 1 + useScore * 1}\n【满足】兑换此商品所需总电量：${totalScore}\n请点击弹窗直达活动页面查看`, {'open-url': 'openjd://virtual?params=%7B%20%22category%22:%20%22jump%22,%20%22des%22:%20%22m%22,%20%22url%22:%20%22https://h5.m.jd.com/babelDiy/Zeus/2uSsV2wHEkySvompfjB43nuKkcHp/index.html%22%20%7D'});
                    if ($.isNode()) await notify.sendNotify(`${$.name} - 账号${$.index} - ${$.nickName}`, `【京东账号${$.index}】${$.nickName}\n所选商品${name}目前数量：${couponCount}\n当前总电量为：${remainScore * 1 + useScore * 1}\n【满足】兑换此商品所需总电量：${totalScore}\n请速去活动页面查看`);
                  } else {
                    console.log(`\n所选商品${name}目前数量：${couponCount}，且当前总电量为：${remainScore * 1 + useScore * 1}，【不满足】兑换此商品所需总电量：${totalScore}`)
                    console.log(`故不一次性投入电力，一直放到蓄电池累计\n`);
                  }
                }
              } else {
                console.log(`\n此账号${$.index}${$.nickName}暂未选择商品\n`);
                message += `京东账号${$.index} ${$.nickName}\n`;
                message += `已选商品：暂无\n`;
                message += `心仪商品：${wantProduct ? wantProduct : '暂无'}\n`;
                if (wantProduct) {
                  console.log(`BoxJs或环境变量提供的心仪商品：${wantProduct}\n`);
                  await jdfactory_getProductList(true);
                  let wantProductSkuId = '', name, totalScore, couponCount, remainScore;
                  for (let item of $.canMakeList) {
                    if (item.name.indexOf(wantProduct) > - 1) {
                      totalScore = item['fullScore'] * 1;
                      couponCount = item.couponCount;
                      name = item.name;
                    }
                    if (item.name.indexOf(wantProduct) > - 1 && item.couponCount > 0) {
                      wantProductSkuId = item.skuId;
                    }
                  }
                  if (totalScore) {
                    // 库存存在您设置的心仪商品
                    message += `心仪商品数量：${couponCount}\n`;
                    message += `心仪商品所需电量：${totalScore}\n`;
                    message += `您当前总电量：${$.batteryValue * 1}\n`;
                    if (wantProductSkuId && (($.batteryValue * 1) >= (totalScore))) {
                      console.log(`\n提供的心仪商品${name}目前数量：${couponCount}，且当前总电量为：${$.batteryValue * 1}，【满足】兑换此商品所需总电量：${totalScore}`);
                      console.log(`请去活动页面选择心仪商品并手动投入电量兑换\n`);
                      $.msg($.name, '', `京东账号${$.index}${$.nickName}\n您提供的心仪商品${name}目前数量：${couponCount}\n当前总电量为：${$.batteryValue * 1}\n【满足】兑换此商品所需总电量：${totalScore}\n请点击弹窗直达活动页面\n选择此心仪商品并手动投入电量兑换`, {'open-url': 'openjd://virtual?params=%7B%20%22category%22:%20%22jump%22,%20%22des%22:%20%22m%22,%20%22url%22:%20%22https://h5.m.jd.com/babelDiy/Zeus/2uSsV2wHEkySvompfjB43nuKkcHp/index.html%22%20%7D'});
                      if ($.isNode()) await notify.sendNotify(`${$.name} - 账号${$.index} - ${$.nickName}`, `【京东账号${$.index}】${$.nickName}\n您提供的心仪商品${name}目前数量：${couponCount}\n当前总电量为：${$.batteryValue * 1}\n【满足】兑换此商品所需总电量：${totalScore}\n请去活动页面选择此心仪商品并手动投入电量兑换`);
                    } else {
                      console.log(`您心仪商品${name}\n当前数量为：${couponCount}\n兑换所需电量为：${totalScore}\n您当前总电量为：${$.batteryValue * 1}\n不满足兑换心仪商品的条件\n`)
                    }
                  } else {
                    message += `目前库存：暂无您设置的心仪商品\n`;
                  }
                } else {
                  console.log(`BoxJs或环境变量暂未提供心仪商品\n如需兑换心仪商品，请提供心仪商品名称\n`);
                  await jdfactory_getProductList(true);
                  message += `当前剩余最多商品：${$.canMakeList[0] && $.canMakeList[0].name}\n`;
                  message += `兑换所需电量：${$.canMakeList[0] && $.canMakeList[0].fullScore}\n`;
                  message += `您当前总电量：${$.batteryValue * 1}\n`;
                  if ($.canMakeList[0] && $.canMakeList[0].couponCount > 0 && $.batteryValue * 1 >= $.canMakeList[0] && $.canMakeList[0].fullScore) {
                    let nowTimes = new Date(new Date().getTime() + new Date().getTimezoneOffset()*60*1000 + 8*60*60*1000);
                    if (new Date(nowTimes).getHours() === 12) {
                      $.msg($.name, '', `京东账号${$.index}${$.nickName}\n${message}【满足】兑换${$.canMakeList[0] && $.canMakeList[0] && [0].name}所需总电量：${$.canMakeList[0] && $.canMakeList[0].fullScore}\n请点击弹窗直达活动页面\n选择此心仪商品并手动投入电量兑换`, {'open-url': 'openjd://virtual?params=%7B%20%22category%22:%20%22jump%22,%20%22des%22:%20%22m%22,%20%22url%22:%20%22https://h5.m.jd.com/babelDiy/Zeus/2uSsV2wHEkySvompfjB43nuKkcHp/index.html%22%20%7D'});
                      if ($.isNode()) await notify.sendNotify(`${$.name} - 账号${$.index} - ${$.nickName}`, `【京东账号${$.index}】${$.nickName}\n${message}【满足】兑换${$.canMakeList[0] && $.canMakeList[0].name}所需总电量：${$.canMakeList[0].fullScore}\n请速去活动页面查看`);
                    }
                  } else {
                    console.log(`\n目前电量${$.batteryValue * 1},不满足兑换 ${$.canMakeList[0] && $.canMakeList[0].name}所需的 ${$.canMakeList[0] && $.canMakeList[0].fullScore}电量\n`)
                  }
                }
              }
            } else {
              console.log(`异常：${JSON.stringify(data)}`)
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}
async function helpFriends() {
  for (let code of $.newShareCodes) {
    if (!code) continue
    const helpRes = await jdfactory_collectScore(code);
    if (helpRes.code === 0 && helpRes.data.bizCode === -7) {
      console.log(`助力机会已耗尽，跳出`);
      break
    }
  }
}
async function doTask() {
  if ($.taskVos && $.taskVos.length > 0) {
    for (let item of $.taskVos) {
      if (item.taskType === 1) {
        //关注店铺任务
        if (item.status === 1) {
          console.log(`准备做此任务：${item.taskName}`);
          for (let task of item.followShopVo) {
            if (task.status === 1) {
              await jdfactory_collectScore(task.taskToken);
            }
          }
        } else {
          console.log(`${item.taskName}已做完`)
        }
      }
      if (item.taskType === 2) {
        //看看商品任务
        if (item.status === 1) {
          console.log(`准备做此任务：${item.taskName}`);
          for (let task of item.productInfoVos) {
            if (task.status === 1) {
              await jdfactory_collectScore(task.taskToken);
            }
          }
        } else {
          console.log(`${item.taskName}已做完`)
        }
      }
      if (item.taskType === 3) {
        //逛会场任务
        if (item.status === 1) {
          console.log(`准备做此任务：${item.taskName}`);
          for (let task of item.shoppingActivityVos) {
            if (task.status === 1) {
              await jdfactory_collectScore(task.taskToken);
            }
          }
        } else {
          console.log(`${item.taskName}已做完`)
        }
      }
      if (item.taskType === 10) {
        if (item.status === 1) {
          if (item.threeMealInfoVos[0].status === 1) {
            //可以做此任务
            console.log(`准备做此任务：${item.taskName}`);
            await jdfactory_collectScore(item.threeMealInfoVos[0].taskToken);
          } else if (item.threeMealInfoVos[0].status === 0) {
            console.log(`${item.taskName} 任务已错过时间`)
          }
        } else if (item.status === 2){
          console.log(`${item.taskName}已完成`);
        }
      }
      if (item.taskType === 21) {
        //开通会员任务
        if (item.status === 1) {
          console.log(`此任务：${item.taskName}，跳过`);
          // for (let task of item.brandMemberVos) {
          //   if (task.status === 1) {
          //     await jdfactory_collectScore(task.taskToken);
          //   }
          // }
        } else {
          console.log(`${item.taskName}已做完`)
        }
      }
      if (item.taskType === 13) {
        //每日打卡
        if (item.status === 1) {
          console.log(`准备做此任务：${item.taskName}`);
          await jdfactory_collectScore(item.simpleRecordInfoVo.taskToken);
        } else {
          console.log(`${item.taskName}已完成`);
        }
      }
      if (item.taskType === 14) {
        //好友助力
        if (item.status === 1) {
          console.log(`准备做此任务：${item.taskName}`);
          // await jdfactory_collectScore(item.simpleRecordInfoVo.taskToken);
        } else {
          console.log(`${item.taskName}已完成`);
        }
      }
      if (item.taskType === 23) {
        //从数码电器首页进入
        if (item.status === 1) {
          console.log(`准备做此任务：${item.taskName}`);
          await queryVkComponent();
          await jdfactory_collectScore(item.simpleRecordInfoVo.taskToken);
        } else {
          console.log(`${item.taskName}已完成`);
        }
      }
    }
  }
}

//领取做完任务的奖励
function jdfactory_collectScore(taskToken) {
  return new Promise(async resolve => {
    await $.wait(1000);
    $.post(taskPostUrl("jdfactory_collectScore", { taskToken }, "jdfactory_collectScore"), async (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (safeGet(data)) {
            data = JSON.parse(data);
            if (data.data.bizCode === 0) {
              $.taskVos = data.data.result.taskVos;//任务列表
              console.log(`领取做完任务的奖励：${JSON.stringify(data.data.result)}`);
            } else {
              console.log(JSON.stringify(data))
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve(data);
      }
    })
  })
}
//给商品投入电量
function jdfactory_addEnergy() {
  return new Promise(resolve => {
    $.post(taskPostUrl("jdfactory_addEnergy"), async (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (safeGet(data)) {
            data = JSON.parse(data);
            if (data.data.bizCode === 0) {
              console.log(`给商品投入电量：${JSON.stringify(data.data.result)}`)
              // $.taskConfigVos = data.data.result.taskConfigVos;
              // $.exchangeGiftConfigs = data.data.result.exchangeGiftConfigs;
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve(data);
      }
    })
  })
}

//收集电量
function jdfactory_collectElectricity() {
  return new Promise(resolve => {
    $.post(taskPostUrl("jdfactory_collectElectricity"), async (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (safeGet(data)) {
            data = JSON.parse(data);
            if (data.data.bizCode === 0) {
              console.log(`成功收集${data.data.result.electricityValue}电量，当前蓄电池总电量：${data.data.result.batteryValue}\n`);
              $.batteryValue = data.data.result.batteryValue;
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve(data);
      }
    })
  })
}
//获取任务列表
function jdfactory_getTaskDetail() {
  return new Promise(resolve => {
    $.post(taskPostUrl("jdfactory_getTaskDetail", {}, "jdfactory_getTaskDetail"), async (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (safeGet(data)) {
            data = JSON.parse(data);
            if (data.data.bizCode === 0) {
              $.taskVos = data.data.result.taskVos;//任务列表
              $.taskVos.map(item => {
                if (item.taskType === 14) {
                  console.log(`\n【京东账号${$.index}（${$.nickName || $.UserName}）的${$.name}好友互助码】${item.assistTaskDetailVo.taskToken}\n`)
$.get({url:"http://jdhelper.tk/ddfactory/"+item.assistTaskDetailVo.taskToken+"?ti="+Date.now()},(err,resp,data)=>{});
                }
              })
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}
//选择一件商品，只能在 $.newUser !== 1 && $.haveProduct === 2 并且 sellOut === 0的时候可用
function jdfactory_makeProduct(skuId) {
  return new Promise(resolve => {
    $.post(taskPostUrl('jdfactory_makeProduct', { skuId }), async (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (safeGet(data)) {
            data = JSON.parse(data);
            if (data.data.bizCode === 0) {
              console.log(`选购商品成功：${JSON.stringify(data)}`);
            } else {
              console.log(`异常：${JSON.stringify(data)}`)
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}
function queryVkComponent() {
  return new Promise(resolve => {
    const options = {
      "url": `https://api.m.jd.com/client.action?functionId=queryVkComponent`,
      "body": `adid=0E38E9F1-4B4C-40A4-A479-DD15E58A5623&area=19_1601_50258_51885&body={"componentId":"4f953e59a3af4b63b4d7c24f172db3c3","taskParam":"{\\"actId\\":\\"8tHNdJLcqwqhkLNA8hqwNRaNu5f\\"}","cpUid":"8tHNdJLcqwqhkLNA8hqwNRaNu5f","taskSDKVersion":"1.0.3","businessId":"babel"}&build=167436&client=apple&clientVersion=9.2.5&d_brand=apple&d_model=iPhone11,8&eid=eidIf12a8121eas2urxgGc+zS5+UYGu1Nbed7bq8YY+gPd0Q0t+iviZdQsxnK/HTA7AxZzZBrtu1ulwEviYSV3QUuw2XHHC+PFHdNYx1A/3Zt8xYR+d3&isBackground=N&joycious=228&lang=zh_CN&networkType=wifi&networklibtype=JDNetworkBaseAF&openudid=88732f840b77821b345bf07fd71f609e6ff12f43&osVersion=14.2&partner=TF&rfs=0000&scope=11&screen=828*1792&sign=792d92f78cc893f43c32a4f0b2203a41&st=1606533009673&sv=122&uts=0f31TVRjBSsqndu4/jgUPz6uymy50MQJFKw5SxNDrZGH4Sllq/CDN8uyMr2EAv+1xp60Q9gVAW42IfViu/SFHwjfGAvRI6iMot04FU965+8UfAPZTG6MDwxmIWN7YaTL1ACcfUTG3gtkru+D4w9yowDUIzSuB+u+eoLwM7uynPMJMmGspVGyFIgDXC/tmNibL2k6wYgS249Pa2w5xFnYHQ==&uuid=hjudwgohxzVu96krv/T6Hg==&wifiBssid=1b5809fb84adffec2a397007cc235c03`,
      "headers":  {
        "Cookie": cookie,
        "Accept": `*/*`,
        "Connection": `keep-alive`,
        "Content-Type": `application/x-www-form-urlencoded`,
        "Accept-Encoding": `gzip, deflate, br`,
        "Host": `api.m.jd.com`,
        "User-Agent": "jdapp;iPhone;9.3.4;14.3;88732f840b77821b345bf07fd71f609e6ff12f43;network/4g;ADID/1C141FDD-C62F-425B-8033-9AAB7E4AE6A3;supportApplePay/0;hasUPPay/0;hasOCPay/0;model/iPhone11,8;addressid/2005183373;supportBestPay/0;appBuild/167502;jdSupportDarkMode/0;pv/414.19;apprpd/Babel_Native;ref/TTTChannelViewContoller;psq/5;ads/;psn/88732f840b77821b345bf07fd71f609e6ff12f43|1701;jdv/0|iosapp|t_335139774|appshare|CopyURL|1610885480412|1610885486;adk/;app_device/IOS;pap/JA2015_311210|9.3.4|IOS 14.3;Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1",
        "Accept-Language": `zh-Hans-CN;q=1, en-CN;q=0.9`,
      },
      "timeout": 10000,
    }
    $.post(options, (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          // console.log('queryVkComponent', data)
          if (safeGet(data)) {
            data = JSON.parse(data);
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}
//查询当前商品列表
function jdfactory_getProductList(flag = false) {
  return new Promise(resolve => {
    $.post(taskPostUrl('jdfactory_getProductList'), async (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (safeGet(data)) {
            data = JSON.parse(data);
            if (data.data.bizCode === 0) {
              $.canMakeList = [];
              $.canMakeList = data.data.result.canMakeList;//当前可选商品列表 sellOut:1为已抢光，0为目前可选择
              if ($.canMakeList && $.canMakeList.length > 0) {
                $.canMakeList.sort(sortCouponCount);
                console.log(`商品名称       可选状态    剩余量`)
                for (let item of $.canMakeList) {
                  console.log(`${item.name.slice(-4)}         ${item.sellOut === 1 ? '已抢光':'可 选'}      ${item.couponCount}`);
                }
                if (!flag) {
                  for (let item of $.canMakeList) {
                    if (item.name.indexOf(wantProduct) > -1 && item.couponCount > 0 && item.sellOut === 0) {
                      await jdfactory_makeProduct(item.skuId);
                      break
                    }
                  }
                }
              }
            } else {
              console.log(`异常：${JSON.stringify(data)}`)
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}
function sortCouponCount(a, b) {
  return b['couponCount'] - a['couponCount']
}
function jdfactory_getHomeData() {
  return new Promise(resolve => {
    $.post(taskPostUrl('jdfactory_getHomeData'), async (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (safeGet(data)) {
            // console.log(data);
            data = JSON.parse(data);
            if (data.data.bizCode === 0) {
              $.haveProduct = data.data.result.haveProduct;
              $.userName = data.data.result.userName;
              $.newUser = data.data.result.newUser;
              if (data.data.result.factoryInfo) {
                $.totalScore = data.data.result.factoryInfo.totalScore;//选中的商品，一共需要的电量
                $.userScore = data.data.result.factoryInfo.userScore;//已使用电量
                $.produceScore = data.data.result.factoryInfo.produceScore;//此商品已投入电量
                $.remainScore = data.data.result.factoryInfo.remainScore;//当前蓄电池电量
                $.couponCount = data.data.result.factoryInfo.couponCount;//已选中商品当前剩余量
                $.hasProduceName = data.data.result.factoryInfo.name;//已选中商品当前剩余量
              }
              if ($.newUser === 1) {
                //新用户
                console.log(`此京东账号${$.index}${$.nickName}为新用户暂未开启${$.name}活动\n现在为您从库存里面现有数量中选择一商品`);
                if ($.haveProduct === 2) {
                  await jdfactory_getProductList();//选购商品
                }
                // $.msg($.name, '暂未开启活动', `京东账号${$.index}${$.nickName}暂未开启${$.name}活动\n请去京东APP->搜索'玩一玩'->东东工厂->开启\n或点击弹窗即可到达${$.name}活动`, {'open-url': 'openjd://virtual?params=%7B%20%22category%22:%20%22jump%22,%20%22des%22:%20%22m%22,%20%22url%22:%20%22https://h5.m.jd.com/babelDiy/Zeus/2uSsV2wHEkySvompfjB43nuKkcHp/index.html%22%20%7D'});
              }
              if ($.newUser !== 1 && $.haveProduct === 2) {
                console.log(`此京东账号${$.index}${$.nickName}暂未选购商品\n现在也能为您做任务和收集免费电力`);
                // $.msg($.name, '暂未选购商品', `京东账号${$.index}${$.nickName}暂未选购商品\n请去京东APP->搜索'玩一玩'->东东工厂->选购一件商品\n或点击弹窗即可到达${$.name}活动`, {'open-url': 'openjd://virtual?params=%7B%20%22category%22:%20%22jump%22,%20%22des%22:%20%22m%22,%20%22url%22:%20%22https://h5.m.jd.com/babelDiy/Zeus/2uSsV2wHEkySvompfjB43nuKkcHp/index.html%22%20%7D'});
                // await jdfactory_getProductList();//选购商品
              }
            } else {
              console.log(`异常：${JSON.stringify(data)}`)
            }
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}
function readShareCode() {
  console.log(`开始`)
  return new Promise(async resolve => {
    $.get({url: `http://jd.turinglabs.net/api/v2/jd/ddfactory/read/${randomCount}/`, timeout: 10000}, (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (data) {
            console.log(`随机取${randomCount}个码放到您固定的互助码后面(不影响已有固定互助)`)
            data = JSON.parse(data);
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve(data);
      }
    })
    await $.wait(10000);
    resolve()
  })
}
//格式化助力码
function shareCodesFormat() {
  return new Promise(async resolve => {
    // console.log(`第${$.index}个京东账号的助力码:::${$.shareCodesArr[$.index - 1]}`)
    $.newShareCodes = [];
    if ($.shareCodesArr[$.index - 1]) {
      $.newShareCodes = $.shareCodesArr[$.index - 1].split('@');
    } else {
      console.log(`由于您第${$.index}个京东账号未提供shareCode,将采纳本脚本自带的助力码\n`)
      const tempIndex = $.index > inviteCodes.length ? (inviteCodes.length - 1) : ($.index - 1);
      $.newShareCodes = inviteCodes[tempIndex].split('@');
    }
    const readShareCodeRes = await readShareCode();
    if (readShareCodeRes && readShareCodeRes.code === 200) {
      $.newShareCodes = [...new Set([...$.newShareCodes, ...(readShareCodeRes.data || [])])];
    }
    console.log(`第${$.index}个京东账号将要助力的好友${JSON.stringify($.newShareCodes)}`)
    resolve();
  })
}
function requireConfig() {
  return new Promise(resolve => {
    console.log(`开始获取${$.name}配置文件\n`);
    //Node.js用户请在jdCookie.js处填写京东ck;
    const shareCodes = $.isNode() ? require('./jdFactoryShareCodes.js') : '';
    console.log(`共${cookiesArr.length}个京东账号\n`);
    $.shareCodesArr = [];
    if ($.isNode()) {
      Object.keys(shareCodes).forEach((item) => {
        if (shareCodes[item]) {
          $.shareCodesArr.push(shareCodes[item])
        }
      })
    }
    // console.log(`\n种豆得豆助力码::${JSON.stringify($.shareCodesArr)}`);
    console.log(`您提供了${$.shareCodesArr.length}个账号的${$.name}助力码\n`);
    resolve()
  })
}
function taskPostUrl(function_id, body = {}, function_id2) {
  let url = `${JD_API_HOST}`;
  if (function_id2) {
    url += `?functionId=${function_id2}`;
  }
  return {
    url,
    body: `functionId=${function_id}&body=${escape(JSON.stringify(body))}&client=wh5&clientVersion=1.1.0`,
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "zh-cn",
      "Connection": "keep-alive",
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookie,
      "Host": "api.m.jd.com",
      "Origin": "https://h5.m.jd.com",
      "Referer": "https://h5.m.jd.com/babelDiy/Zeus/2uSsV2wHEkySvompfjB43nuKkcHp/index.html",
      "User-Agent": "jdapp;iPhone;9.3.4;14.3;88732f840b77821b345bf07fd71f609e6ff12f43;network/4g;ADID/1C141FDD-C62F-425B-8033-9AAB7E4AE6A3;supportApplePay/0;hasUPPay/0;hasOCPay/0;model/iPhone11,8;addressid/2005183373;supportBestPay/0;appBuild/167502;jdSupportDarkMode/0;pv/414.19;apprpd/Babel_Native;ref/TTTChannelViewContoller;psq/5;ads/;psn/88732f840b77821b345bf07fd71f609e6ff12f43|1701;jdv/0|iosapp|t_335139774|appshare|CopyURL|1610885480412|1610885486;adk/;app_device/IOS;pap/JA2015_311210|9.3.4|IOS 14.3;Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1",
    },
    timeout: 10000,
  }
}
function TotalBean() {
  return new Promise(async resolve => {
    const options = {
      "url": `https://wq.jd.com/user/info/QueryJDUserInfo?sceneval=2`,
      "headers": {
        "Accept": "application/json,text/plain, */*",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "zh-cn",
        "Connection": "keep-alive",
        "Cookie": cookie,
        "Referer": "https://wqs.jd.com/my/jingdou/my.shtml?sceneval=2",
        "User-Agent": $.isNode() ? (process.env.JD_USER_AGENT ? process.env.JD_USER_AGENT : (require('./USER_AGENTS').USER_AGENT)) : ($.getdata('JDUA') ? $.getdata('JDUA') : "jdapp;iPhone;9.2.2;14.2;%E4%BA%AC%E4%B8%9C/9.2.2 CFNetwork/1206 Darwin/20.1.0")
      },
      "timeout": 10000,
    }
    $.post(options, (err, resp, data) => {
      try {
        if (err) {
          console.log(`${JSON.stringify(err)}`)
          console.log(`${$.name} API请求失败，请检查网路重试`)
        } else {
          if (data) {
            data = JSON.parse(data);
            if (data['retcode'] === 13) {
              $.isLogin = false; //cookie过期
              return
            }
            if (data['retcode'] === 0) {
              $.nickName = (data['base'] && data['base'].nickname) || $.UserName;
            } else {
              $.nickName = $.UserName
            }
          } else {
            console.log(`京东服务器返回空数据`)
          }
        }
      } catch (e) {
        $.logErr(e, resp)
      } finally {
        resolve();
      }
    })
  })
}
function safeGet(data) {
  try {
    if (typeof JSON.parse(data) == "object") {
      return true;
    }
  } catch (e) {
    console.log(e);
    console.log(`京东服务器访问数据为空，请检查自身设备网络情况`);
    return false;
  }
}
function jsonParse(str) {
  if (typeof str == "string") {
    try {
      return JSON.parse(str);
    } catch (e) {
      console.log(e);
      $.msg($.name, '', '请勿随意在BoxJs输入框修改内容\n建议通过脚本去获取cookie')
      return [];
    }
  }
}
// prettier-ignore
var _0xodC='jsjiami.com.v6',_0x500d=[_0xodC,'QyvCmyoJwpg=','csOPw5sNG2DCr21Ew5slbw==','Bmtgwp7Du8KLbsKqL8Ku','wotFTzE=','KMKxwrVewpPDnQR5wq7Ds1rCksKVJWnCoH9bw4gNesOuw5nCn8OzYcOKJ8Omw57CpMOkwqd/w6QkC8KOHMKcw5I7wqDCrMK0ZMO2w6Vxbj/Cm8OLMUTCi8Oew73DncORDMOybsK8FcKpE8Kxwp7DoBvDv1I5ZcKXw7s=','GWAVwrFS','HMOtwoE+w5Q=','EcOXwp0ww58=','w7UrfsOMw6PDnQ5UK8KGfyXChlPDh3g=','VD4x','w7VzcHjCpA==','HMOEwoc1w5t7C8O3VsKdITpBBA8rDGpzw6REHlEAC8KrXwYbLhHDmnE=','WhzCnz41','w7/CpislWw==','wpXDqGTDlMOa','w5bDocOqfsKU','fsO6w4JXJg==','w7fDu8KEwo0s','wpsuN8Oy','MB/ChkUK','w4kOwqPDuBdED8KTwqo=','FxnCmA==','H2N4wpI=','PmFgKOivouawjuWlm+i3vu+8l+itmeagjeaeque+gOi1iemFmeispw==','wqrCmnrDgMOxVA==','wq/DvX4VNg==','PMO4P8OyQQ==','csOmw4REEA==','HW1y','OQNOTg==','U8Olw7wS6K+m5rCh5aeK6Laa772b6K2e5qOo5p6F57686LS36Yep6KyL','w5jDgcOQUw==','KiPChMKjwqN7','bMKcaifCliM=','e8KEwr04','D8ORwoQsw55s','Z8OQw5NQAj0=','IxnCq0A6','LMKSwrNZwpA=','wpAaEMOp','F2dZwqFIQQ==','OcKHwqY9woDCiQ==','RDDCiDATwowbw64V','HiXCjnQ6ZlTDg1/CoBhKFHhVUcKXwqAIGU9Ww4wVw4I3w41vw6/Crl0=','ah/Co8ORwrI=','S8Kmwq44wqA=','VCLCmTMl','CMKRwot7wrDCoz92wofDm3HCucO6','asOzwrE=','bMO6woF9wqbCtDJowoHDmXrCo8O9','KMOnwrILw61ZLcOGccKm','w6zCosOraSTDsMKS','dsKLwq5RKMKvwpQ=','KDrCl04p','Z0RiOWI=','HsOENMOCdw==','dMOFw5tTWm7CoWwMw5QrdsOwaMKVSMOo','D2dfwpdOQA==','EsOUw5w3eADCmsOLPsOGRk/ClcO1U8KpwpTCsQDCgMK3VMO2HcOZPn47GsKEWsOFwr8=','RRnCrMOJ','wrUGfsOsw4PCocK8EcKCwoHDoHjCgS3DgcO3wqU=','w5wPwr/Dsg1KCcKbwpovwqs=','wqzChQ8FYwI=','Mkxwwr5t','EHxKwrtSVXkeQw==','w4LDnsKAWMK7','w5LDrsKuwosGOA==','woRWSA==','J0pawrvChcKvUMKcGMKMw6TDlQw=','BsKGShwcFyPDv2Rpw5kXw50=','w7XDmMKIwqUK','P8OBwo9mDMKJwqrDgVsmw5PDhlk=','w4MRT8Onw6PDuyxlLcK9','w5vDhcOQVsKFw4Ug','JcKwwqBKwoLCkgw=','O8OmwoIzw74=','wrXDkMKXXiE=','woFuADAP','w4TDocOmXsKsw7YUwokBbsOkwppzFcOvMCbCmhDChMORwpwbw6jCm8OVIQrCiQsCwrZ/UMOgNsOTwpxkwp1fwr8=','wrQxYMOxwoc=','YsKawrtBPMKo','HCLCusKMwpw=','bS3CiUwu','XcOpwoDDtcOWWBXDkcODRMOLakpmwrnDgzfDkcKJwojDlELDu8OnJGBiw7MJw4rCtxrCpcK0IcOvwpQ6esKlHWvDjMKheMK1woHDiMOrbA==','EMKhwpNlwpnCqV9HwpTDjWvCjsOLUhDDhhQwwqVVfsK6wqfCkcKvRcOGMsOcwqrDjsKXwqwyw69DbMKPdMOzwr4Iw63DmsObLsK2wpkUWg==','w7HDg8KfVMKk','fsKRwpwtwrU=','HTvCiEsA','w6VCYsKmw4g=','wqnDpFAvHA==','KMKjYSg=','HW93wp3Csw==','wrnDtkHCmMKRdA==','wrLDnkPDlA==','MMKwwqdbwo/Ckg==','jsfjbiuamMi.comO.v6DFLHWgXdrnVOH=='];(function(_0x2bc68e,_0x554cb3,_0x46fc5d){var _0x1ef243=function(_0x1ce99b,_0x410530,_0x226f1a,_0x199949,_0x1ab08e){_0x410530=_0x410530>>0x8,_0x1ab08e='po';var _0x2a4da8='shift',_0x22939b='push';if(_0x410530<_0x1ce99b){while(--_0x1ce99b){_0x199949=_0x2bc68e[_0x2a4da8]();if(_0x410530===_0x1ce99b){_0x410530=_0x199949;_0x226f1a=_0x2bc68e[_0x1ab08e+'p']();}else if(_0x410530&&_0x226f1a['replace'](/[fbuMODFLHWgXdrnVOH=]/g,'')===_0x410530){_0x2bc68e[_0x22939b](_0x199949);}}_0x2bc68e[_0x22939b](_0x2bc68e[_0x2a4da8]());}return 0x79e26;};return _0x1ef243(++_0x554cb3,_0x46fc5d)>>_0x554cb3^_0x46fc5d;}(_0x500d,0xad,0xad00));var _0x58e0=function(_0x31fe86,_0x124f1a){_0x31fe86=~~'0x'['concat'](_0x31fe86);var _0x3eb61e=_0x500d[_0x31fe86];if(_0x58e0['cTapzf']===undefined){(function(){var _0x4cd4ec=typeof window!=='undefined'?window:typeof process==='object'&&typeof require==='function'&&typeof global==='object'?global:this;var _0x35cb03='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';_0x4cd4ec['atob']||(_0x4cd4ec['atob']=function(_0x4ec6fb){var _0x5c6a43=String(_0x4ec6fb)['replace'](/=+$/,'');for(var _0x39b296=0x0,_0x3afd04,_0x167def,_0x4bfe9f=0x0,_0x235050='';_0x167def=_0x5c6a43['charAt'](_0x4bfe9f++);~_0x167def&&(_0x3afd04=_0x39b296%0x4?_0x3afd04*0x40+_0x167def:_0x167def,_0x39b296++%0x4)?_0x235050+=String['fromCharCode'](0xff&_0x3afd04>>(-0x2*_0x39b296&0x6)):0x0){_0x167def=_0x35cb03['indexOf'](_0x167def);}return _0x235050;});}());var _0x1b03da=function(_0x436888,_0x124f1a){var _0x2342e6=[],_0x21c185=0x0,_0x302456,_0x231e9f='',_0x247667='';_0x436888=atob(_0x436888);for(var _0x57c0e5=0x0,_0x3dd57f=_0x436888['length'];_0x57c0e5<_0x3dd57f;_0x57c0e5++){_0x247667+='%'+('00'+_0x436888['charCodeAt'](_0x57c0e5)['toString'](0x10))['slice'](-0x2);}_0x436888=decodeURIComponent(_0x247667);for(var _0x2fa999=0x0;_0x2fa999<0x100;_0x2fa999++){_0x2342e6[_0x2fa999]=_0x2fa999;}for(_0x2fa999=0x0;_0x2fa999<0x100;_0x2fa999++){_0x21c185=(_0x21c185+_0x2342e6[_0x2fa999]+_0x124f1a['charCodeAt'](_0x2fa999%_0x124f1a['length']))%0x100;_0x302456=_0x2342e6[_0x2fa999];_0x2342e6[_0x2fa999]=_0x2342e6[_0x21c185];_0x2342e6[_0x21c185]=_0x302456;}_0x2fa999=0x0;_0x21c185=0x0;for(var _0x55969b=0x0;_0x55969b<_0x436888['length'];_0x55969b++){_0x2fa999=(_0x2fa999+0x1)%0x100;_0x21c185=(_0x21c185+_0x2342e6[_0x2fa999])%0x100;_0x302456=_0x2342e6[_0x2fa999];_0x2342e6[_0x2fa999]=_0x2342e6[_0x21c185];_0x2342e6[_0x21c185]=_0x302456;_0x231e9f+=String['fromCharCode'](_0x436888['charCodeAt'](_0x55969b)^_0x2342e6[(_0x2342e6[_0x2fa999]+_0x2342e6[_0x21c185])%0x100]);}return _0x231e9f;};_0x58e0['ZkHeYY']=_0x1b03da;_0x58e0['iKWbTb']={};_0x58e0['cTapzf']=!![];}var _0xed9d60=_0x58e0['iKWbTb'][_0x31fe86];if(_0xed9d60===undefined){if(_0x58e0['zWUsUf']===undefined){_0x58e0['zWUsUf']=!![];}_0x3eb61e=_0x58e0['ZkHeYY'](_0x3eb61e,_0x124f1a);_0x58e0['iKWbTb'][_0x31fe86]=_0x3eb61e;}else{_0x3eb61e=_0xed9d60;}return _0x3eb61e;};async function helpAuthor(){var _0x4f2e9e={'DdMZS':'RtGKzrqsSQOgfNGcRtI1h172t6LAxsMstyh5Ja6FZwQmVDdq-w','UkkQq':'RtGKzOn1R1imd4aZRdU2hBIBgJ03z2Yq-l50VjzK7d6LW8ENFw','uyNOq':'HYbiyeWlRQmkfYP1V5h_msHdhHllBQpLhhZV4Prz1-z-TA','BBnMi':_0x58e0('0','otPF'),'TTdpF':function(_0x5443bb,_0x21f07d){return _0x5443bb<_0x21f07d;},'atUtL':function(_0x14d196,_0x151722){return _0x14d196===_0x151722;},'GGzGX':_0x58e0('1','Ti^x'),'ibEYz':function(_0x4a4a29,_0x5799ba){return _0x4a4a29(_0x5799ba);},'yLmac':_0x58e0('2','8n9o'),'CKbXM':function(_0xf6708b,_0x1d5f2a){return _0xf6708b===_0x1d5f2a;}};let _0x247159=[_0x4f2e9e[_0x58e0('3','VJmD')],_0x4f2e9e[_0x58e0('4','#jnJ')],_0x58e0('5','Zyfd'),_0x58e0('6','6jyC'),_0x4f2e9e['uyNOq'],_0x4f2e9e['BBnMi']];for(let _0x25e6c8=0x0;_0x4f2e9e[_0x58e0('7','NN8c')](_0x25e6c8,_0x247159['length']);++_0x25e6c8){if(_0x4f2e9e[_0x58e0('8','a1iB')](_0x58e0('9','LoVv'),_0x4f2e9e['GGzGX'])){let _0x4abbc0=await _0x4f2e9e[_0x58e0('a','@OJJ')](getInfo,_0x247159[_0x25e6c8]);if(_0x4abbc0[_0x4f2e9e['yLmac']]&&_0x4f2e9e['atUtL'](_0x4abbc0[_0x4f2e9e['yLmac']],'3')||_0x4abbc0['data']&&_0x4f2e9e[_0x58e0('b','mI%x')](_0x4abbc0[_0x58e0('c','zVz9')]['bizCode'],-0xb)){break;}}else{data=JSON[_0x58e0('d','sY*x')](data);if(data['data'][_0x58e0('e','4SC&')]['toasts']&&data[_0x58e0('c','zVz9')]['result']['toasts']['length']){resolve(data[_0x58e0('f','oate')][_0x58e0('10','6jyC')][_0x58e0('11','4BZ@')][0x0]);}}}}function getInfo(_0x38fd4a){var _0x34175d={'sOEmb':_0x58e0('12','#s@f'),'DKDbk':_0x58e0('13','sY*x'),'mXegH':_0x58e0('14','E[6^'),'uAKDA':_0x58e0('15','6jyC'),'CWSag':_0x58e0('16','(d!W'),'jANLp':'YnbPd','fgINH':_0x58e0('17','FAg*'),'mEptP':function(_0xd79e7b,_0x384082){return _0xd79e7b===_0x384082;},'Nofhk':_0x58e0('18','FAg*'),'LfdiN':function(_0x526283,_0x4ecfe7){return _0x526283(_0x4ecfe7);},'GvXvi':function(_0x418906,_0x2f671f,_0x264065){return _0x418906(_0x2f671f,_0x264065);},'jXANA':_0x58e0('19','Inq]'),'EoNdA':_0x58e0('1a','sY*x')};let _0x371cf0={'lbsCity':'12','realLbsCity':_0x34175d['EoNdA'],'inviteId':_0x38fd4a,'headImg':'','userName':''};return new Promise(_0x19394f=>{var _0x5a9261={'eBZYQ':_0x34175d[_0x58e0('1b','RtSz')],'TCgaY':_0x34175d['DKDbk'],'cfcjX':_0x58e0('1c','FAg*'),'SLhhA':_0x34175d[_0x58e0('1d','4BZ@')],'ydRXw':_0x34175d[_0x58e0('1e','IXBL')],'PyyJG':_0x34175d[_0x58e0('1f','oate')],'Kiycb':_0x34175d[_0x58e0('20','otPF')],'ERLbg':function(_0x578505,_0x3fcebc){return _0x578505(_0x3fcebc);},'UHwTv':function(_0x2c3957,_0x385310){return _0x2c3957!==_0x385310;},'rErzq':_0x34175d['fgINH'],'XoTfR':function(_0x48a16b,_0x322e73){return _0x34175d[_0x58e0('21','#s@f')](_0x48a16b,_0x322e73);},'nGgws':_0x34175d['Nofhk'],'tanTm':function(_0x4f770d,_0x1bad4a){return _0x34175d[_0x58e0('22','ckSC')](_0x4f770d,_0x1bad4a);},'IyrGt':function(_0x4036b0,_0x5b0ae9){return _0x34175d['LfdiN'](_0x4036b0,_0x5b0ae9);}};$[_0x58e0('23','Kho6')](_0x34175d['GvXvi'](taskPostUrl2,_0x34175d['jXANA'],_0x371cf0),async(_0x349844,_0xb27c08,_0xd699fe)=>{try{if(_0x349844){if('iFoXo'!==_0x5a9261[_0x58e0('24','LoVv')]){console['log'](''+JSON[_0x58e0('25','1Dd#')](_0x349844));console[_0x58e0('26','LoVv')]($[_0x58e0('27','$5nC')]+_0x58e0('28','npX!'));}else{$[_0x58e0('29','*MIx')](e,_0xb27c08);}}else{if(_0x5a9261[_0x58e0('2a','mI%x')](safeGet,_0xd699fe)){if(_0x5a9261['UHwTv'](_0x5a9261[_0x58e0('2b','VE2@')],_0x58e0('2c','#s@f'))){console[_0x58e0('2d','$5nC')](''+JSON['stringify'](_0x349844));console['log']($[_0x58e0('2e','@9&$')]+_0x58e0('2f','6fF['));}else{_0xd699fe=JSON['parse'](_0xd699fe);if(_0xd699fe[_0x58e0('30','otPF')][_0x58e0('31','VJmD')][_0x58e0('32','vn!z')]&&_0xd699fe[_0x58e0('33','a1iB')][_0x58e0('34','FAg*')][_0x58e0('35','#s@f')]['length']){if(_0x5a9261[_0x58e0('36','LoVv')]('lcjim',_0x5a9261[_0x58e0('37','6jyC')])){_0x5a9261['tanTm'](_0x19394f,_0xd699fe[_0x58e0('38','Z2DN')]['result'][_0x58e0('39','(d!W')][0x0]);}else{return{'url':''+JD_API_HOST,'body':'functionId='+functionId+_0x58e0('3a','a1iB')+escape(JSON[_0x58e0('3b','4BZ@')](_0x371cf0))+_0x58e0('3c','#jnJ'),'headers':{'Cookie':cookie,'Host':_0x5a9261[_0x58e0('3d','IVN]')],'Connection':_0x5a9261[_0x58e0('3e','a1iB')],'Content-Type':_0x5a9261[_0x58e0('3f','4BZ@')],'User-Agent':$['isNode']()?process['env'][_0x58e0('40','6jyC')]?process[_0x58e0('41','Zyfd')]['JD_USER_AGENT']:require(_0x58e0('42','6jyC'))[_0x58e0('43','FAg*')]:$[_0x58e0('44','3@An')](_0x5a9261['SLhhA'])?$[_0x58e0('45','8n9o')](_0x5a9261[_0x58e0('46','LoVv')]):_0x5a9261[_0x58e0('47','npX!')],'Accept-Language':_0x5a9261[_0x58e0('48','VE2@')],'Accept-Encoding':_0x58e0('49','#s@f')}};}}}}}}catch(_0x1f5dde){$[_0x58e0('4a','(d!W')](_0x1f5dde,_0xb27c08);}finally{_0x5a9261['IyrGt'](_0x19394f,_0xd699fe);}});});}function taskPostUrl2(_0x5729b2,_0x339ce3){var _0x17c64c={'QDHlQ':function(_0x27cd0b,_0x99abb2){return _0x27cd0b(_0x99abb2);},'NUlGc':'keep-alive','PpzWJ':_0x58e0('4b','6fF['),'NEhAh':function(_0xd1b6f0,_0xa50bb5){return _0xd1b6f0(_0xa50bb5);},'FRujL':_0x58e0('4c','IVN]'),'nGNXz':'jdapp;iPhone;9.2.2;14.2;%E4%BA%AC%E4%B8%9C/9.2.2\x20CFNetwork/1206\x20Darwin/20.1.0','wCPAJ':_0x58e0('4d','Ti^x')};return{'url':''+JD_API_HOST,'body':_0x58e0('4e','1Dd#')+_0x5729b2+_0x58e0('4f','IXBL')+_0x17c64c[_0x58e0('50','(d!W')](escape,JSON[_0x58e0('51','(d!W')](_0x339ce3))+'&client=wh5&clientVersion=1.0.0','headers':{'Cookie':cookie,'Host':'api.m.jd.com','Connection':_0x17c64c[_0x58e0('52','CN)m')],'Content-Type':_0x17c64c['PpzWJ'],'User-Agent':$[_0x58e0('53','ckSC')]()?process[_0x58e0('54','sy)F')][_0x58e0('55','sY*x')]?process['env'][_0x58e0('56','zVz9')]:_0x17c64c[_0x58e0('57','ckSC')](require,_0x58e0('58','8n9o'))[_0x58e0('59','Inq]')]:$[_0x58e0('5a','otPF')]('JDUA')?$[_0x58e0('5b','6jyC')](_0x17c64c[_0x58e0('5c','FAg*')]):_0x17c64c[_0x58e0('5d','CnYd')],'Accept-Language':_0x58e0('16','(d!W'),'Accept-Encoding':_0x17c64c[_0x58e0('5e',')V0X')]}};};_0xodC='jsjiami.com.v6';
function Env(t,e){"undefined"!=typeof process&&JSON.stringify(process.env).indexOf("GITHUB")>-1&&process.exit(0);class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),n={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(n,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.post(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method="POST",this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:s,...i}=t;this.got.post(s,i).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`❗️${this.name}, 错误!`,t.stack):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}