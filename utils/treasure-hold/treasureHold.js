import { rangesOverlap } from "../../public/utils/distance.js";
import { markActive } from "../activity.js";

export const TREASURE_HOLD_DICE_COUNT = 6;
export const TREASURE_HOLD_MAX_PLAYERS = 8;
export const TREASURE_HOLD_MAX_DANGER = 6;
export const TREASURE_HOLD_VOYAGES = 5;
export const TREASURE_HOLD_FACES = Object.freeze([
	"treasure",
	"treasure",
	"map",
	"crew",
	"storm",
	"skull"
]);

const gamesById = new Map();
const gameIdsByPlace = new Map();

function now() {
	return Date.now();
}

function createPlayer(dave) {
	return {
		userId: dave.userId,
		name: dave.name || "Dave",
		score: 0,
		currentLoot: 0,
		maps: 0,
		danger: 0,
		active: true,
		dice: [],
		awaitingChoice: false,
		outcome: null
	};
}

function getPlayerOrder(game) {
	const orderedIds = game.turnOrder ?? [];
	const knownIds = new Set(Object.keys(game.players));
	const ordered = orderedIds.filter(userId => knownIds.has(userId));
	const missing = Object.keys(game.players).filter(userId => !ordered.includes(userId));
	return [...ordered, ...missing];
}

function getCurrentPlayerId(game) {
	const order = getPlayerOrder(game);
	return order[game.currentTurnIndex ?? 0] ?? null;
}

function getCurrentPlayerName(game) {
	const currentPlayerId = getCurrentPlayerId(game);
	return currentPlayerId ? game.players[currentPlayerId]?.name ?? null : null;
}

function advanceTurn(game) {
	if (Object.values(game.players).every(player => !player.active)) {
		return;
	}

	const order = getPlayerOrder(game);
	if (!order.length) return;
	const startIndex = Math.max(0, game.currentTurnIndex ?? 0);
	for (let offset = 1; offset <= order.length; offset += 1) {
		const index = (startIndex + offset) % order.length;
		if (game.players[order[index]]?.active) {
			game.currentTurnIndex = index;
			return;
		}
	}
}

function activeGameAtPlace(placeId) {
	const gameId = gameIdsByPlace.get(placeId);
	const game = gameId ? gamesById.get(gameId) : null;
	return game?.state !== "finished" ? game : null;
}

function standings(game) {
	return Object.values(game.players)
		.map(player => ({
			userId: player.userId,
			name: player.name,
			score: player.score,
			currentLoot: player.currentLoot,
			active: player.active,
			outcome: player.outcome,
			isCurrentTurn: player.userId === getCurrentPlayerId(game)
		}))
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function cloneGame(game) {
	if (!game) return null;
	return {
		...game,
		players: Object.fromEntries(Object.entries(game.players).map(([id, player]) => [
			id,
			{ ...player, dice: [...player.dice] }
		])),
		turnOrder: getPlayerOrder(game),
		currentPlayerId: getCurrentPlayerId(game),
		currentPlayerName: getCurrentPlayerName(game),
		standings: standings(game),
		log: game.log.slice(0, 12)
	};
}

export function getTreasureHold(gameId) {
	return gamesById.get(gameId) ?? null;
}

export function getTreasureHoldAtPlace(placeId) {
	const gameId = gameIdsByPlace.get(placeId);
	return gameId ? cloneGame(gamesById.get(gameId)) : null;
}

export function createTreasureHold(placeId, place, dave) {
	const existing = activeGameAtPlace(placeId);
	if (existing) {
		return { ok: true, game: existing, existing: true };
	}

	const game = {
		id: crypto.randomUUID(),
		placeId,
		placeName: place.name || "Unknown Waters",
		round: 1,
		state: "rolling",
		started: false,
		createdBy: dave.userId,
		createdAt: now(),
		updatedAt: now(),
		players: {},
		turnOrder: [],
		currentTurnIndex: 0,
		log: []
	};
	game.players[dave.userId] = createPlayer(dave);
	game.turnOrder.push(dave.userId);
	game.log.unshift(`${dave.name || "Dave"} opened the Treasure Hold.`);
	gamesById.set(game.id, game);
	gameIdsByPlace.set(placeId, game.id);
	return { ok: true, game, existing: false };
}

export function joinTreasureHold(gameId, dave) {
	const game = getTreasureHold(gameId);
	if (!game || game.state === "finished") {
		return { ok: false, error: "Treasure Hold is unavailable." };
	}
	if (game.players[dave.userId]) {
		game.players[dave.userId].name = dave.name || game.players[dave.userId].name;
		return { ok: true, game };
	}
	if (game.started) {
		return { ok: false, error: "This crew has already set sail." };
	}
	if (Object.keys(game.players).length >= TREASURE_HOLD_MAX_PLAYERS) {
		return { ok: false, error: "The crew is full (8 players maximum)." };
	}

	game.players[dave.userId] = createPlayer(dave);
	game.turnOrder = getPlayerOrder(game);
	game.updatedAt = now();
	game.log.unshift(`${dave.name || "Dave"} joined the crew.`);
	return { ok: true, game };
}

function rollFaces(random = Math.random) {
	return Array.from({ length: TREASURE_HOLD_DICE_COUNT }, () => {
		const index = Math.min(TREASURE_HOLD_FACES.length - 1, Math.floor(random() * TREASURE_HOLD_FACES.length));
		return TREASURE_HOLD_FACES[Math.max(0, index)];
	});
}

function countsFor(dice) {
	return dice.reduce((counts, face) => {
		counts[face] = (counts[face] || 0) + 1;
		return counts;
	}, {});
}

function requireRoll(game, playerId, mustBeDecision = false) {
	const player = game?.players?.[playerId];
	if (!game || game.state === "finished" || !player) {
		return { ok: false, error: "Treasure Hold is unavailable." };
	}
	if (!player.active) {
		return { ok: false, error: "Wait for the next voyage." };
	}
	if (getCurrentPlayerId(game) !== playerId) {
		return { ok: false, error: `Waiting for ${getCurrentPlayerName(game) || "the current sailor"}.` };
	}
	if (mustBeDecision && !player.awaitingChoice) {
		return { ok: false, error: "Roll before choosing to sail on." };
	}
	if (!mustBeDecision && player.awaitingChoice) {
		return { ok: false, error: "Choose Sail On or Return To Port." };
	}
	if (!game.started && Object.keys(game.players).length < 2) {
		return { ok: false, error: "Treasure Hold needs at least 2 players." };
	}
	return { ok: true, player };
}

function rollForPlayer(game, player, random) {
	game.started = true;
	player.dice = rollFaces(random);
	const counts = countsFor(player.dice);
	const treasureCount = counts.treasure || 0;
	const mapCount = counts.map || 0;
	const crewCount = counts.crew || 0;
	const stormCount = counts.storm || 0;
	const skullCount = counts.skull || 0;
	const dangerThisRoll = Math.max(0, skullCount + stormCount - crewCount);
	const krakenDefeated = player.dice.every(face => face === "treasure" || face === "crew");

	player.currentLoot += treasureCount;
	player.maps += mapCount;
	let mapBonuses = 0;
	while (player.maps >= 3) {
		player.maps -= 3;
		player.currentLoot += 5;
		mapBonuses += 1;
	}
	if (krakenDefeated) {
		player.currentLoot += 10;
	}
	player.danger += dangerThisRoll;
	player.awaitingChoice = player.danger < TREASURE_HOLD_MAX_DANGER;
	game.updatedAt = now();

	return {
		gameId: game.id,
		playerId: player.userId,
		dice: [...player.dice],
		counts,
		dangerThisRoll,
		mapBonuses,
		krakenDefeated,
		busted: player.danger >= TREASURE_HOLD_MAX_DANGER
	};
}

function finishPlayerBust(game, player) {
	player.currentLoot = 0;
	player.active = false;
	player.awaitingChoice = false;
	player.outcome = "busted";
	game.log.unshift(`${player.name} was lost at sea.`);
	const transition = advanceVoyageIfReady(game);
	if (!transition) advanceTurn(game);
	return transition;
}

export function rollTreasureHold(game, playerId, random = Math.random) {
	const check = requireRoll(game, playerId, false);
	if (!check.ok) return check;
	const roll = rollForPlayer(game, check.player, random);
	const transition = roll.busted ? finishPlayerBust(game, check.player) : null;
	return { ok: true, roll, transition };
}

export function sailOn(game, playerId, random = Math.random) {
	const check = requireRoll(game, playerId, true);
	if (!check.ok) return check;
	check.player.awaitingChoice = false;
	const roll = rollForPlayer(game, check.player, random);
	const transition = roll.busted ? finishPlayerBust(game, check.player) : null;
	return { ok: true, roll, transition };
}

export function returnToPort(game, playerId) {
	const player = game?.players?.[playerId];
	if (!game || game.state === "finished" || !player?.active) {
		return { ok: false, error: "Treasure Hold is unavailable." };
	}
	if (getCurrentPlayerId(game) !== playerId) {
		return { ok: false, error: `Waiting for ${getCurrentPlayerName(game) || "the current sailor"}.` };
	}
	if (!player.awaitingChoice) {
		return { ok: false, error: "Roll before returning to port." };
	}

	const banked = player.currentLoot;
	player.score += banked;
	player.currentLoot = 0;
	player.active = false;
	player.awaitingChoice = false;
	player.outcome = "banked";
	game.updatedAt = now();
	game.log.unshift(`${player.name} returned to port with ${banked} booty.`);
	const transition = advanceVoyageIfReady(game);
	if (!transition) advanceTurn(game);
	return { ok: true, banked, transition };
}

function resetPlayerForVoyage(player) {
	player.currentLoot = 0;
	player.maps = 0;
	player.danger = 0;
	player.active = true;
	player.dice = [];
	player.awaitingChoice = false;
	player.outcome = null;
}

function advanceVoyageIfReady(game) {
	if (Object.values(game.players).some(player => player.active)) {
		return null;
	}

	const completedRound = game.round;
	const results = standings(game);
	game.round += 1;
	if (game.round > TREASURE_HOLD_VOYAGES) {
		game.state = "finished";
		game.updatedAt = now();
		const highScore = results[0]?.score ?? 0;
		const winners = results.filter(player => player.score === highScore);
		game.log.unshift(`${winners.map(player => player.name).join(" & ")} claimed the Treasure Hold.`);
		return { type: "finished", completedRound, results, winners };
	}

	for (const player of Object.values(game.players)) {
		resetPlayerForVoyage(player);
	}
	game.currentTurnIndex = 0;
	game.updatedAt = now();
	game.log.unshift(`Voyage ${game.round} begins.`);
	return { type: "voyageEnded", completedRound, results };
}

function socketContext(socket, daves, savedPlaces, sourceId, placeId, callback) {
	if (sourceId !== socket.userId) {
		callback({ ok: false, error: "source mismatch" });
		return null;
	}
	const dave = daves[sourceId];
	const place = savedPlaces[placeId];
	if (!dave || !place || !rangesOverlap(dave, place)) {
		callback({ ok: false, error: "Gather at the node to enter Treasure Hold." });
		return null;
	}
	return { dave, place };
}

function gameContext(socket, daves, savedPlaces, sourceId, gameId, callback) {
	const game = getTreasureHold(gameId);
	if (!game) {
		callback({ ok: false, error: "Treasure Hold is unavailable." });
		return null;
	}
	const context = socketContext(socket, daves, savedPlaces, sourceId, game.placeId, callback);
	return context ? { ...context, game } : null;
}

function emitUpdate(io, game) {
	io.emit("treasureHoldUpdated", cloneGame(game));
	io.emit("update");
}

function emitTransition(io, game, transition) {
	if (!transition) return;
	if (transition.type === "finished") {
		io.emit("treasureHoldFinished", { gameId: game.id, ...transition });
	} else {
		io.emit("voyageEnded", { gameId: game.id, round: game.round, ...transition });
	}
}

export function registerHandlers(socket, daves, savedPlaces, io, logEvent = () => {}, random = Math.random) {
	socket.on("treasureHoldState", (sourceId, placeId, callback = () => {}) => {
		const context = socketContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;
		callback({ ok: true, game: getTreasureHoldAtPlace(placeId) });
	});

	socket.on("createTreasureHold", (sourceId, placeId, callback = () => {}) => {
		const context = socketContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;
		const result = createTreasureHold(placeId, context.place, context.dave);
		if (result.existing) {
			const joined = joinTreasureHold(result.game.id, context.dave);
			if (!joined.ok) return callback(joined);
		}
		markActive(context.dave);
		if (!result.existing) logEvent(`${context.dave.name} opened Treasure Hold at ${context.place.name}.`, { userId: sourceId, placeId });
		emitUpdate(io, result.game);
		callback({ ok: true, game: cloneGame(result.game) });
	});

	socket.on("joinTreasureHold", (sourceId, gameId, callback = () => {}) => {
		const context = gameContext(socket, daves, savedPlaces, sourceId, gameId, callback);
		if (!context) return;
		const result = joinTreasureHold(gameId, context.dave);
		if (!result.ok) return callback(result);
		markActive(context.dave);
		emitUpdate(io, result.game);
		callback({ ok: true, game: cloneGame(result.game) });
	});

	function handleRoll(event, action) {
		socket.on(event, (sourceId, gameId, callback = () => {}) => {
			const context = gameContext(socket, daves, savedPlaces, sourceId, gameId, callback);
			if (!context) return;
			const result = action(context.game, sourceId, random);
			if (!result.ok) return callback(result);
			markActive(context.dave);
			socket.emit("diceRolled", result.roll);
			if (result.roll.busted) socket.emit("playerBusted", sourceId);
			emitTransition(io, context.game, result.transition);
			emitUpdate(io, context.game);
			callback({ ok: true, roll: result.roll, game: cloneGame(context.game) });
		});
	}

	handleRoll("rollTreasureHold", rollTreasureHold);
	handleRoll("sailOn", sailOn);

	socket.on("returnToPort", (sourceId, gameId, callback = () => {}) => {
		const context = gameContext(socket, daves, savedPlaces, sourceId, gameId, callback);
		if (!context) return;
		const result = returnToPort(context.game, sourceId);
		if (!result.ok) return callback(result);
		markActive(context.dave);
		emitTransition(io, context.game, result.transition);
		emitUpdate(io, context.game);
		callback({ ok: true, banked: result.banked, game: cloneGame(context.game) });
	});
}

export function clearTreasureHoldsForTests() {
	gamesById.clear();
	gameIdsByPlace.clear();
}
