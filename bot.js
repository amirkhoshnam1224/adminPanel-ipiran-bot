require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const newUserScene = require('./scenes/newUser');
const userInfoScene = require('./scenes/userInfo');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ─── بررسی دسترسی ─────────────────────────────────────────
const ALLOWED_IDS = (process.env.ALLOWED_TELEGRAM_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean)
  .map(Number);

const isAllowed = (ctx) => {
  if (ALLOWED_IDS.length === 0) return true;
  return ALLOWED_IDS.includes(ctx.from.id);
};

// ─── منوی اصلی ────────────────────────────────────────────
const mainMenu = Markup.keyboard([
  ['👤 کاربر جدید', '🔍 وضعیت کاربر'],
  ['📊 گزارش (به زودی)', '⚙️ تنظیمات (به زودی)'],
]).resize();

// ─── راه‌اندازی ────────────────────────────────────────────
const stage = new Scenes.Stage([newUserScene, userInfoScene]);
bot.use(session());
bot.use(stage.middleware());

// ─── دستورات ──────────────────────────────────────────────
bot.command('start', (ctx) => {
  if (!isAllowed(ctx)) return ctx.reply('❌ دسترسی ندارید.');
  ctx.reply(
    '👋 سلام! به ربات مدیریت پنل IP Iran Novin خوش آمدید.\n\n' +
    'یکی از گزینه‌های زیر را انتخاب کنید:',
    mainMenu
  );
});

bot.command('newuser', (ctx) => {
  if (!isAllowed(ctx)) return ctx.reply('❌ دسترسی ندارید.');
  ctx.scene.enter('newuser');
});

bot.command('userinfo', (ctx) => {
  if (!isAllowed(ctx)) return ctx.reply('❌ دسترسی ندارید.');
  ctx.scene.enter('userinfo');
});

// ─── دکمه‌های منو ─────────────────────────────────────────
bot.hears('👤 کاربر جدید', (ctx) => {
  console.log('[BOT] کاربر جدید clicked by:', ctx.from.id)
  if (!isAllowed(ctx)) return ctx.reply('❌ دسترسی ندارید.');
  ctx.scene.enter('newuser');
});

bot.hears('🔍 وضعیت کاربر', (ctx) => {
  console.log('[BOT] وضعیت کاربر clicked by:', ctx.from.id)
  if (!isAllowed(ctx)) return ctx.reply('❌ دسترسی ندارید.');
  ctx.scene.enter('userinfo');
});

bot.hears('📊 گزارش (به زودی)', (ctx) => {
  ctx.reply('📊 این بخش به زودی اضافه می‌شود.');
});

bot.hears('⚙️ تنظیمات (به زودی)', (ctx) => {
  ctx.reply('⚙️ این بخش به زودی اضافه می‌شود.');
});

bot.launch();
console.log('🤖 ربات راه‌اندازی شد...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));