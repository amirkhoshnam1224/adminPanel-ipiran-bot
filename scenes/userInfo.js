const { Scenes, Markup } = require('telegraf');
const { getUserDetail, getUserUsage } = require('../panelApi');

const userInfoScene = new Scenes.WizardScene(
  'userinfo',

  // مرحله ۱ — دریافت نام کاربری
  async (ctx) => {
    await ctx.reply(
      '🔍 نام کاربری را وارد کنید:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'cancel')]
      ])
    );
    return ctx.wizard.next();
  },

  // مرحله ۲ — نمایش اطلاعات
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery();
      await ctx.editMessageText('❌ عملیات لغو شد.');
      return ctx.scene.leave();
    }

    if (!ctx.message?.text) return;

    const username = ctx.message.text.trim().toUpperCase()
    await ctx.reply('⏳ در حال دریافت اطلاعات...');

    try {
      const [detail, usage] = await Promise.all([
        getUserDetail(username),
        getUserUsage(username),
      ]);

      const user = detail.user;
      const profile = detail.profiles?.[0];
      const dbUser = detail.dbUser;

      if (!user || !user.name) {
        await ctx.reply('❌ کاربر یافت نشد.');
        return ctx.scene.leave();
      }

      // وضعیت
      const isOnline = detail.activeSession ? '🟢 آنلاین' : '⚫️ آفلاین';
      const isDisabled = user.disabled === 'true' ? '🔴 مسدود' : '🟢 فعال';

      // روزهای مانده
      let daysLeft = '—'
      if (profile?.['end-time'] && profile['end-time'] !== 'not-yet-running') {
        const diff = Math.ceil((new Date(profile['end-time']) - new Date()) / 86400000)
        daysLeft = diff > 0 ? `${diff} روز` : '⚠️ منقضی شده'
      }

      // حجم مصرفی
      const usageText = usage.displayValue
        ? `${usage.displayValue} ${usage.displayUnit}`
        : '۰'

      const text =
        `📊 اطلاعات کاربر\n` +
        `${'─'.repeat(25)}\n` +
        `👤 نام کاربری: \`${user.name}\`\n` +
        `🔑 رمز عبور: \`${dbUser?.password || '—'}\`\n` +
        `📝 نام: ${dbUser?.full_name || '—'}\n` +
        `🖥 سرور: ${user.group || '—'}\n` +
        `📦 پلن: ${profile?.profile || '—'}\n` +
        `📅 پایان سرویس: ${profile?.['end-time'] || '—'}\n` +
        `⏰ روزهای مانده: ${daysLeft}\n` +
        `💾 حجم مصرفی: ${usageText}\n` +
        `🔌 اتصال: ${isOnline}\n` +
        `⚡️ وضعیت: ${isDisabled}`

      await ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔍 جستجوی کاربر دیگر', 'search_again')],
          [Markup.button.callback('🔙 بازگشت به منو', 'cancel')],
        ])
      });

      return ctx.wizard.next();
    } catch (err) {
      await ctx.reply(`❌ خطا: ${err.message}`);
      return ctx.scene.leave();
    }
  },

  // مرحله ۳ — جستجوی مجدد یا بازگشت
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();

    if (ctx.callbackQuery.data === 'search_again') {
      ctx.wizard.selectStep(0);
      await ctx.editMessageText('🔍 نام کاربری را وارد کنید:');
      return;
    }

    await ctx.editMessageText('👋 به منوی اصلی بازگشتید.');
    return ctx.scene.leave();
  }
);

module.exports = userInfoScene;