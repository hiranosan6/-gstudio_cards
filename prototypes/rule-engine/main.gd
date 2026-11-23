# PROTOTYPE - NOT FOR PRODUCTION
# Question: ルール札の組み合わせだけで3ルールが動き、どんな組み合わせでも止まらず終わり、1手0.5秒以内か
# Date: 2026-11-23
#
# 実行: godot --headless --path prototypes/rule-engine -s res://main.gd
extends SceneTree

const PRESET_GAMES := 100
const RANDOM_GAMES := 1000


func _init() -> void:
	var report := {}
	var presets := {
		"大富豪": RuleCatalog.DAIFUGO,
		"7ならべ": RuleCatalog.SEVENS,
		"ババ抜き": RuleCatalog.OLD_MAID,
	}
	for name in presets:
		report[name] = _run_batch(presets[name], 4, PRESET_GAMES, 1000)
		print(name, " ", JSON.stringify(report[name]))

	var rng := RandomNumberGenerator.new()
	rng.seed = 20261123
	var summary := {"finished": 0, "draw_turn_limit": 0, "stalemate": 0, "error_conservation": 0}
	var max_usec := 0
	var total_usec_turns := 0
	var t0 := Time.get_ticks_msec()
	var examples := {}
	var fail_tags := {}
	var by_minimum := {"揃っている": {"n": 0, "finished": 0}, "欠けている": {"n": 0, "finished": 0}}
	for i in RANDOM_GAMES:
		var cards := RuleCatalog.random_rule(rng)
		var players := rng.randi_range(2, 6)
		var e := ProtoEngine.new()
		e.setup(cards, players, 5000 + i)
		var r := e.run()
		summary[r["result"]] = summary.get(r["result"], 0) + 1
		max_usec = maxi(max_usec, r["max_decision_usec"])
		total_usec_turns += r["turns"]
		var ids := cards.map(func(c): return c["id"])
		var reduces := ids.has("act_play") or ids.has("flow_discard_pairs")
		var key := "揃っている" if ids.has("win_empty_hand") and reduces else "欠けている"
		by_minimum[key]["n"] += 1
		if r["result"] == "finished":
			by_minimum[key]["finished"] += 1
		if key == "揃っている" and r["result"] != "finished":
			var tag := "ジョーカーが並べられない" if ids.has("cond_adjacent") and ids.has("add_jokers") and ids.has("act_play") else ("強い札のみ・流れ無し" if ids.has("act_play") and ids.has("cond_stronger") and not ids.has("flow_clear_on_all_pass") and not ids.has("cond_adjacent") else ("引くのみ・ペア無し" if ids.has("act_draw_from_next") and not ids.has("flow_discard_pairs") else ("隣の数字・始点無し" if ids.has("cond_adjacent") and not ids.has("place_on_field") else "その他")))
			fail_tags[tag] = fail_tags.get(tag, 0) + 1
		if not examples.has(r["result"]):
			examples[r["result"]] = cards.map(func(c): return c["id"])
	var elapsed := Time.get_ticks_msec() - t0
	report["でたらめな組み合わせ"] = {
		"games": RANDOM_GAMES,
		"results": summary,
		"max_decision_usec": max_usec,
		"avg_turns": float(total_usec_turns) / RANDOM_GAMES,
		"elapsed_msec": elapsed,
		"examples": examples,
		"by_minimum_set": by_minimum,
		"fail_tags": fail_tags,
	}
	print("でたらめな組み合わせ ", JSON.stringify(report["でたらめな組み合わせ"]))
	var f := FileAccess.open("res://results.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(report, "  "))
	f.close()
	quit()


func _run_batch(cards: Array, players: int, games: int, seed_base: int) -> Dictionary:
	var results := {}
	var turns := 0
	var max_usec := 0
	var finished_players := 0
	for i in games:
		var e := ProtoEngine.new()
		e.setup(cards, players, seed_base + i)
		var r := e.run()
		results[r["result"]] = results.get(r["result"], 0) + 1
		turns += r["turns"]
		max_usec = maxi(max_usec, r["max_decision_usec"])
		finished_players += r["finished"]
	return {
		"games": games,
		"results": results,
		"avg_turns": float(turns) / games,
		"avg_finished_players": float(finished_players) / games,
		"max_decision_usec": max_usec,
	}
