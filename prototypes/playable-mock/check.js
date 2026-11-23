// PROTOTYPE - NOT FOR PRODUCTION
// 遊べる画面のモックを Playwright で自動で確かめ、画面の写真を撮る。
// 実行: node prototypes/playable-mock/check.js
const { chromium, devices } = require("playwright");
const path = require("path");
const fs = require("fs");

const URL = "file://" + path.join(__dirname, "index.html");
const SHOTS = path.join(__dirname, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || "" });
  console.log(`${ok ? "合格" : "不合格"}: ${name}${detail ? " — " + detail : ""}`);
}

async function openPage(browser, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL);
  return { ctx, page, errors };
}
const preset = (page, name) => page.click(`#presets button:has-text("${name}")`);
async function fastAuto(page) {
  await page.click("#btn-speed");
  await page.click("#btn-auto");
}
async function waitResult(page, timeout) {
  await page.waitForSelector("#overlay:not(.hidden) [data-result]", { timeout: timeout || 60000 });
  return page.getAttribute("#overlay [data-result]", "data-result");
}
async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

(async () => {
  const browser = await chromium.launch();

  // 1. 3つのひな形が最後まで進む(自分もおまかせ。乱数の種を変えて各3局)
  {
    const { ctx, page, errors } = await openPage(browser);
    await fastAuto(page).catch(() => {});
    for (const [name, seeds] of [["大富豪", [11, 12, 13]], ["7ならべ", [21, 22, 23]], ["ババ抜き", [31, 32, 33]]]) {
      const got = [];
      for (const s of seeds) {
        if (await page.isVisible("#btn-result-fix")) await page.click("#btn-result-fix");
        await preset(page, name);
        await page.evaluate((s) => window.__mock.setSeed(s), s);
        await page.click("#btn-battle");
        if (!(await page.textContent("#btn-speed")).includes("速い")) await fastAuto(page);
        got.push(await waitResult(page));
      }
      check(`${name}: おまかせで3局とも決着する`, got.every((r) => r === "finished"), got.join(","));
    }
    check("ひな形の対戦で画面の誤りが出ない", errors.length === 0, errors.join(" / "));
    await ctx.close();
  }

  // 2. 自分の手を画面で押して最後まで進む(3つのひな形)
  for (const [name, seed] of [["大富豪", 5], ["7ならべ", 6], ["ババ抜き", 7]]) {
    const { ctx, page, errors } = await openPage(browser);
    await preset(page, name);
    await page.evaluate((s) => window.__mock.setSeed(s), seed);
    await page.click("#btn-battle");
    await page.click("#btn-speed");
    let clicks = 0;
    for (let i = 0; i < 400; i++) {
      if (await page.isVisible("#overlay:not(.hidden)")) break;
      const can = await page.$("#hand .pcard.can");
      const count = await page.$('#actions button:has-text("枚で出す")');
      const draw = await page.$('#actions button:has-text("から引く")');
      const pass = await page.$('#actions button:has-text("パス")');
      if (count) { await count.click(); clicks++; }
      else if (can) { await can.click(); clicks++; }
      else if (draw) { await draw.click(); clicks++; }
      else if (pass) { await pass.click(); clicks++; }
      else await page.waitForTimeout(80);
    }
    const r = await waitResult(page);
    check(`${name}: 自分の札を押して対戦が最後まで進む`, r === "finished" && clicks > 0, `結果 ${r}、押した回数 ${clicks}`);
    check(`${name}: 画面の誤りが出ない`, errors.length === 0, errors.join(" / "));
    await ctx.close();
  }

  // 3. 相性の注意が出る(置くのは止めない)
  {
    const { ctx, page } = await openPage(browser);
    await preset(page, "7ならべ");
    const before = await page.$$eval("#warnings li", (l) => l.length);
    await page.click('#box [data-id="add_jokers"]');
    const texts = await page.$$eval("#warnings li", (l) => l.map((x) => x.textContent));
    const placed = await page.$('#board [data-id="add_jokers"]');
    const badges = await page.$$eval("#board .rcard.warned", (l) => l.map((x) => x.dataset.id));
    check("ひな形の7ならべには注意が無い", before === 0, `注意 ${before}件`);
    check("「隣の数字」と「ジョーカー入り」で両立しない注意が出る", texts.some((t) => t.includes("両立しない")), texts.join(" / "));
    check("注意があっても札は盤に置かれる", !!placed);
    check("注意の札に「!」の印が付く", badges.includes("add_jokers") && badges.includes("cond_adjacent"), badges.join(","));
    await page.click('#board [data-id="flow_clear_on_all_pass"]').catch(() => {});
    await page.click('#box [data-id="cond_stronger"]');
    const t2 = await page.$$eval("#warnings li", (l) => l.map((x) => x.textContent));
    check("「強い札だけ」に「パスで流す」が無い注意が出る", t2.some((t) => t.includes("「強い札だけ」には「パスで流す」があるとよい")), t2.length + "件");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, "01_workshop_warning_desktop.jpg"), type: "jpeg", quality: 72 });
    await ctx.close();
  }

  // 4. 保存→読み込みで同じルールに戻る
  {
    const { ctx, page } = await openPage(browser);
    await preset(page, "大富豪");
    await page.click('#board [data-id="act_pass"]');                 // パスを外す
    await page.click('#board button[aria-label="ジョーカー入りの枚数を増やす"]'); // 枚数 1→2
    await page.click('#box [data-id="lose_on_pass_limit"]');
    await page.click('#board button[aria-label="パスで負けの回数を減らす"]');   // 回数 3→2
    const saved = await page.evaluate(() => window.__mock.currentRuleText());
    await page.click("#btn-save");
    const stored = await page.evaluate(() => localStorage.getItem("rule_workshop_mock.rule"));
    await preset(page, "ババ抜き");
    const other = await page.evaluate(() => window.__mock.currentRuleText());
    await page.click("#btn-load");
    const loaded = await page.evaluate(() => window.__mock.currentRuleText());
    check("保存した文字列が決まった形と一致する", stored === saved, stored);
    check("別のルールに変えた後、読み込むと同じルールに戻る", loaded === saved && other !== saved);
    // 開き直しても残る
    await page.reload();
    await page.click("#btn-load");
    const reloaded = await page.evaluate(() => window.__mock.currentRuleText());
    check("ページを開き直しても読み込める", reloaded === saved);
    await ctx.close();
  }

  // 5. 読み込みの整え(design/gdd/rule-format.md の例)
  {
    const { ctx, page } = await openPage(browser);
    const r = await page.evaluate(() => {
      const P = window.__mock.parseRule, S = window.__mock.serializeRule;
      const dup = P('{"format_version":1,"cards":[{"id":"add_jokers","params":{"count":2}},{"id":"add_jokers","params":{"count":1}}]}');
      const norm = P('{"format_version":1,"cards":[{"id":"add_jokers"},{"id":"place_on_field","params":{"rank":7.6}},{"id":"lose_on_pass_limit","params":{"limit":9}},{"id":"act_pass","params":{"count":3}}]}');
      const unk = P('{"format_version":1,"cards":[{"id":"foo_bar","params":{"x":1}}]}');
      const order = S(P('{"format_version":1,"cards":[{"id":"deal_all"},{"id":"act_pass"},{"id":"add_jokers"}]}').rule);
      return {
        dup: dup.rule.cards, norm: norm.rule.cards, unk: unk.rule,
        broken: P('{"format_version":1,"cards":[').reason, arr: P("[]").reason,
        newer: P('{"format_version":2}').reason, long: P("x".repeat(4001)).reason,
        str: P('{"format_version":1,"cards":[{"id":"add_jokers","params":{"count":"2"}}]}').rule.cards[0].params.count,
        order,
      };
    });
    check("同じ札が2枚なら1枚目を有効にする", r.dup.length === 1 && r.dup[0].params.count === 2, JSON.stringify(r.dup));
    check("調整値を整える(既定値・四捨五入・範囲内に丸める・不要な値を捨てる)",
      JSON.stringify(r.norm) === JSON.stringify([{ id: "add_jokers", params: { count: 1 } }, { id: "place_on_field", params: { rank: 8 } }, { id: "lose_on_pass_limit", params: { limit: 5 } }, { id: "act_pass" }]),
      JSON.stringify(r.norm));
    check("知らない札は使えない札へ移す", r.unk.cards.length === 0 && r.unk.unusable[0].id === "foo_bar");
    check("壊れた文字列は理由を返して読み込まない", r.broken === "形が壊れている" && r.arr === "形が違う" && r.newer === "新しい版で作られたルールです" && r.long.startsWith("長すぎる"),
      [r.broken, r.arr, r.newer, r.long].join(" / "));
    check("文字列の \"2\" は数として使わず既定値にする", r.str === 1);
    check("書き出しは識別名の順で調整値を省略しない", r.order === '{"cards":[{"id":"act_pass"},{"id":"add_jokers","params":{"count":1}},{"id":"deal_all"}],"format_version":1,"unusable_cards":[]}', r.order);
    await ctx.close();
  }

  // 6. 引き分け2種類の区別と「直す」への誘導、時間の表示
  {
    const { ctx, page } = await openPage(browser, { ...devices["iPhone 13"] });
    await page.click("#btn-clear");
    await page.click('#box [data-id="deal_all"]');
    await page.click('#box [data-id="win_empty_hand"]');
    await page.evaluate(() => window.__mock.setSeed(1));
    await page.click("#btn-battle");
    await fastAuto(page);
    const r1 = await waitResult(page);
    const t1 = await page.textContent("#result");
    check("手番の行動が無いと「誰も動けず打ち切り」になる", r1 === "stalemate" && t1.includes("誰も動けず打ち切り") && t1.includes("手番の行動"), r1);
    check("結果に「直す」ボタンがある", await page.isVisible("#btn-result-fix"));
    await page.screenshot({ path: path.join(SHOTS, "05_result_stalemate_phone.jpg"), type: "jpeg", quality: 72 });

    // 直す → ババ抜きから「ペアを捨てる」を外す(手札が減らない) → 長すぎて引き分け
    await page.click("#btn-result-fix");
    await preset(page, "ババ抜き");
    await page.click('#board [data-id="flow_discard_pairs"]');
    await page.evaluate(() => window.__mock.setSeed(2));
    await page.click("#btn-battle");
    const r2 = await waitResult(page, 120000);
    const t2 = await page.textContent("#result");
    check("手札が減らないルールは「長すぎて引き分け」になる", r2 === "draw_turn_limit" && t2.includes("長すぎて引き分け") && t2.includes("ペアを捨てる"), r2);

    // 直してから最初の手番までの時間
    await page.click("#btn-result-fix");
    await page.click('#box [data-id="win_empty_hand"]');
    await page.click("#btn-battle");
    await page.waitForFunction(() => document.getElementById("timing").textContent.includes("直してから"));
    const timing = await page.evaluate(() => window.__lastTiming);
    check("「直す」から最初の手番までの時間を表示する", timing && timing.totalMs !== null, JSON.stringify(timing));
    check("対戦ボタンから最初の手番まで100ミリ秒以内(柱2の3秒に十分な余裕)", timing && timing.prepMs <= 100, `${timing && timing.prepMs}ミリ秒`);
    await ctx.close();
  }

  // 7. スマートフォンの幅で崩れない・押せる部分の大きさ・画面の写真
  {
    const { ctx, page } = await openPage(browser, { ...devices["iPhone 13"] });
    await preset(page, "大富豪");
    check("工房: スマートフォンの幅で横にはみ出さない", await noHorizontalScroll(page));
    const small = await page.$$eval("button, [role=button]", (l) => l.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && (r.width < 44 || r.height < 44);
    }).map((b) => b.textContent.trim().slice(0, 10)));
    check("工房: 押せる部分はすべて44ピクセル以上", small.length === 0, small.join(","));
    await page.screenshot({ path: path.join(SHOTS, "02_workshop_phone.jpg"), type: "jpeg", quality: 72 });
    await page.evaluate(() => window.__mock.setSeed(9));
    await page.click("#btn-battle");
    await page.waitForSelector("#hand .pcard");
    // 自分の番になるまで待つ
    await page.waitForSelector("#hand .pcard.can, #actions button", { timeout: 20000 });
    check("対戦: スマートフォンの幅で横にはみ出さない", await noHorizontalScroll(page));
    const handSmall = await page.$$eval("#hand .pcard", (l) => {
      // 重ねた札の、押せる見えている幅
      const rs = l.map((b) => b.getBoundingClientRect());
      return rs.filter((r, i) => {
        const next = rs[i + 1];
        const visible = next && Math.abs(next.top - r.top) < 30 ? next.left - r.left : r.width;
        return visible < 43.5;
      }).length;
    });
    check("対戦: 手札の札の見えている幅は44ピクセル以上", handSmall === 0, `${handSmall}枚が狭い`);
    await page.screenshot({ path: path.join(SHOTS, "03_battle_daifugo_phone.jpg"), type: "jpeg", quality: 72 });
    await ctx.close();
  }
  {
    const { ctx, page } = await openPage(browser, { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await page.screenshot({ path: path.join(SHOTS, "00_workshop_desktop.jpg"), type: "jpeg", quality: 72 });
    await preset(page, "7ならべ");
    await page.evaluate(() => window.__mock.setSeed(4));
    await page.click("#btn-battle");
    await page.click("#btn-speed");
    for (let i = 0; i < 12; i++) {
      await page.waitForSelector("#hand .pcard.can, #actions button", { timeout: 20000 });
      const can = await page.$("#hand .pcard.can");
      if (can) await can.click(); else await page.click('#actions button:has-text("パス")');
      await page.waitForTimeout(150);
    }
    await page.waitForSelector("#hand .pcard.can, #actions button", { timeout: 20000 });
    await page.screenshot({ path: path.join(SHOTS, "04_battle_sevens_desktop.jpg"), type: "jpeg", quality: 72 });
    await page.click("#btn-auto");
    await waitResult(page);
    await page.screenshot({ path: path.join(SHOTS, "06_result_sevens_desktop.jpg"), type: "jpeg", quality: 72 });
    await ctx.close();
  }

  await browser.close();
  const ng = results.filter((r) => !r.ok);
  console.log(`\n${results.length}件中 ${results.length - ng.length}件 合格`);
  fs.writeFileSync(path.join(__dirname, "check-results.json"), JSON.stringify(results, null, 2));
  process.exit(ng.length ? 1 : 0);
})();
