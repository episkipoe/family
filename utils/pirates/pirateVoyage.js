import { rangesOverlap } from "../../public/utils/distance.js";
import { markActive } from "../activity.js";

export const PIRATE_DICE_COUNT = 5;
export const PIRATE_MAX_ROLLS = 3;
export const PIRATE_DIE_LABELS = Object.freeze({
	1: "Cargo",
	2: "Cargo",
	3: "Cargo",
	4: "Crew",
	5: "Captain",
	6: "Ship"
});

const voyagesByPlace = new Map();

function now() {
	return Date.now();
}

function rollDie(random = Math.random) {
	return Math.floor(random() * 6) + 1;
}

function createTurnState() {
	return {
		dice: [],
		rollsTaken: 0,
		rollsRemaining: PIRATE_MAX_ROLLS,
		locked: {
			ship: null,
			captain: null,
			crew: null
		},
		submitted: false
	};
}

function createRoundState(starterId, order) {
	const roundOrder = order.includes(starterId)
		? [starterId, ...order.filter(userId => userId !== starterId)]
		: [...order];
	return {
		starterId,
		order: roundOrder,
		currentIndex: 0,
		rollLimit: null
	};
}

function createPlayer(dave) {
	return {
		userId: dave.userId,
		name: dave.name || "Dave",
		booty: 0,
		turn: createTurnState(),
		history: []
	};
}

function updatePlayerName(player, dave) {
	if (dave?.name) {
		player.name = dave.name;
	}
}

function createVoyage(placeId, place, dave) {
	const voyage = {
		id: crypto.randomUUID(),
		placeId,
		placeName: place.name || "Unknown Waters",
		status: "active",
		startedBy: dave.userId,
		startedByName: dave.name || "Dave",
		createdAt: now(),
		updatedAt: now(),
		players: {},
		round: null,
		log: []
	};
	voyage.players[dave.userId] = createPlayer(dave);
	voyage.round = createRoundState(dave.userId, [dave.userId]);
	voyage.log.unshift(`${dave.name || "Dave"} launched Ship Captain Crew.`);
	voyagesByPlace.set(placeId, voyage);
	return voyage;
}

function getVoyage(placeId) {
	return voyagesByPlace.get(placeId) ?? null;
}

function getActiveVoyage(placeId) {
	const voyage = getVoyage(placeId);
	return voyage?.status === "active" ? voyage : null;
}

function getPlayers(voyage) {
	return Object.values(voyage.players);
}

function getPlayerOrder(voyage) {
	const orderedIds = voyage.round?.order ?? [];
	const knownIds = new Set(Object.keys(voyage.players));
	const ordered = orderedIds.filter(userId => knownIds.has(userId));
	const missing = Object.keys(voyage.players).filter(userId => !ordered.includes(userId));
	return [...ordered, ...missing];
}

function getCurrentPlayerId(voyage) {
	const order = getPlayerOrder(voyage);
	return order[voyage.round?.currentIndex ?? 0] ?? null;
}

function getEffectiveRollLimit(voyage) {
	return voyage.round?.rollLimit ?? PIRATE_MAX_ROLLS;
}

function getLockedIndexes(turn) {
	return Object.values(turn.locked).filter(Number.isInteger);
}

function isTurnComplete(turn) {
	return Number.isInteger(turn.locked.ship)
		&& Number.isInteger(turn.locked.captain)
		&& Number.isInteger(turn.locked.crew);
}

function getCargoDice(turn) {
	const lockedIndexes = new Set(getLockedIndexes(turn));
	return turn.dice.filter((_, index) => !lockedIndexes.has(index));
}

function getCargoScore(turn) {
	return isTurnComplete(turn)
		? getCargoDice(turn).reduce((score, value) => score + value, 0)
		: 0;
}

function applyShipCaptainCrewLocks(turn) {
	const locked = new Set(getLockedIndexes(turn));

	function lockRole(role, value) {
		if (Number.isInteger(turn.locked[role])) {
			return;
		}

		const index = turn.dice.findIndex((die, dieIndex) =>
			die === value && !locked.has(dieIndex)
		);
		if (index >= 0) {
			turn.locked[role] = index;
			locked.add(index);
		}
	}

	lockRole("ship", 6);
	if (Number.isInteger(turn.locked.ship)) {
		lockRole("captain", 5);
	}
	if (Number.isInteger(turn.locked.ship) && Number.isInteger(turn.locked.captain)) {
		lockRole("crew", 4);
	}
}

function rollUnlockedDice(turn, random = Math.random) {
	const lockedIndexes = new Set(getLockedIndexes(turn));
	turn.dice = Array.from({ length: PIRATE_DICE_COUNT }, (_, index) =>
		lockedIndexes.has(index) ? turn.dice[index] : rollDie(random)
	);
	applyShipCaptainCrewLocks(turn);
	turn.rollsTaken += 1;
	turn.rollsRemaining = Math.max(0, PIRATE_MAX_ROLLS - turn.rollsTaken);
}

function summarizeTurn(turn, rollLimit = PIRATE_MAX_ROLLS) {
	return {
		...turn,
		dice: [...turn.dice],
		rollsRemaining: Math.max(0, rollLimit - turn.rollsTaken),
		locked: { ...turn.locked },
		lockedIndexes: getLockedIndexes(turn),
		complete: isTurnComplete(turn),
		cargoDice: getCargoDice(turn),
		cargoScore: getCargoScore(turn)
	};
}

function getStandings(voyage) {
	return getPlayers(voyage)
		.map(player => ({
			userId: player.userId,
			name: player.name,
			booty: player.booty,
			turnComplete: isTurnComplete(player.turn),
			isCurrentTurn: player.userId === getCurrentPlayerId(voyage),
			isRoundStarter: player.userId === voyage.round?.starterId,
			lastRound: player.history[0] ?? null
		}))
		.sort((a, b) => getPlayerOrder(voyage).indexOf(a.userId) - getPlayerOrder(voyage).indexOf(b.userId));
}

export function summarizePirateVoyage(voyage, viewerId = null) {
	if (!voyage) {
		return { exists: false, active: false };
	}

	const player = viewerId ? voyage.players[viewerId] : null;
	return {
		exists: true,
		active: voyage.status === "active",
		id: voyage.id,
		placeId: voyage.placeId,
		placeName: voyage.placeName,
		status: voyage.status,
		currentPlayerId: getCurrentPlayerId(voyage),
		currentPlayerName: voyage.players[getCurrentPlayerId(voyage)]?.name ?? null,
		roundStarterId: voyage.round?.starterId ?? null,
		rollLimit: getEffectiveRollLimit(voyage),
		startedBy: voyage.startedBy ?? null,
		startedByName: voyage.startedByName ?? null,
		isStarter: viewerId != null && voyage.startedBy === viewerId,
		players: getStandings(voyage),
		you: player ? {
			userId: player.userId,
			name: player.name,
			booty: player.booty,
			turn: summarizeTurn(player.turn, getEffectiveRollLimit(voyage)),
			history: player.history.slice(0, 8)
		} : null,
		log: voyage.log.slice(0, 10)
	};
}

export function getPlaceVoyageSummary(placeId, viewerId = null) {
	return summarizePirateVoyage(getVoyage(placeId), viewerId);
}

export function joinPirateVoyage(placeId, place, dave) {
	const voyage = getActiveVoyage(placeId);
	if (!voyage) {
		return { ok: false, error: "No active voyage." };
	}

	if (!voyage.players[dave.userId]) {
		voyage.players[dave.userId] = createPlayer(dave);
		if (voyage.round) {
			voyage.round.order.push(dave.userId);
		}
		voyage.log.unshift(`${dave.name || "Dave"} joined Ship Captain Crew.`);
		voyage.updatedAt = now();
	} else {
		updatePlayerName(voyage.players[dave.userId], dave);
	}

	return { ok: true, voyage };
}

export function launchPirateVoyage(placeId, place, dave) {
	const existing = getActiveVoyage(placeId);
	if (existing) {
		const joined = joinPirateVoyage(placeId, place, dave);
		return { ok: true, voyage: joined.voyage, joinedExisting: true };
	}

	return { ok: true, voyage: createVoyage(placeId, place, dave), joinedExisting: false };
}

export function stopPirateVoyage(placeId, dave) {
	const voyage = getActiveVoyage(placeId);
	if (!voyage) {
		return { ok: false, error: "No active voyage." };
	}
	if (voyage.startedBy !== dave?.userId) {
		return { ok: false, error: "Only the voyage starter can stop it." };
	}

	voyagesByPlace.delete(placeId);
	return { ok: true };
}

function requireCurrentPlayer(voyage, userId) {
	const currentPlayerId = getCurrentPlayerId(voyage);
	if (currentPlayerId !== userId) {
		return {
			ok: false,
			error: currentPlayerId
				? `Waiting for ${voyage.players[currentPlayerId]?.name ?? "the current player"}.`
				: "No current player."
		};
	}
	return { ok: true };
}

function refreshRollsRemaining(voyage, turn) {
	turn.rollsRemaining = Math.max(0, getEffectiveRollLimit(voyage) - turn.rollsTaken);
}

function resetRound(voyage, starterId) {
	const order = getPlayerOrder(voyage);
	voyage.round = createRoundState(starterId, order);
	for (const player of getPlayers(voyage)) {
		player.turn = createTurnState();
	}
}

function advanceTurn(voyage) {
	const order = getPlayerOrder(voyage);
	const allSubmitted = order.every(userId => voyage.players[userId]?.turn.submitted);
	if (allSubmitted) {
		const roundResults = order
			.map(userId => voyage.players[userId])
			.map(player => ({
				userId: player.userId,
				name: player.name,
				score: player.history[0]?.score ?? 0
			}));
		const highScore = Math.max(...roundResults.map(player => player.score));
		const winners = roundResults.filter(player => player.score === highScore);
		const highest = winners[0] ? voyage.players[winners[0].userId] : null;
		const starterId = highest?.userId ?? voyage.startedBy;
		resetRound(voyage, starterId);
		voyage.log.unshift(`${voyage.players[starterId]?.name ?? "The high scorer"} starts the next round.`);
		return {
			type: "roundEnded",
			results: roundResults,
			winners,
			highScore,
			completedAt: now()
		};
	}

	let nextIndex = voyage.round.currentIndex + 1;
	while (nextIndex < order.length && voyage.players[order[nextIndex]]?.turn.submitted) {
		nextIndex += 1;
	}
	voyage.round.currentIndex = Math.min(nextIndex, order.length - 1);
	return null;
}

export function rollPirateDice(voyage, userId, random = Math.random) {
	const player = voyage?.players?.[userId];
	if (!player || voyage.status !== "active") {
		return { ok: false, error: "Voyage unavailable." };
	}
	const turnCheck = requireCurrentPlayer(voyage, userId);
	if (!turnCheck.ok) {
		return turnCheck;
	}
	const turn = player.turn;
	if (turn.submitted) {
		return { ok: false, error: "This turn has already scored." };
	}
	if (turn.rollsTaken >= getEffectiveRollLimit(voyage)) {
		return { ok: false, error: "No rolls remain." };
	}

	rollUnlockedDice(turn, random);
	refreshRollsRemaining(voyage, turn);
	voyage.updatedAt = now();
	return { ok: true };
}

export function submitPirateRound(voyage, userId) {
	const player = voyage?.players?.[userId];
	if (!player || voyage.status !== "active") {
		return { ok: false, error: "Voyage unavailable." };
	}
	const turnCheck = requireCurrentPlayer(voyage, userId);
	if (!turnCheck.ok) {
		return turnCheck;
	}
	const turn = player.turn;
	if (turn.dice.length !== PIRATE_DICE_COUNT) {
		return { ok: false, error: "Roll first." };
	}

	applyShipCaptainCrewLocks(turn);
	const complete = isTurnComplete(turn);
	const score = complete ? getCargoScore(turn) : 0;
	const summary = {
		dice: [...turn.dice],
		locked: { ...turn.locked },
		complete,
		cargoDice: getCargoDice(turn),
		score,
		rollsTaken: turn.rollsTaken,
		timestamp: now()
	};

	player.booty += score;
	player.history.unshift(summary);
	turn.submitted = true;
	refreshRollsRemaining(voyage, turn);
	if (voyage.round?.starterId === userId) {
		voyage.round.rollLimit = Math.max(1, turn.rollsTaken);
	}
	voyage.updatedAt = now();
	voyage.log.unshift(`${player.name} scored ${score} cargo.`);
	const transition = advanceTurn(voyage);
	return { ok: true, score, complete, transition };
}

function getSocketContext(socket, daves, savedPlaces, sourceId, placeId, callback) {
	if (sourceId !== socket.userId) {
		callback({ ok: false, error: "source mismatch" });
		return null;
	}

	const dave = daves[sourceId];
	const place = savedPlaces[placeId];
	if (!dave || !place) {
		callback({ ok: false, error: "Voyage context unavailable." });
		return null;
	}
	if (!rangesOverlap(dave, place)) {
		callback({ ok: false, error: "Gather at the node to sail." });
		return null;
	}

	return { dave, place };
}

function emitVoyageUpdate(io, placeId) {
	io.emit("pirateVoyageUpdated", { placeId });
	io.emit("update");
}

function emitRoundTransition(io, placeId, voyage, transition) {
	if (!transition) return;
	io.emit("pirateRoundEnded", {
		placeId,
		voyageId: voyage.id,
		...transition
	});
}

export function registerHandlers(socket, daves, savedPlaces, io, logEvent = () => {}, random = Math.random) {
	socket.on("pirateVoyageState", (sourceId, placeId, callback = () => {}) => {
		if (sourceId !== socket.userId) {
			callback({ ok: false, error: "source mismatch" });
			return;
		}
		callback({ ok: true, voyage: getPlaceVoyageSummary(placeId, sourceId) });
	});

	socket.on("launchPirateVoyage", (sourceId, placeId, callback = () => {}) => {
		const context = getSocketContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;

		const result = launchPirateVoyage(placeId, context.place, context.dave);
		markActive(context.dave);
		if (!result.joinedExisting) {
			logEvent(`${context.dave.name} launched Ship Captain Crew at ${context.place.name}.`, {
				userId: context.dave.userId,
				placeId
			});
		}
		emitVoyageUpdate(io, placeId);
		callback({ ok: true, voyage: summarizePirateVoyage(result.voyage, sourceId) });
	});

	socket.on("joinPirateVoyage", (sourceId, placeId, callback = () => {}) => {
		const context = getSocketContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;

		const result = joinPirateVoyage(placeId, context.place, context.dave);
		if (!result.ok) {
			callback(result);
			return;
		}

		markActive(context.dave);
		emitVoyageUpdate(io, placeId);
		callback({ ok: true, voyage: summarizePirateVoyage(result.voyage, sourceId) });
	});

	socket.on("stopPirateVoyage", (sourceId, placeId, callback = () => {}) => {
		const context = getSocketContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;

		const result = stopPirateVoyage(placeId, context.dave);
		if (!result.ok) {
			callback(result);
			return;
		}

		markActive(context.dave);
		logEvent(`${context.dave.name} stopped Ship Captain Crew at ${context.place.name}.`, {
			userId: context.dave.userId,
			placeId
		});
		emitVoyageUpdate(io, placeId);
		callback({ ok: true, voyage: getPlaceVoyageSummary(placeId, sourceId) });
	});

	socket.on("pirateRollDice", (sourceId, placeId, callback = () => {}) => {
		const context = getSocketContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;

		const voyage = getActiveVoyage(placeId);
		const result = rollPirateDice(voyage, sourceId, random);
		if (!result.ok) {
			callback(result);
			return;
		}

		markActive(context.dave);
		emitVoyageUpdate(io, placeId);
		callback({ ok: true, voyage: summarizePirateVoyage(voyage, sourceId) });
	});

	socket.on("pirateSubmitRound", (sourceId, placeId, callback = () => {}) => {
		const context = getSocketContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;

		const voyage = getActiveVoyage(placeId);
		const result = submitPirateRound(voyage, sourceId);
		if (!result.ok) {
			callback(result);
			return;
		}

		markActive(context.dave);
		emitRoundTransition(io, placeId, voyage, result.transition);
		emitVoyageUpdate(io, placeId);
		callback({ ok: true, ...result, voyage: getPlaceVoyageSummary(placeId, sourceId) });
	});
}

export function clearPirateVoyagesForTests() {
	voyagesByPlace.clear();
}
