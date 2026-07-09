const { Scenes, Markup } = require('telegraf');
const { getGroups, getPlans, getNextUsername, createUser } = require('../panelApi');

const genPassword = () => String(Math.floor(1000 + Math.random() * 9000));

const newUserScene = new Scenes.WizardScene(
  'newuser',

  // مرحله ۱ — انتخاب گروه
  async (ctx) => {
    try {
      const groups = await getGroups();
      if (!groups.length) return ctx.reply('❌ هیچ گروهی یافت نشد.');

      ctx.wizard.state.groups = groups;

      const buttons = groups.map(g => [Markup.button.callback(g.name, `group:${g.name}`)]);
      buttons.push([Markup.button.callback('🔙 بازگشت', 'cancel')])

      await ctx.reply('🖥 سرور را انتخاب کنید:', Markup.inlineKeyboard(buttons));
      return ctx.wizard.next();
    } catch (err) {
      await ctx.reply(`❌ خطا: ${err.message}`);
      return ctx.scene.leave();
    }
  },

  // مرحله ۲ — انتخاب پلن
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    if (ctx.callbackQuery.data === 'cancel') {
      await ctx.answerCbQuery()
      await ctx.editMessageText('❌ عملیات لغو شد.')
      return ctx.scene.leave()
    }

    const groupName = ctx.callbackQuery.data.replace('group:', '');
    ctx.wizard.state.group = groupName;
    await ctx.answerCbQuery();

    try {
      const allPlans = await getPlans();
      const plans = allPlans.filter(p =>
        !p.group_name || p.group_name === '' || p.group_name === groupName
      );

      if (!plans.length) {
        await ctx.editMessageText(`❌ هیچ پلنی برای گروه ${groupName} یافت نشد.`);
        return ctx.scene.leave();
      }

      ctx.wizard.state.plans = plans;

      const buttons = plans.map(p => [
        Markup.button.callback(
          `${p.display_name}${p.price > 0 ? ` — ${p.price.toLocaleString()} ت` : ''}`,
          `plan:${p.name}`
        )
      ]);
      buttons.push([Markup.button.callback('🔙 بازگشت', 'cancel')])

      await ctx.editMessageText(
        `✅ سرور: ${groupName}\n\n📦 پلن را انتخاب کنید:`,
        Markup.inlineKeyboard(buttons)
      );
      return ctx.wizard.next();
    } catch (err) {
      await ctx.reply(`❌ خطا: ${err.message}`);
      return ctx.scene.leave();
    }
  },

  // مرحله ۳ — روش ورود
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    if (ctx.callbackQuery.data === 'cancel') {
      await ctx.answerCbQuery()
      await ctx.editMessageText('❌ عملیات لغو شد.')
      return ctx.scene.leave()
    }

    const planName = ctx.callbackQuery.data.replace('plan:', '');
    const plan = ctx.wizard.state.plans.find(p => p.name === planName);
    ctx.wizard.state.plan = plan;
    await ctx.answerCbQuery();

    await ctx.editMessageText(
      `✅ سرور: ${ctx.wizard.state.group}\n` +
      `📦 پلن: ${plan.display_name}\n\n` +
      `نام کاربری و رمز چطور وارد شود؟`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🎲 خودکار', 'mode:auto')],
        [Markup.button.callback('✏️ دستی', 'mode:manual')],
        [Markup.button.callback('🔙 بازگشت', 'cancel')],
      ])
    );
    return ctx.wizard.next();
  },

  // مرحله ۴ — دریافت یوزر/پسورد
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'cancel') {
        await ctx.answerCbQuery()
        await ctx.editMessageText('❌ عملیات لغو شد.')
        return ctx.scene.leave()
      }

      const mode = ctx.callbackQuery.data.replace('mode:', '');
      ctx.wizard.state.mode = mode;
      await ctx.answerCbQuery();

      if (mode === 'auto') {
        const { nextUsername } = await getNextUsername();
        ctx.wizard.state.username = nextUsername;
        ctx.wizard.state.password = genPassword();
        await showConfirm(ctx);
        return ctx.wizard.next();
      } else {
        await ctx.editMessageText('✏️ نام کاربری را وارد کنید:')
        return;
      }
    }

    if (!ctx.wizard.state.username && ctx.message?.text) {
      ctx.wizard.state.username = ctx.message.text.trim()
      await ctx.reply('🔑 رمز عبور را وارد کنید:\n(یا /skip برای رمز خودکار)')
      return;
    }

    if (ctx.wizard.state.username && ctx.message?.text) {
      ctx.wizard.state.password = ctx.message.text === '/skip'
        ? genPassword()
        : ctx.message.text.trim()
      await showConfirm(ctx);
      return ctx.wizard.next();
    }
  },

  // مرحله ۵ — تأیید نهایی
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();

    if (ctx.callbackQuery.data === 'cancel') {
      await ctx.editMessageText('❌ عملیات لغو شد.');
      return ctx.scene.leave();
    }

    const { username, password, group, plan } = ctx.wizard.state;

    try {
      await ctx.editMessageText('⏳ در حال ساخت کاربر...');

      const endDate = plan.days > 0
        ? `${new Date(Date.now() + plan.days * 86400000).toISOString().split('T')[0]} 00:00:00`
        : null

      await createUser({
        name: username,
        password,
        group,
        profile: plan.name,
        sharedUsers: '1',
        comment: '',
        agreedPrice: plan.price,
        manualEndTime: endDate,
      });

      await ctx.editMessageText(
        `✅ کاربر با موفقیت ساخته شد!\n\n` +
        `👤 نام کاربری: \`${username}\`\n` +
        `🔑 رمز عبور: \`${password}\`\n` +
        `🖥 سرور: ${group}\n` +
        `📦 پلن: ${plan.display_name}\n` +
        `💰 قیمت: ${plan.price > 0 ? plan.price.toLocaleString() + ' تومان' : 'رایگان'}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'خطای ناشناخته'
      await ctx.editMessageText(`❌ خطا در ساخت کاربر: ${errMsg}`);
    }

    return ctx.scene.leave();
  }
);

async function showConfirm(ctx) {
  const { username, password, group, plan } = ctx.wizard.state;
  const endDate = plan.days > 0
    ? new Date(Date.now() + plan.days * 86400000).toISOString().split('T')[0]
    : 'نامحدود'

  const text =
    `📋 خلاصه اطلاعات:\n\n` +
    `👤 نام کاربری: \`${username}\`\n` +
    `🔑 رمز عبور: \`${password}\`\n` +
    `🖥 سرور: ${group}\n` +
    `📦 پلن: ${plan.display_name}\n` +
    `📅 پایان سرویس: ${endDate}\n` +
    `💰 قیمت: ${plan.price > 0 ? plan.price.toLocaleString() + ' تومان' : 'رایگان'}\n\n` +
    `آیا تأیید می‌کنید؟`

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ تأیید و ساخت', 'confirm')],
    [Markup.button.callback('❌ انصراف', 'cancel')],
  ])

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard })
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard })
  }
}

module.exports = newUserScene;