const { Telegraf, Scenes, session, Markup } = require('telegraf');
require('dotenv').config();

const panel = require('./panelApi');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const allowedIds = (process.env.ALLOWED_TELEGRAM_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isAllowed = (ctx) => allowedIds.length === 0 || allowedIds.includes(String(ctx.from.id));

const genPassword = () => String(Math.floor(1000 + Math.random() * 9000));

const panelErrorMessage = (err) => err.response?.data?.message || 'خطا در ارتباط با پنل';

// ─── سناریوی افزودن کاربر ──────────────────────────────────
const addUserWizard = new Scenes.WizardScene(
  'add-user-wizard',

  // مرحله ۱ — درخواست نام کاربری
  async (ctx) => {
    await ctx.reply('نام کاربری جدید را وارد کنید (مثلاً NOVIN521):');
    return ctx.wizard.next();
  },

  // مرحله ۲ — دریافت نام کاربری، نمایش لیست گروه‌ها
  async (ctx) => {
    const name = ctx.message?.text?.trim();
    if (!name) {
      await ctx.reply('لطفاً یک نام کاربری متنی وارد کنید:');
      return;
    }

    ctx.wizard.state.name = name;
    ctx.wizard.state.password = genPassword();

    try {
      const groups = await panel.getGroups();
      if (!groups.length) {
        await ctx.reply('هیچ گروهی (سرور) در پنل یافت نشد.');
        return ctx.scene.leave();
      }
      ctx.wizard.state.groups = groups;
      await ctx.reply(
        'گروه (سرور) را انتخاب کنید:',
        Markup.inlineKeyboard(
          groups.map((g) => Markup.button.callback(g.label, `group:${g.name}`)),
          { columns: 2 }
        )
      );
      return ctx.wizard.next();
    } catch (err) {
      await ctx.reply(`❌ ${panelErrorMessage(err)}`);
      return ctx.scene.leave();
    }
  },

  // مرحله ۳ — دریافت گروه، نمایش لیست پلن‌ها
  async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith('group:')) return;
    await ctx.answerCbQuery();

    const group = data.slice('group:'.length);
    ctx.wizard.state.group = group;

    try {
      const plans = await panel.getPlans();
      const filtered = plans.filter((p) => !p.group_name || p.group_name === group);
      ctx.wizard.state.plans = filtered;

      const buttons = filtered.map((p) => [Markup.button.callback(p.display_name, `plan:${p.name}`)]);
      buttons.push([Markup.button.callback('— بدون پلن —', 'plan:none')]);

      await ctx.editMessageText(
        `گروه انتخاب شد: ${group}\n\nپلن سرویس را انتخاب کنید:`,
        Markup.inlineKeyboard(buttons)
      );
      return ctx.wizard.next();
    } catch (err) {
      await ctx.reply(`❌ ${panelErrorMessage(err)}`);
      return ctx.scene.leave();
    }
  },

  // مرحله ۴ — دریافت پلن، نمایش خلاصه برای تایید
  async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith('plan:')) return;
    await ctx.answerCbQuery();

    const planName = data.slice('plan:'.length);
    ctx.wizard.state.profile = planName === 'none' ? null : planName;

    const { name, password, group, profile, plans } = ctx.wizard.state;
    const plan = plans?.find((p) => p.name === profile);

    await ctx.editMessageText(
      'تایید ساخت کاربر:\n' +
        `نام: ${name}\n` +
        `رمز: ${password}\n` +
        `گروه: ${group}\n` +
        `پلن: ${plan ? plan.display_name : 'بدون پلن'}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ تایید و ساخت', 'confirm')],
        [Markup.button.callback('❌ انصراف', 'cancel')],
      ])
    );
    return ctx.wizard.next();
  },

  // مرحله ۵ — ساخت کاربر در پنل
  async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;
    await ctx.answerCbQuery();

    if (data === 'cancel') {
      await ctx.editMessageText('ساخت کاربر لغو شد.');
      return ctx.scene.leave();
    }
    if (data !== 'confirm') return;

    const { name, password, group, profile } = ctx.wizard.state;

    try {
      await panel.createUser({ name, password, group, profile, sharedUsers: '1' });
      await ctx.editMessageText(
        '✅ کاربر با موفقیت ساخته شد!\n' +
          `نام: ${name}\n` +
          `رمز: ${password}\n` +
          `گروه: ${group}`
      );
    } catch (err) {
      await ctx.editMessageText(`❌ ${panelErrorMessage(err)}`);
    }
    return ctx.scene.leave();
  }
);

addUserWizard.command('cancel', async (ctx) => {
  await ctx.reply('عملیات لغو شد.');
  return ctx.scene.leave();
});

const stage = new Scenes.Stage([addUserWizard]);

bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
  ctx.reply('سلام! من ربات VPN Panel هستم. /help برای دیدن دستورات');
});

bot.command('help', (ctx) => {
  ctx.reply(`
/status - وضعیت سرور
/adduser - افزودن کاربر جدید به پنل VPN
  `);
});

bot.command('status', async (ctx) => {
  try {
    const health = await panel.getHealth();
    ctx.reply(`سرور: ${health.status}`);
  } catch (err) {
    ctx.reply('خطا در اتصال به سرور');
  }
});

bot.command('adduser', (ctx) => {
  if (!isAllowed(ctx)) return ctx.reply('شما اجازه دسترسی به این دستور را ندارید.');
  return ctx.scene.enter('add-user-wizard');
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
