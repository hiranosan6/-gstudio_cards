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

  // 5. 読み込みの整えと書き出し(design/gdd/rule-format.md 2026-11-24 修正版)
  {
    const { ctx, page } = await openPage(browser);
    const r = await page.evaluate(() => {
      const P = window.__mock.parseRule, S = window.__mock.serializeRule, SR = window.__mock.serializeRuleWithReport;
      const deep = (n) => '{"format_version":1,"x":' + "[".repeat(n - 1) + "]".repeat(n - 1) + "}";
      const dup = P('{"format_version":1,"cards":[{"id":"add_jokers","params":{"count":"x"}},{"id":"add_jokers","params":{"count":2}}]}');
      const norm = P('{"format_version":1,"cards":[{"id":"add_jokers"},{"id":"place_on_field","params":{"rank":7.6}},{"id":"lose_on_pass_limit","params":{"limit":9}},{"id":"act_pass","params":{"count":3}},{"id":"add_jokers"},5]}');
      const unk = P('{"format_version":1,"cards":[{"id":"foo_bar","params":{"x":1},"memo":"残す"}],"unusable_cards":[{"id":"deal_all"}]}');
      const order = S(P('{"format_version":1,"cards":[{"id":"deal_all"},{"id":"act_pass"},{"id":"add_jokers"}]}').rule);
      const nums = SR({ cards: [], unusable: [
        { id: "z_num", v: [0.1, 1e300, 2.5e20, -0, 3, Infinity] },
        { id: "a_str", s: 'あ"\\/\u0001', b: { y: 1, a: 2, "あ": 3, "B": 4 } },
      ] });
      const roundTrip = (() => { const t = S(unk.rule); return S(P(t).rule) === t; })();
      return {
        dup: dup.rule.cards, dupReport: dup.report.map((x) => x.kind + ":" + (x.why || x.how || "")),
        norm: norm.rule.cards, normReport: norm.report.map((x) => x.kind),
        unk: unk.rule, unkReport: unk.report.map((x) => x.kind),
        reasons: {
          broken: P('{"format_version":1,"cards":[').reason, empty: P("").reason, arr: P("[]").reason,
          newer: P('{"format_version":2}').reason, huge: P('{"format_version":1e300}').reason,
          half: P('{"format_version":1.5}').reason, zero: P('{"format_version":0}').reason,
          long: P("x".repeat(4001)).reason, depth17: P(deep(17)).reason, cardsObj: P('{"format_version":1,"cards":{}}').reason,
          many: P('{"format_version":1,"cards":[' + Array(65).fill('{"id":"x"}').join(",") + "]}").reason,
          idLong: P('{"format_version":1,"cards":[{"id":"' + "a".repeat(41) + '"}]}').reason,
          // 長すぎる文字列と壊れた形が両方あるときは、手順の早い「文字数」を返す
          priority: P("{" + "x".repeat(4001)).reason,
        },
        ok16: P(deep(16)).ok, ok40: P('{"format_version":1,"cards":[{"id":"' + "a".repeat(40) + '"}]}').ok,
        bom: P("﻿" + '{"format_version":1}').ok, v10: P('{"format_version":1.0}').ok,
        str: P('{"format_version":1,"cards":[{"id":"add_jokers","params":{"count":"2"}}]}').rule.cards[0].params.count,
        inf: P('{"format_version":1,"cards":[{"id":"add_jokers","params":{"count":1e400}}]}').rule.cards[0].params.count,
        order, nums: nums.text, numsReport: nums.report.map((x) => x.kind), roundTrip,
      };
    });
    check("同じ札が2枚なら1枚目を有効にし、1枚目の壊れた値は既定値に整える", r.dup.length === 1 && r.dup[0].params.count === 1 && r.dupReport.includes("要素を捨てた:重複"), JSON.stringify(r.dup) + " " + r.dupReport.join(","));
    check("調整値を整える(既定値・四捨五入・範囲内に丸める・不要な値を捨てる)",
      JSON.stringify(r.norm) === JSON.stringify([{ id: "add_jokers", params: { count: 1 } }, { id: "place_on_field", params: { rank: 8 } }, { id: "lose_on_pass_limit", params: { limit: 5 } }, { id: "act_pass" }]),
      JSON.stringify(r.norm));
    check("整えの報告に、直した値・捨てた調整値・捨てた要素が載る",
      ["値を直した", "調整値を捨てた", "要素を捨てた"].every((k) => r.normReport.includes(k)), r.normReport.join(","));
    check("知らない札は使えない札へ丸ごと移し、知っている札は使えない札から戻す",
      r.unk.cards.length === 1 && r.unk.cards[0].id === "deal_all" && r.unk.unusable[0].memo === "残す" && r.unk.unusable[0].params.x === 1
      && r.unkReport.includes("使えない札へ移した") && r.unkReport.includes("使えない札から戻した"), JSON.stringify(r.unk));
    check("使えない札を含むルールは書き出し→読み込み→書き出しで同じ文字列になる", r.roundTrip);
    const R = r.reasons;
    check("断る理由が設計書のとおり", R.broken === "形が壊れている" && R.empty === "形が壊れている" && R.arr === "形が違う"
      && R.newer === "新しい版で作られたルールです" && R.huge === "新しい版で作られたルールです" && R.half === "版が読めない" && R.zero === "版が読めない"
      && R.long === "長すぎる(文字数)" && R.depth17 === "長すぎる(入れ子の深さ)" && R.cardsObj === "札の一覧の形が違う"
      && R.many === "長すぎる(札の数)" && R.idLong === "長すぎる(識別名)" && R.priority === "長すぎる(文字数)", JSON.stringify(R));
    check("境目の値(深さ16・識別名40文字)は受け入れ、先頭の目印と 1.0 も読める", r.ok16 && r.ok40 && r.bom && r.v10);
    check("文字列の \"2\" と無限大は数として使わず既定値にする", r.str === 1 && r.inf === 1);
    check("書き出しは識別名の順で調整値を省略しない", r.order === '{"cards":[{"id":"act_pass"},{"id":"add_jokers","params":{"count":1}},{"id":"deal_all"}],"format_version":1,"unusable_cards":[]}', r.order);
    const expectNums = '{"cards":[],"format_version":1,"unusable_cards":[{"b":{"B":4,"a":2,"y":1,"あ":3},"id":"a_str","s":"あ\\"\\\\/\\u0001"},{"id":"z_num","v":[1.0000000000000001e-1,1.0000000000000001e+300,2.5e+20,0,3,null]}]}';
    // 1e300 は設計書の例では 1e+300 だが、決まり(有効数字17桁)に従うと 1.0000000000000001e+300 になる(README に記録)
    check("数・文字列・鍵の順の書き方が設計書の決まりのとおり(無限大は null にして報告)", r.nums === expectNums && r.numsReport.includes("数を書けない値を null にした"), r.nums);

    // 画面: 直した点の表示と、効かない札の知らせ
    await page.evaluate(() => localStorage.setItem("rule_workshop_mock.rule",
      '{"format_version":1,"cards":[{"id":"deal_all"},{"id":"act_play"},{"id":"act_pass"},{"id":"win_empty_hand"},{"id":"lose_on_pass_limit","params":{"limit":9}},{"id":"cut_eight","params":{"rank":8}}]}'));
    await page.click("#btn-load");
    const fixText = await page.textContent("#fix-report");
    const unusableShown = await page.textContent("#unusable");
    check("読み込んだときに「直した点」が工房に出る", fixText.includes("直した点") && fixText.includes("9 から 5") && fixText.includes("cut_eight"), fixText);
    check("知らない札は「使えない札」として工房に出る", unusableShown.includes("cut_eight"));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, "07_workshop_fix_report_desktop.jpg"), type: "jpeg", quality: 72 });
    await page.evaluate(() => window.__mock.setSeed(3));
    await page.click("#btn-battle");
    await page.waitForSelector("#hand .pcard");
    const logText = await page.textContent("#log");
    check("対戦の始めに「1枚は効きません」と知らせる", logText.includes("1枚は効きません"), logText);
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
