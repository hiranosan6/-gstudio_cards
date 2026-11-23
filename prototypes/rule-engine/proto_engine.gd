# PROTOTYPE - NOT FOR PRODUCTION
# Question: ルール札の組み合わせだけで3ルールが動き、どんな組み合わせでも止まらず終わり、1手0.5秒以内か
# Date: 2026-11-23
#
# ルール札(id と調整値の並び)を読み取り、画面なしで1局を最後まで進める試作の実行部分。
# 札の一覧は rule_catalog.gd を参照。
class_name ProtoEngine
extends RefCounted

const JOKER_SUIT := 4
const NO_PROGRESS_ROUNDS := 4
const TURNS_PER_PLAYER := 300

var rule := {}
var rng := RandomNumberGenerator.new()
var num_players := 4
var hands := []
var stock := []
var discard := []
var pile := []
var pile_owner := -1
var layout := {}
var layout_count := 0
var last_layout_card := -1
var passes := []
var finished := []
var out := {}
var consecutive_passes := 0
var forced_next := -1
var turn := 0
var max_turns := 0
var no_progress := 0
var total_cards := 0
var max_decision_usec := 0
var result := ""
var loser := -1


func has(id: String) -> bool:
	return rule.has(id)


func param(id: String, key: String, default_value: int) -> int:
	if not rule.has(id):
		return default_value
	return int(rule[id].get(key, default_value))


static func suit_of(c: int) -> int:
	return c / 100


static func rank_of(c: int) -> int:
	return c % 100


static func is_joker(c: int) -> bool:
	return suit_of(c) == JOKER_SUIT


func strength(c: int) -> int:
	if is_joker(c):
		return 100
	var r := rank_of(c)
	if has("order_daifugo"):
		return (r + 10) % 13
	return r


func layout_mode() -> bool:
	return has("cond_adjacent")


func setup(rule_cards: Array, players: int, seed_value: int) -> void:
	rule = {}
	for rc in rule_cards:
		rule[rc["id"]] = rc.get("params", {})
	rng.seed = seed_value
	num_players = players
	var deck := []
	for s in 4:
		for r in range(1, 14):
			deck.append(s * 100 + r)
	if has("add_jokers"):
		for i in clampi(param("add_jokers", "count", 1), 1, 2):
			deck.append(JOKER_SUIT * 100 + 50 + i)
	total_cards = deck.size()
	for i in range(deck.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp = deck[i]
		deck[i] = deck[j]
		deck[j] = tmp
	hands = []
	passes = []
	for p in players:
		hands.append([])
		passes.append(0)
	if has("deal_all"):
		for i in deck.size():
			hands[i % players].append(deck[i])
	else:
		# 配り方の札が無いときは各自5枚、残りは山札として使わない
		var k := 0
		for i in 5:
			for p in players:
				if k < deck.size():
					hands[p].append(deck[k])
					k += 1
		stock = deck.slice(k)
	if has("place_on_field"):
		var base_rank := clampi(param("place_on_field", "rank", 7), 1, 13)
		for p in players:
			for c in hands[p].duplicate():
				if not is_joker(c) and rank_of(c) == base_rank:
					hands[p].erase(c)
					_add_to_layout(c)
	if has("flow_discard_pairs"):
		for p in players:
			_discard_pairs(p)
	max_turns = TURNS_PER_PLAYER * players


func run() -> Dictionary:
	_update_finishers()
	var current := rng.randi_range(0, num_players - 1)
	while true:
		if _check_end():
			break
		turn += 1
		if turn > max_turns:
			result = "draw_turn_limit"
			break
		if no_progress > num_players * NO_PROGRESS_ROUNDS:
			result = "stalemate"
			break
		if not _is_active(current):
			current = _next_active(current)
			continue
		_take_turn(current)
		if not _conservation_ok():
			result = "error_conservation"
			break
		_update_finishers()
		if forced_next != -1:
			current = forced_next if _is_active(forced_next) else _next_active(forced_next)
			forced_next = -1
		else:
			current = _next_active(current)
	return {
		"result": result,
		"turns": turn,
		"max_decision_usec": max_decision_usec,
		"finished": finished.size(),
		"loser": loser,
	}


func _is_active(p: int) -> bool:
	return not finished.has(p) and not out.has(p)


func _active_count() -> int:
	var n := 0
	for p in num_players:
		if _is_active(p):
			n += 1
	return n


func _next_active(p: int) -> int:
	for i in range(1, num_players + 1):
		var q := (p + i) % num_players
		if _is_active(q):
			return q
	return p


func _check_end() -> bool:
	var active := _active_count()
	var until_one := has("win_ranking") or has("lose_holding_last")
	if active == 0:
		result = "finished"
		return true
	if active == 1 and (until_one or finished.size() + out.size() > 0):
		for p in num_players:
			if _is_active(p):
				loser = p
		result = "finished"
		return true
	if not until_one and finished.size() >= 1:
		result = "finished"
		return true
	return false


func _update_finishers() -> void:
	if not has("win_empty_hand"):
		return
	for p in num_players:
		if _is_active(p) and hands[p].is_empty():
			finished.append(p)
			no_progress = 0


func _take_turn(p: int) -> void:
	var t0 := Time.get_ticks_usec()
	var moves := legal_moves(p)
	var mv: Dictionary = choose(p, moves)
	var dt := Time.get_ticks_usec() - t0
	if dt > max_decision_usec:
		max_decision_usec = dt
	_apply(p, mv)


func legal_moves(p: int) -> Array:
	var moves := []
	if has("act_play"):
		moves.append_array(_play_moves(p))
	if has("act_draw_from_next"):
		var q := _next_with_cards(p)
		if q != -1:
			moves.append({"type": "draw", "from": q})
	if has("act_pass"):
		moves.append({"type": "pass"})
	if moves.is_empty():
		moves.append({"type": "forced_pass"})
	return moves


func _next_with_cards(p: int) -> int:
	for i in range(1, num_players):
		var q := (p + i) % num_players
		if _is_active(q) and not hands[q].is_empty():
			return q
	return -1


func _play_moves(p: int) -> Array:
	var moves := []
	var hand: Array = hands[p]
	if layout_mode():
		for c in hand:
			if is_joker(c) or not _adjacent_ok(c):
				continue
			if has("cond_stronger") and last_layout_card != -1 and strength(c) <= strength(last_layout_card):
				continue
			moves.append({"type": "play", "cards": [c]})
		return moves
	var groups := {}
	var jokers := []
	for c in hand:
		if is_joker(c):
			jokers.append(c)
		else:
			var r := rank_of(c)
			if not groups.has(r):
				groups[r] = []
			groups[r].append(c)
	for r in groups:
		var g: Array = groups[r]
		var max_k := g.size() if has("cond_same_count") else 1
		for k in range(1, max_k + 1):
			var cards := g.slice(0, k)
			if _pile_ok(cards):
				moves.append({"type": "play", "cards": cards})
	for j in jokers:
		if _pile_ok([j]):
			moves.append({"type": "play", "cards": [j]})
	return moves


func _pile_ok(cards: Array) -> bool:
	if pile.is_empty():
		return true
	if has("cond_same_count") and cards.size() != pile.size():
		return false
	if has("cond_stronger") and strength(cards[0]) <= strength(pile[0]):
		return false
	return true


func _adjacent_ok(c: int) -> bool:
	var ranks: Array = layout.get(suit_of(c), [])
	if ranks.is_empty():
		return not has("place_on_field")
	var r := rank_of(c)
	return ranks.has(r - 1) or ranks.has(r + 1)


## 簡単なコンピューター: 自分の手札と「出せる手」だけを見る。
## 出せるなら一番弱い札(同じ強さなら枚数の多い組)、出せなければ引く、それも無ければパス。
func choose(_p: int, moves: Array) -> Dictionary:
	var best := {}
	for mv in moves:
		if mv["type"] != "play":
			continue
		if best.is_empty():
			best = mv
			continue
		var s_new := strength(mv["cards"][0])
		var s_best := strength(best["cards"][0])
		if s_new < s_best or (s_new == s_best and mv["cards"].size() > best["cards"].size()):
			best = mv
	if not best.is_empty():
		return best
	for t in ["draw", "pass", "forced_pass"]:
		for mv in moves:
			if mv["type"] == t:
				return mv
	return moves[0]


func _apply(p: int, mv: Dictionary) -> void:
	match mv["type"]:
		"play":
			for c in mv["cards"]:
				hands[p].erase(c)
			if layout_mode():
				for c in mv["cards"]:
					_add_to_layout(c)
					last_layout_card = c
			else:
				discard.append_array(pile)
				pile = mv["cards"].duplicate()
				pile_owner = p
			consecutive_passes = 0
			no_progress = 0
		"draw":
			var q: int = mv["from"]
			var idx := rng.randi_range(0, hands[q].size() - 1)
			var c: int = hands[q].pop_at(idx)
			hands[p].append(c)
			if has("flow_discard_pairs"):
				_discard_pairs(p)
			no_progress = 0
		"pass", "forced_pass":
			if mv["type"] == "pass":
				passes[p] += 1
				if has("lose_on_pass_limit") and passes[p] > param("lose_on_pass_limit", "limit", 3):
					_eliminate(p)
			consecutive_passes += 1
			no_progress += 1
			if has("flow_clear_on_all_pass") and not pile.is_empty():
				var needed := _active_count() - (1 if _is_active(pile_owner) else 0)
				if consecutive_passes >= needed:
					discard.append_array(pile)
					pile = []
					consecutive_passes = 0
					no_progress = 0
					forced_next = pile_owner


func _eliminate(p: int) -> void:
	out[p] = "lost"
	for c in hands[p]:
		if layout_mode() and not is_joker(c):
			_add_to_layout(c)
		else:
			discard.append(c)
	hands[p] = []
	no_progress = 0


func _add_to_layout(c: int) -> void:
	var s := suit_of(c)
	if not layout.has(s):
		layout[s] = []
	layout[s].append(rank_of(c))
	layout_count += 1


func _discard_pairs(p: int) -> void:
	var by_rank := {}
	for c in hands[p]:
		if is_joker(c):
			continue
		var r := rank_of(c)
		if not by_rank.has(r):
			by_rank[r] = []
		by_rank[r].append(c)
	for r in by_rank:
		var g: Array = by_rank[r]
		var n := (g.size() / 2) * 2
		for i in n:
			hands[p].erase(g[i])
			discard.append(g[i])


func _conservation_ok() -> bool:
	var n := stock.size() + discard.size() + pile.size() + layout_count
	for h in hands:
		n += h.size()
	return n == total_cards
