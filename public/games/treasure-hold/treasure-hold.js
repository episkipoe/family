import { getUserId, getUserName } from "../utils/id.js";

const userId = getUserId();
const params = new URLSearchParams(window.location.search);
const placeId = params.get("placeId");
const mode = params.get("mode") || "join";
const socket = io({ auth: { userId, userName: getUserName() } });

const faceDetails = {
	treasure: { symbol: "💰", label: "Treasure" },
	map: { symbol: "🗺️", label: "Map" },
	crew: { symbol: "👥", label: "Crew" },
	storm: { symbol: "⛈️", label: "Storm" },
	skull: { symbol: "💀", label: "Skull" }
};

const elements = Object.fromEntries([
	"backLink", "roundValue", "placeLabel", "notice", "krakenBanner", "scoreValue",
	"lootValue", "mapsValue", "dangerValue", "rollSummary", "diceRow", "rollButton",
	"sailButton", "portButton", "crewCount", "leaderboard"
].map(id => [id, document.getElementById(id)]));

let game = null;
let krakenTimer = null;
let lastResultKey = "";

elements.backLink.href = "/games.html";

function emit(event, ...args) {
	return new Promise(resolve => socket.emit(event, userId, ...args, resolve));
}

function setNotice(message, error = false) {
	elements.notice.textContent = message;
	elements.notice.classList.toggle("error", error);
}

function showKraken() {
	clearTimeout(krakenTimer);
	elements.krakenBanner.hidden = false;
	krakenTimer = setTimeout(() => { elements.krakenBanner.hidden = true; }, 4000);
}

function ensureResultModal() {
	let modal = document.getElementById("resultModal");
	if (modal) return modal;
	modal = document.createElement("div");
	modal.id = "resultModal";
	modal.className = "result-modal";
	modal.hidden = true;
	modal.innerHTML = `
		<div class="result-card" role="dialog" aria-modal="true" aria-labelledby="resultTitle">
			<div id="resultFace" class="result-face" aria-hidden="true"></div>
			<div class="result-fireworks" aria-hidden="true"></div>
			<h2 id="resultTitle"></h2>
			<p id="resultMessage"></p>
			<button id="resultClose" class="result-close" type="button">Close</button>
		</div>
	`;
	document.body.append(modal);
	modal.querySelector("#resultClose").addEventListener("click", () => { modal.hidden = true; });
	return modal;
}

function showResultWindow(result, label = "Voyage") {
	const results = result?.results ?? [];
	const highScore = results.length ? Math.max(...results.map(player => player.score)) : (result?.winners?.[0]?.score ?? 0);
	const winners = result?.winners?.length
		? result.winners
		: results.filter(player => player.score === highScore);
	const key = `${result?.gameId ?? game?.id}:${result?.type ?? "result"}:${result?.completedRound ?? ""}`;
	if (!winners.length || key === lastResultKey) return;
	lastResultKey = key;

	const modal = ensureResultModal();
	const card = modal.querySelector(".result-card");
	const face = modal.querySelector("#resultFace");
	const title = modal.querySelector("#resultTitle");
	const message = modal.querySelector("#resultMessage");
	const isWinner = winners.some(player => player.userId === userId);
	const winnerNames = winners.map(player => player.name).join(" & ");

	card.classList.toggle("winner", isWinner);
	face.innerHTML = isWinner ? "&#128515;" : "&#9785;";
	title.textContent = isWinner ? `${label} victory!` : `${label} complete`;
	message.textContent = isWinner
		? `Fireworks for you. You won with ${highScore} booty.`
		: `${winnerNames} won with ${highScore} booty.`;
	modal.hidden = false;
}

function updateResult(result) {
	if (!result?.ok) {
		setNotice(result?.error || "The tide turned against us.", true);
		return false;
	}
	game = result.game;
	if (result.roll?.krakenDefeated) showKraken();
	render();
	return true;
}

async function enterGame() {
	if (!placeId) {
		setNotice("No port was selected.", true);
		render();
		return;
	}

	const state = await emit("treasureHoldState", placeId);
	if (!state?.ok) {
		setNotice(state?.error || "Treasure Hold is unavailable.", true);
		return;
	}
	game = state.game;

	if (!game || game.state === "finished") {
		if (mode === "create") {
			updateResult(await emit("createTreasureHold", placeId));
		} else {
			render();
		}
		return;
	}

	if (!game.players?.[userId]) {
		updateResult(await emit("joinTreasureHold", game.id));
		return;
	}
	render();
}

function renderDice(player) {
	const dice = player?.dice ?? [];
	elements.diceRow.innerHTML = Array.from({ length: 6 }, (_, index) => {
		const face = dice[index];
		const detail = faceDetails[face];
		if (!detail) {
			return `<div class="hold-die empty"><span class="die-symbol">?</span><span class="die-name">Die ${index + 1}</span></div>`;
		}
		return `<div class="hold-die rolling" title="${detail.label}"><span class="die-symbol">${detail.symbol}</span><span class="die-name">${detail.label}</span></div>`;
	}).join("");

	if (!dice.length) {
		elements.rollSummary.textContent = "Ready to roll";
		return;
	}
	const counts = dice.reduce((totals, face) => ({ ...totals, [face]: (totals[face] || 0) + 1 }), {});
	const parts = Object.entries(counts).map(([face, count]) => `${count} ${face}`);
	elements.rollSummary.textContent = parts.join(" · ");
}

function playerState(player) {
	if (game.state === "finished") return "Voyages complete";
	if (player.active && player.awaitingChoice) return `${player.currentLoot} loot at risk`;
	if (player.active) return "Preparing to roll";
	if (player.outcome === "busted") return "Lost at sea";
	return "Safe in port";
}

function renderLeaderboard() {
	const players = game?.standings ?? [];
	elements.crewCount.textContent = `${players.length} / 8 sailors`;
	elements.leaderboard.innerHTML = players.length ? players.map((player, index) => `
		<div class="leader-row">
			<span class="leader-rank">${String(index + 1).padStart(2, "0")}</span>
			<div>
				<div class="leader-name">${escapeHtml(player.name)}${player.userId === userId ? " · you" : ""}</div>
				<div class="leader-state">${playerState(player)}</div>
			</div>
			<strong class="leader-score">${player.score}</strong>
		</div>
	`).join("") : `<div class="leader-row"><span class="leader-state">No crew aboard yet.</span></div>`;
}

function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function renderActions(player) {
	elements.rollButton.hidden = true;
	elements.sailButton.hidden = true;
	elements.portButton.hidden = true;

	if (!game) {
		elements.rollButton.hidden = false;
		elements.rollButton.textContent = "Open Treasure Hold";
		elements.rollButton.onclick = async () => updateResult(await emit("createTreasureHold", placeId));
		return;
	}
	if (game.state === "finished" || !player || !player.active) return;
	if (player.awaitingChoice) {
		elements.sailButton.hidden = false;
		elements.portButton.hidden = false;
		return;
	}
	elements.rollButton.hidden = false;
	elements.rollButton.textContent = player.dice.length ? "Cast Again" : "Cast the Dice";
	elements.rollButton.onclick = roll;
}

function renderNotice(player) {
	if (!game) return setNotice("No Treasure Hold is open at this port.");
	if (game.state === "finished") {
		const highScore = game.standings?.[0]?.score ?? 0;
		const winners = (game.standings ?? []).filter(entry => entry.score === highScore).map(entry => entry.name);
		return setNotice(`${winners.join(" & ")} claimed the Treasure Hold with ${highScore} booty!`);
	}
	if (!player) return setNotice("Join the crew to set sail.");
	if (Object.keys(game.players).length < 2) return setNotice("Waiting for at least one more sailor…");
	if (player.outcome === "busted") return setNotice("YOU WERE LOST AT SEA — waiting for the next voyage.", true);
	if (!player.active) return setNotice("Your loot is safe in port. Waiting for the fleet.");
	if (player.awaitingChoice) return setNotice("The hold is still afloat. Bank your loot, or risk it all.");
	setNotice("Cast all six dice to begin this voyage.");
}

function render() {
	const player = game?.players?.[userId] ?? null;
	const danger = Math.max(0, Math.min(6, player?.danger ?? 0));
	elements.placeLabel.textContent = game?.placeName || "Treasure Hold";
	elements.roundValue.textContent = String(Math.min(game?.round ?? 1, 5));
	elements.scoreValue.textContent = String(player?.score ?? 0);
	elements.lootValue.textContent = String(player?.currentLoot ?? 0);
	elements.mapsValue.textContent = `${player?.maps ?? 0} / 3`;
	elements.dangerValue.textContent = `${"● ".repeat(danger)}${"○ ".repeat(6 - danger)}`.trim();
	elements.dangerValue.setAttribute("aria-label", `Danger ${danger} of six`);
	renderDice(player);
	renderActions(player);
	renderLeaderboard();
	renderNotice(player);
}

async function roll() {
	updateResult(await emit("rollTreasureHold", game.id));
}

elements.sailButton.addEventListener("click", async () => updateResult(await emit("sailOn", game.id)));
elements.portButton.addEventListener("click", async () => updateResult(await emit("returnToPort", game.id)));

socket.on("treasureHoldUpdated", updated => {
	if (updated?.placeId === placeId) {
		game = updated;
		render();
	}
});

socket.on("diceRolled", result => {
	if (result?.gameId === game?.id && result.playerId === userId && result.krakenDefeated) showKraken();
});

socket.on("playerBusted", playerId => {
	if (playerId === userId) setNotice("YOU WERE LOST AT SEA", true);
});

socket.on("voyageEnded", result => {
	if (result?.gameId === game?.id) {
		setNotice(`Voyage ${result.completedRound} is complete. Prepare to sail again.`);
		showResultWindow(result, `Voyage ${result.completedRound}`);
	}
});

socket.on("treasureHoldFinished", result => {
	if (result?.gameId === game?.id) {
		setNotice("The fifth voyage is complete. The richest pirate wins!");
		showResultWindow({ ...result, type: "finished" }, "Final");
	}
});

render();
enterGame();
