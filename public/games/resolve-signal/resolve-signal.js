import { getUserId, getUserName } from "../utils/id.js";

const userId = getUserId();
const params = new URLSearchParams(window.location.search);
const placeId = params.get("placeId");
const socket = io({ auth: { userId, userName: getUserName() } });

const backLink = document.getElementById("backLink");
const placeName = document.getElementById("placeName");
const timer = document.getElementById("timer");
const readoutLabel = document.getElementById("readoutLabel");
const clue = document.getElementById("clue");
const status = document.getElementById("status");
const options = document.getElementById("options");
const startButton = document.getElementById("startButton");
const crew = document.getElementById("crew");
const rightCount = document.getElementById("rightCount");
const wrongCount = document.getElementById("wrongCount");

let round = null;
let loading = false;

backLink.href = "/games.html";

function formatTime(milliseconds) {
	const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderTimer() {
	if (!round?.exists) {
		timer.textContent = "2:00";
		timer.classList.remove("danger");
		return;
	}
	const remaining = round?.active ? Math.max(0, round.deadline - Date.now()) : 0;
	timer.textContent = round?.active ? formatTime(remaining) : "0:00";
	timer.classList.toggle("danger", round?.active && remaining <= 20_000);
	if (round?.active && remaining <= 0) loadState();
}

function setCrew(players = []) {
	crew.replaceChildren(...players.map(player => {
		const chip = document.createElement("span");
		chip.className = "signal-chip";
		chip.textContent = `${player.name}${player.userId === userId ? " (you)" : ""}`;
		return chip;
	}));
}

function setOptions(values = []) {
	options.replaceChildren(...values.map(value => {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = value;
		button.addEventListener("click", () => submitAnswer(value));
		return button;
	}));
	options.hidden = values.length === 0;
}

function render() {
	startButton.hidden = !!round?.active;
	setCrew(round?.participants);
	setOptions(round?.active && round.isGuesser ? round.options : []);
	placeName.textContent = round?.placeName || "Node signal channel";
	const stats = round?.stats ?? { right: 0, wrong: 0, untilFragment: 5 };
	rightCount.textContent = String(stats.right);
	wrongCount.textContent = String(stats.wrong);

	if (!round?.exists) {
		readoutLabel.textContent = "Channel clear";
		clue.textContent = "No active signal";
		status.textContent = "Start a round when everyone is gathered at the node.";
		timer.textContent = "2:00";
		return;
	}

	if (round.active) {
		if (!round.isParticipant) {
			readoutLabel.textContent = "Round in progress";
			clue.textContent = "Spectating";
			status.textContent = `This signal began with ${round.participantCount} players. Join the next one.`;
		} else {
			readoutLabel.textContent = round.isGuesser ? "Your clue · choose below" : "Your private clue";
			clue.textContent = round.clue;
			status.textContent = round.isGuesser
				? "Listen to the room, then choose once."
				: `Tell ${round.startedByName} your clue out loud. Only the starter sees the options.`;
		}
		renderTimer();
		return;
	}

	readoutLabel.textContent = round.status === "won" ? "Signal resolved" : round.status === "timeout" ? "Transmission lost" : "Signal missed";
	clue.textContent = round.solution;
	status.textContent = round.status === "won"
		? `${round.startedByName} selected the right answer.}`
		: round.status === "timeout"
			? `${round.startedByName} ran out of time.`
			: `${round.startedByName} selected ${round.selectedAnswer}.`;
	renderTimer();
}

function loadState() {
	if (!placeId || loading) return;
	loading = true;
	socket.emit("resolveSignalState", userId, placeId, result => {
		loading = false;
		if (!result?.ok) {
			status.textContent = result?.error || "Unable to tune this signal.";
			return;
		}
		round = result.round;
		render();
	});
}

function startRound() {
	startButton.disabled = true;
	status.textContent = "Opening a new channel...";
	socket.emit("startResolveSignal", userId, placeId, result => {
		startButton.disabled = false;
		if (!result?.ok) {
			status.textContent = result?.error || "Unable to start the signal.";
			return;
		}
		round = result.round;
		render();
	});
}

function submitAnswer(answer) {
	for (const button of options.querySelectorAll("button")) button.disabled = true;
	status.textContent = `Locking in ${answer}...`;
	socket.emit("submitResolveSignal", userId, placeId, answer, result => {
		if (!result?.ok) {
			status.textContent = result?.error || "The answer could not be submitted.";
			for (const button of options.querySelectorAll("button")) button.disabled = false;
			return;
		}
		round = result.round;
		render();
	});
}

startButton.addEventListener("click", startRound);
socket.on("resolveSignalUpdated", payload => {
	if (payload?.placeId === placeId) loadState();
});
socket.on("connect", loadState);

setInterval(renderTimer, 250);
setInterval(loadState, 3000);

if (!placeId) {
	clue.textContent = "Missing node";
	status.textContent = "Return to games to open Resolve the Signal.";
}
