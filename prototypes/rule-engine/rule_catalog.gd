# PROTOTYPE - NOT FOR PRODUCTION
# Question: ルール札の組み合わせだけで3ルールが動き、どんな組み合わせでも止まらず終わり、1手0.5秒以内か
# Date: 2026-11-23
#
# 試作で使うルール札16枚と、3つの既存ルールの組み合わせ。
class_name RuleCatalog
extends RefCounted

## 札の一覧: id, 分類, 名前, 調整値の範囲 {キー: [最小, 最大]}
const CARDS := [
	{"id": "deal_all", "category": "配り方", "name": "全部配る", "params": {}},
	{"id": "add_jokers", "category": "配り方", "name": "ジョーカーを入れる", "params": {"count": [1, 2]}},
	{"id": "place_on_field", "category": "配り方", "name": "特定の札を場に並べる", "params": {"rank": [1, 13]}},
	{"id": "act_play", "category": "手番の行動", "name": "出す", "params": {}},
	{"id": "act_pass", "category": "手番の行動", "name": "パス", "params": {}},
	{"id": "act_draw_from_next", "category": "手番の行動", "name": "隣から引く", "params": {}},
	{"id": "cond_stronger", "category": "出せる条件", "name": "強い札を出す", "params": {}},
	{"id": "cond_same_count", "category": "出せる条件", "name": "同じ枚数で出す", "params": {}},
	{"id": "order_daifugo", "category": "出せる条件", "name": "強さの順(3が最弱・2が最強)", "params": {}},
	{"id": "cond_adjacent", "category": "出せる条件", "name": "隣の数字", "params": {}},
	{"id": "flow_clear_on_all_pass", "category": "場の流れ", "name": "全員パスで流す", "params": {}},
	{"id": "flow_discard_pairs", "category": "場の流れ", "name": "ペアを捨てる", "params": {}},
	{"id": "win_empty_hand", "category": "上がり条件", "name": "手札0枚で上がり", "params": {}},
	{"id": "win_ranking", "category": "上がり条件", "name": "順位を付ける", "params": {}},
	{"id": "lose_on_pass_limit", "category": "上がり条件", "name": "パス回数で負け", "params": {"limit": [1, 5]}},
	{"id": "lose_holding_last", "category": "上がり条件", "name": "最後に残ると負け", "params": {}},
]

const DAIFUGO := [
	{"id": "deal_all"},
	{"id": "add_jokers", "params": {"count": 1}},
	{"id": "act_play"},
	{"id": "act_pass"},
	{"id": "cond_stronger"},
	{"id": "cond_same_count"},
	{"id": "order_daifugo"},
	{"id": "flow_clear_on_all_pass"},
	{"id": "win_empty_hand"},
	{"id": "win_ranking"},
]

const SEVENS := [
	{"id": "deal_all"},
	{"id": "place_on_field", "params": {"rank": 7}},
	{"id": "act_play"},
	{"id": "act_pass"},
	{"id": "cond_adjacent"},
	{"id": "win_empty_hand"},
	{"id": "win_ranking"},
	{"id": "lose_on_pass_limit", "params": {"limit": 3}},
]

const OLD_MAID := [
	{"id": "deal_all"},
	{"id": "add_jokers", "params": {"count": 1}},
	{"id": "act_draw_from_next"},
	{"id": "flow_discard_pairs"},
	{"id": "win_empty_hand"},
	{"id": "lose_holding_last"},
]


## でたらめな組み合わせ: 各札を半々の確率で入れ、調整値も範囲内ででたらめに決める
static func random_rule(rng: RandomNumberGenerator) -> Array:
	var cards := []
	for c in CARDS:
		if rng.randf() < 0.5:
			var params := {}
			for key in c["params"]:
				var r: Array = c["params"][key]
				params[key] = rng.randi_range(r[0], r[1])
			cards.append({"id": c["id"], "params": params})
	return cards
