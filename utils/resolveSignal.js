import { SIGNAL_CATALOG } from "../signalCatalog.js";
import { rangesOverlap } from "../public/utils/distance.js";
import { recordFragmentCollected } from "../public/utils/id.js";
import { isActiveDave } from "./activeDaves.js";
import { markActive } from "./activity.js";

export const SIGNAL_ROUND_MS = 2 * 60 * 1000;
export const SIGNAL_OPTION_COUNT = 10;

const roundsByPlace = new Map();
const statsByPlace = new Map();

function getStats(placeId) {
	if (!statsByPlace.has(placeId)) {
		statsByPlace.set(placeId, { right: 0, wrong: 0 });
	}
	return statsByPlace.get(placeId);
}

function recordOutcome(round) {
	if (!round || round.outcomeRecorded || round.status === "active") return false;
	const stats = getStats(round.placeId);
	if (round.status === "won") {
		stats.right += 1;
		round.fragmentRewardEarned = stats.right % 5 === 0;
	} else {
		stats.wrong += 1;
	}
	round.outcomeRecorded = true;
	return true;
}

function shuffle(values, random = Math.random) {
	const result = [...values];
	for (let index = result.length - 1; index > 0; index -= 1) {
		const target = Math.floor(random() * (index + 1));
		[result[index], result[target]] = [result[target], result[index]];
	}
	return result;
}

function refreshRound(round, currentTime = Date.now()) {
	if (round?.status === "active" && currentTime >= round.deadline) {
		round.status = "timeout";
		round.completedAt = currentTime;
		recordOutcome(round);
	}
	return round;
}

function pickEntry(random) {
	return SIGNAL_CATALOG[Math.floor(random() * SIGNAL_CATALOG.length)] ?? SIGNAL_CATALOG[0];
}

function getLetterCount(answer) {
	return answer.replace(/[^a-z]/gi, "").length;
}

function buildOptions(solutionEntry, random, constraints = {}) {
	const selected = [solutionEntry];
	const addMatches = (predicate, targetCount) => {
		const currentCount = selected.filter(predicate).length;
		const needed = Math.max(0, targetCount - currentCount);
		const candidates = shuffle(
			SIGNAL_CATALOG.filter(entry => !selected.includes(entry) && predicate(entry)),
			random
		);
		selected.push(...candidates.slice(0, needed));
	};

	// Category choices are always clustered so even the broad clue cannot solve a round alone.
	addMatches(entry => entry.category === solutionEntry.category, 3);
	if (constraints.requiredInitial) {
		addMatches(entry => entry.answer[0]?.toUpperCase() === constraints.requiredInitial, Math.ceil(SIGNAL_OPTION_COUNT / 2));
	}
	if (Number.isInteger(constraints.requiredLength)) {
		addMatches(entry => getLetterCount(entry.answer) === constraints.requiredLength, Math.ceil(SIGNAL_OPTION_COUNT * 0.25));
	}
	const remaining = shuffle(SIGNAL_CATALOG.filter(entry => !selected.includes(entry)), random)
		.slice(0, SIGNAL_OPTION_COUNT - selected.length);
	return shuffle([...selected, ...remaining].map(entry => entry.answer), random);
}

function assignClues(entry, participants, random) {
	const initial = entry.answer[0]?.toUpperCase();
	const letterCount = getLetterCount(entry.answer);
	const initialClue = `starts with ${initial}`;
	const lengthClue = entry.clues.find(clue => clue.startsWith(`${letterCount} letters`));
	const sameInitialCount = SIGNAL_CATALOG.filter(candidate => candidate.answer[0]?.toUpperCase() === initial).length;
	const sameLengthCount = SIGNAL_CATALOG.filter(candidate => getLetterCount(candidate.answer) === letterCount).length;
	const availableClues = entry.clues.filter(clue =>
		(clue !== initialClue || sameInitialCount >= Math.ceil(SIGNAL_OPTION_COUNT / 2))
		&& (clue !== lengthClue || sameLengthCount >= Math.ceil(SIGNAL_OPTION_COUNT * 0.25))
	);
	const clues = shuffle(availableClues, random);
	const assignments = Object.fromEntries(participants.map((player, index) => [
		player.userId,
		clues[index % clues.length]
	]));
	return {
		assignments,
		requiredInitial: Object.values(assignments).includes(initialClue) ? initial : null,
		requiredLength: Object.values(assignments).includes(lengthClue) ? letterCount : null
	};
}

export function getPlayersAtPlace(daves, place, currentTime = Date.now()) {
	return Object.values(daves)
		.filter(dave => dave && !dave.isBot && dave.visible !== false)
		.filter(dave => isActiveDave(dave, currentTime) && rangesOverlap(dave, place))
		.map(dave => ({ userId: dave.userId, name: dave.name || "Dave" }));
}

export function startSignalRound(placeId, place, starter, participants, options = {}) {
	const currentTime = options.now ?? Date.now();
	const random = options.random ?? Math.random;
	const existing = refreshRound(roundsByPlace.get(placeId), currentTime);
	if (existing?.status === "active") {
		return { ok: false, error: "A signal is already being resolved." };
	}

	const uniqueParticipants = [...new Map(participants.map(player => [player.userId, player])).values()];
	if (!uniqueParticipants.some(player => player.userId === starter.userId)) {
		uniqueParticipants.unshift({ userId: starter.userId, name: starter.name || "Dave" });
	}
	const entry = pickEntry(random);
	const clueAssignment = assignClues(entry, uniqueParticipants, random);
	const round = {
		id: crypto.randomUUID(),
		placeId,
		placeName: place.name || "Unknown node",
		status: "active",
		startedBy: starter.userId,
		startedByName: starter.name || "Dave",
		startedAt: currentTime,
		deadline: currentTime + SIGNAL_ROUND_MS,
		participants: uniqueParticipants,
		clues: clueAssignment.assignments,
		options: buildOptions(entry, random, clueAssignment),
		solution: entry.answer,
		selectedAnswer: null,
		completedAt: null,
		outcomeRecorded: false,
		fragmentRewardEarned: false,
		fragmentRewardGranted: false
	};
	roundsByPlace.set(placeId, round);
	return { ok: true, round };
}

export function submitSignalAnswer(placeId, userId, answer, currentTime = Date.now()) {
	const round = refreshRound(roundsByPlace.get(placeId), currentTime);
	if (!round) return { ok: false, error: "No signal round exists." };
	if (round.status !== "active") return { ok: false, error: "This signal round is over." };
	if (round.startedBy !== userId) return { ok: false, error: "Only the signal starter can answer." };
	if (!round.options.includes(answer)) return { ok: false, error: "Choose one of the provided options." };

	round.selectedAnswer = answer;
	round.completedAt = currentTime;
	round.status = answer === round.solution ? "won" : "missed";
	recordOutcome(round);
	return { ok: true, correct: round.status === "won", round };
}

export function awardSignalFragments(round, daves) {
	if (!round?.fragmentRewardEarned || round.fragmentRewardGranted) return [];
	const awarded = [];
	for (const participant of round.participants) {
		const dave = daves[participant.userId];
		if (!dave || dave.isBot) continue;
		if (!Array.isArray(dave.fragmentsCollected)) dave.fragmentsCollected = [];
		dave.fragmentsCollected.push(crypto.randomUUID());
		recordFragmentCollected(dave);
		markActive(dave);
		awarded.push({ userId: dave.userId, name: dave.name || participant.name || "Dave" });
	}
	round.fragmentRewardGranted = true;
	return awarded;
}

export function summarizeSignalRound(placeId, viewerId, currentTime = Date.now()) {
	const round = refreshRound(roundsByPlace.get(placeId), currentTime);
	const stats = getStats(placeId);
	const statsSummary = {
		right: stats.right,
		wrong: stats.wrong,
		untilFragment: stats.right % 5 === 0 ? 5 : 5 - (stats.right % 5)
	};
	if (!round) return { exists: false, active: false, stats: statsSummary };
	const participant = round.participants.find(player => player.userId === viewerId);
	const active = round.status === "active";
	const isGuesser = round.startedBy === viewerId;
	return {
		exists: true,
		active,
		id: round.id,
		placeId: round.placeId,
		placeName: round.placeName,
		status: round.status,
		startedBy: round.startedBy,
		startedByName: round.startedByName,
		startedAt: round.startedAt,
		deadline: round.deadline,
		remainingMs: active ? Math.max(0, round.deadline - currentTime) : 0,
		participantCount: round.participants.length,
		participants: round.participants.map(player => ({ ...player })),
		isParticipant: !!participant,
		isGuesser,
		clue: participant ? round.clues[viewerId] : null,
		options: active && isGuesser ? [...round.options] : [],
		solution: active ? null : round.solution,
		selectedAnswer: active ? null : round.selectedAnswer,
		stats: statsSummary,
		fragmentRewardEarned: !active && round.fragmentRewardEarned
	};
}

function getContext(socket, daves, savedPlaces, sourceId, placeId, callback, requireRange = false) {
	if (sourceId !== socket.userId) {
		callback({ ok: false, error: "source mismatch" });
		return null;
	}
	const dave = daves[sourceId];
	const place = savedPlaces[placeId];
	if (!dave || !place) {
		callback({ ok: false, error: "Signal context unavailable." });
		return null;
	}
	if (requireRange && !rangesOverlap(dave, place)) {
		callback({ ok: false, error: "Gather at the node to resolve its signal." });
		return null;
	}
	return { dave, place };
}

function emitUpdate(io, placeId) {
	io.emit("resolveSignalUpdated", { placeId });
	io.emit("update");
}

export function registerHandlers(socket, daves, savedPlaces, io, logEvent = () => {}, options = {}) {
	const random = options.random ?? Math.random;
	const getNow = options.now ?? Date.now;

	socket.on("resolveSignalState", (sourceId, placeId, callback = () => {}) => {
		const context = getContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;
		callback({ ok: true, round: summarizeSignalRound(placeId, sourceId, getNow()) });
	});

	socket.on("startResolveSignal", (sourceId, placeId, callback = () => {}) => {
		const context = getContext(socket, daves, savedPlaces, sourceId, placeId, callback, true);
		if (!context) return;
		const currentTime = getNow();
		const participants = getPlayersAtPlace(daves, context.place, currentTime);
		const result = startSignalRound(placeId, context.place, context.dave, participants, { now: currentTime, random });
		if (!result.ok) {
			callback(result);
			return;
		}
		for (const participant of result.round.participants) {
			if (daves[participant.userId]) markActive(daves[participant.userId]);
		}
		logEvent(`${context.dave.name || "Dave"} opened Resolve the Signal at ${context.place.name}.`, {
			userId: sourceId,
			placeId
		});
		emitUpdate(io, placeId);
		callback({ ok: true, round: summarizeSignalRound(placeId, sourceId, currentTime) });

		const timer = setTimeout(() => {
			const summary = summarizeSignalRound(placeId, sourceId, result.round.deadline);
			if (summary.status === "timeout") emitUpdate(io, placeId);
		}, SIGNAL_ROUND_MS + 25);
		timer.unref?.();
	});

	socket.on("submitResolveSignal", (sourceId, placeId, answer, callback = () => {}) => {
		const context = getContext(socket, daves, savedPlaces, sourceId, placeId, callback);
		if (!context) return;
		const result = submitSignalAnswer(placeId, sourceId, answer, getNow());
		if (!result.ok) {
			callback(result);
			return;
		}
		markActive(context.dave);
		const awarded = awardSignalFragments(result.round, daves);
		logEvent(result.correct
			? `${context.dave.name || "Dave"} resolved the signal: ${result.round.solution}.`
			: `${context.dave.name || "Dave"} missed the signal. It was ${result.round.solution}.`, {
			userId: sourceId,
			placeId
		});
		if (awarded.length > 0) {
			logEvent(`Resolve the Signal reached 5 correct answers. ${awarded.map(player => player.name).join(", ")} each received a fragment.`, {
				userId: sourceId,
				placeId
			});
		}
		emitUpdate(io, placeId);
		callback({ ok: true, correct: result.correct, fragmentsAwarded: awarded.length, round: summarizeSignalRound(placeId, sourceId, getNow()) });
	});
}

export function clearSignalRoundsForTests() {
	roundsByPlace.clear();
	statsByPlace.clear();
}
