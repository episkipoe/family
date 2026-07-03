const GROUPS = [
	["fruit", [
		["apple", "red or green and usually round"], ["banana", "yellow with a peel"],
		["orange", "shares its name with a color"], ["grape", "grows in bunches on vines"],
		["strawberry", "red with seeds on the outside"], ["blueberry", "a tiny blue berry"],
		["watermelon", "green outside and red inside"], ["pineapple", "wears a spiky crown"],
		["mango", "a sweet tropical stone fruit"], ["peach", "fuzzy with a pit"],
		["pear", "narrow at the top and wide below"], ["cherry", "small, red, and often served in pairs"],
		["lemon", "yellow and famously sour"], ["lime", "green and sharply citrus"],
		["coconut", "hard, hairy, and full of water"], ["kiwi", "brown and fuzzy outside, green inside"]
	]],
	["animal", [
		["elephant", "has a trunk and tusks"], ["giraffe", "the tallest land animal"],
		["penguin", "a flightless bird in a tuxedo"], ["dolphin", "an intelligent ocean mammal"],
		["octopus", "has eight flexible arms"], ["kangaroo", "carries its young in a pouch"],
		["tiger", "a striped big cat"], ["zebra", "a horse-shaped animal with stripes"],
		["sloth", "moves extremely slowly"], ["camel", "crosses deserts with humps"],
		["panda", "a black-and-white bamboo eater"], ["otter", "floats while holding hands"],
		["rhinoceros", "has a horn on its nose"], ["flamingo", "a pink bird that stands on one leg"],
		["hedgehog", "a small animal covered in spines"], ["chameleon", "changes color and has a curling tongue"]
	]],
	["food", [
		["pizza", "a round pie cut into slices"], ["taco", "a folded shell with savory filling"],
		["sushi", "rice commonly paired with raw fish"], ["pancake", "a flat breakfast served in a stack"],
		["popcorn", "a movie snack that starts as kernels"], ["pretzel", "baked dough tied in a knot"],
		["lasagna", "layered pasta baked with sauce"], ["waffle", "breakfast with a grid of syrup pockets"],
		["burrito", "a filling wrapped in a flour tortilla"], ["ramen", "noodles served in broth"],
		["cupcake", "a small frosted cake in a paper wrapper"], ["sandwich", "filling held between slices of bread"],
		["omelet", "folded eggs with fillings"], ["dumpling", "a small pocket of filled dough"],
		["brownie", "a dense square chocolate dessert"], ["croissant", "a flaky crescent-shaped pastry"]
	]],
	["place", [
		["library", "shelves of books and quiet voices"], ["airport", "runways, gates, and departures"],
		["museum", "exhibits preserve art or history"], ["hospital", "doctors and nurses treat patients here"],
		["stadium", "a large arena with spectator stands"], ["aquarium", "underwater life displayed behind glass"],
		["bakery", "bread and pastries are made here"], ["lighthouse", "a coastal tower that guides ships"],
		["castle", "a fortified home with towers"], ["theater", "a stage or screen faces rows of seats"],
		["school", "students gather here to learn"], ["market", "vendors gather to sell goods"],
		["factory", "goods are manufactured here"], ["harbor", "boats shelter and dock here"],
		["observatory", "telescopes watch the sky here"], ["laboratory", "controlled experiments happen here"]
	]],
	["everyday object", [
		["umbrella", "opens overhead when it rains"], ["scissors", "two blades operated by finger loops"],
		["mirror", "shows your reflection"], ["pillow", "supports your head in bed"],
		["ladder", "rungs help you climb upward"], ["flashlight", "a portable beam in the dark"],
		["backpack", "a bag carried on both shoulders"], ["toothbrush", "bristles clean your teeth"],
		["key", "small metal teeth open a lock"], ["candle", "a wick burns inside wax"],
		["hammer", "drives nails with a heavy head"], ["compass", "a needle points north"],
		["binoculars", "two lenses bring distant things closer"], ["stapler", "fastens paper with bent metal"],
		["thermometer", "measures temperature"], ["hourglass", "sand measures time through a narrow neck"]
	]],
	["nature", [
		["volcano", "a mountain that can erupt lava"], ["rainbow", "a colored arc after rain"],
		["waterfall", "a river dropping over a cliff"], ["glacier", "a slowly moving mass of ice"],
		["tornado", "a violently rotating funnel of air"], ["desert", "a very dry landscape"],
		["forest", "a large area dense with trees"], ["island", "land surrounded by water"],
		["canyon", "a deep valley with steep sides"], ["avalanche", "snow rushing down a mountain"],
		["geyser", "hot water erupts from the ground"], ["coral", "tiny animals build colorful ocean reefs"],
		["cave", "a natural chamber underground"], ["swamp", "wetland with trees and still water"],
		["meadow", "an open field of grass and flowers"], ["hurricane", "a huge rotating tropical storm"]
	]],
	["space", [
		["planet", "a world orbiting a star"], ["comet", "an icy visitor with a glowing tail"],
		["asteroid", "a rocky body smaller than a planet"], ["galaxy", "billions of stars bound together"],
		["nebula", "a colorful cloud of gas and dust"], ["satellite", "an object that circles another body"],
		["meteor", "a streak of light from falling space rock"], ["eclipse", "one celestial body blocks another"],
		["astronaut", "a person trained to travel in space"], ["rocket", "engines propel it beyond the atmosphere"],
		["telescope", "collects light from distant objects"], ["orbit", "a repeating path around another body"],
		["moon", "a natural companion orbiting a planet"], ["sun", "the star at the center of our system"],
		["constellation", "a named pattern of stars"], ["black hole", "gravity so strong that light cannot escape"]
	]],
	["music", [
		["guitar", "a fretted instrument usually with six strings"], ["piano", "black and white keys strike strings"],
		["trumpet", "a bright brass instrument with three valves"], ["violin", "a small bowed instrument under the chin"],
		["drums", "rhythm made by striking stretched surfaces"], ["flute", "air blown across a hole makes its tone"],
		["harp", "many strings rise inside a triangular frame"], ["saxophone", "a curved brass-colored woodwind"],
		["banjo", "a round-bodied string instrument"], ["cello", "a large bowed instrument held between the knees"],
		["accordion", "a keyboard instrument squeezed with bellows"], ["xylophone", "tuned bars are struck with mallets"],
		["microphone", "turns a voice into an electrical signal"], ["melody", "a memorable sequence of musical notes"],
		["chorus", "the repeating section of a song"], ["concert", "musicians perform live for an audience"]
	]],
	["sport", [
		["baseball", "batters run around four bases"], ["basketball", "players shoot through a raised hoop"],
		["soccer", "feet drive a ball toward a goal"], ["tennis", "rackets send a ball across a net"],
		["golf", "clubs aim a small ball into distant holes"], ["bowling", "a heavy ball knocks down ten pins"],
		["hockey", "sticks move a puck across ice"], ["volleyball", "teams keep a ball above a high net"],
		["boxing", "gloved fighters compete in a ring"], ["archery", "arrows are aimed with a bow"],
		["surfing", "a rider balances on an ocean wave"], ["fencing", "masked opponents duel with slender swords"],
		["skiing", "two long runners glide over snow"], ["cricket", "a bowler targets wickets behind a batter"],
		["rugby", "an oval ball is carried without pads"], ["gymnastics", "routines combine strength, balance, and flexibility"]
	]],
	["technology", [
		["keyboard", "a grid of keys used to type"], ["router", "directs network traffic between devices"],
		["camera", "captures light as photographs"], ["robot", "a programmable machine that performs tasks"],
		["printer", "puts digital documents onto paper"], ["battery", "stores chemical energy for later use"],
		["server", "provides data or services to other computers"], ["browser", "opens and navigates websites"],
		["password", "a secret string used to prove identity"], ["firewall", "filters unwanted network traffic"],
		["antenna", "sends or receives radio waves"], ["algorithm", "a precise sequence of problem-solving steps"],
		["pixel", "the smallest addressable dot in an image"], ["sensor", "detects a physical change"],
		["database", "organized data built for querying"], ["satnav", "uses satellites to guide a route"]
	]],
	["transport", [
		["bicycle", "two wheels powered by pedals"], ["helicopter", "rotors let it hover"],
		["submarine", "a vessel that travels underwater"], ["train", "linked cars run along rails"],
		["sailboat", "wind pushes cloth to move it"], ["motorcycle", "a two-wheeled motor vehicle"],
		["airplane", "fixed wings carry it through the air"], ["scooter", "a narrow platform with handlebars"],
		["canoe", "a narrow open boat moved by paddles"], ["tractor", "a powerful farm vehicle"],
		["ambulance", "an emergency vehicle for patients"], ["gondola", "a long narrow boat poled through Venice"],
		["spaceship", "a vehicle made to travel beyond Earth"], ["tram", "a street-running passenger railcar"],
		["hovercraft", "rides on a cushion of air"], ["skateboard", "a short deck mounted over four wheels"]
	]],
	["clothing", [
		["jacket", "an outer layer with sleeves"], ["sandals", "open shoes held on by straps"],
		["scarf", "a long strip wrapped around the neck"], ["gloves", "separate coverings for hands and fingers"],
		["helmet", "hard protection worn on the head"], ["socks", "soft foot coverings worn inside shoes"],
		["necktie", "a knotted strip worn under a shirt collar"], ["raincoat", "a waterproof outer layer"],
		["sweater", "a knitted warm top"], ["overalls", "trousers with a bib and shoulder straps"],
		["slippers", "soft indoor footwear"], ["belt", "a band fastened around the waist"],
		["mittens", "hand coverings with one shared finger pocket"], ["vest", "a sleeveless garment for the torso"],
		["tuxedo", "formal evening wear with satin details"], ["poncho", "a single draped garment with a head opening"]
	]],
	["profession", [
		["firefighter", "responds to fires and rescues"], ["architect", "designs buildings"],
		["chef", "professionally prepares meals"], ["mechanic", "diagnoses and repairs machines"],
		["teacher", "helps students learn"], ["pilot", "controls an aircraft"],
		["carpenter", "builds things from wood"], ["detective", "investigates mysteries and crimes"],
		["surgeon", "performs medical operations"], ["farmer", "raises crops or livestock"],
		["photographer", "creates images with a camera"], ["electrician", "installs and repairs wiring"],
		["librarian", "organizes information and helps readers"], ["meteorologist", "studies and forecasts weather"],
		["translator", "converts meaning between languages"], ["blacksmith", "shapes heated metal with a hammer"]
	]],
	["feeling", [
		["joy", "bright pleasure or happiness"], ["anger", "a hot response to perceived wrong"],
		["surprise", "the reaction to something unexpected"], ["curiosity", "a strong desire to know more"],
		["envy", "wanting what someone else has"], ["pride", "satisfaction in an achievement"],
		["relief", "tension leaving when danger passes"], ["nostalgia", "warm longing for the past"],
		["confusion", "uncertainty about what something means"], ["courage", "acting despite fear"],
		["patience", "calm willingness to wait"], ["gratitude", "thankfulness for what was received"],
		["loneliness", "sadness from feeling alone"], ["excitement", "energized anticipation"],
		["embarrassment", "self-conscious discomfort after a mistake"], ["wonder", "awe mixed with curiosity"]
	]],
	["color", [
		["crimson", "a deep vivid red"], ["turquoise", "blue-green like tropical water"],
		["lavender", "a pale purple named for a flower"], ["amber", "golden orange like fossil resin"],
		["indigo", "a deep blue-violet"], ["scarlet", "a brilliant red"],
		["teal", "a dark greenish blue"], ["magenta", "a vivid purplish pink"],
		["ivory", "creamy off-white"], ["charcoal", "a very dark gray"],
		["coral pink", "a warm pink-orange"], ["navy blue", "a nearly black blue"],
		["emerald", "a jewel-like green"], ["mustard", "a muted spicy yellow"],
		["maroon", "a dark brownish red"], ["periwinkle", "a soft blue with violet in it"]
	]],
	["legend or fantasy", [
		["dragon", "a giant reptile that often breathes fire"], ["unicorn", "a horse with one spiral horn"],
		["mermaid", "human above and fish below"], ["phoenix", "a fire bird reborn from ashes"],
		["wizard", "a learned wielder of magic"], ["giant", "a human-shaped being of enormous size"],
		["goblin", "a small troublesome fantasy creature"], ["centaur", "human torso joined to a horse body"],
		["griffin", "an eagle joined with a lion"], ["fairy", "a tiny winged magical being"],
		["minotaur", "a bull-headed creature in a labyrinth"], ["troll", "a hulking creature often found under bridges"],
		["kraken", "a legendary sea monster with tentacles"], ["werewolf", "a person transformed into a wolf"],
		["vampire", "an immortal creature that drinks blood"], ["cyclops", "a giant with one central eye"]
	]],
	["hacker-con fixture", [
		["badge", "identity, art, hardware, and occasionally a quest"], ["goon", "helpful authority with a louder-than-average voice"],
		["village", "a specialist community temporarily given walls"], ["sticker", "portable affiliation with aggressive adhesive"],
		["lanyard", "neck-mounted identity infrastructure"], ["lockpick", "a tiny tool that makes locks into puzzles"],
		["soldering iron", "a hot tool for permanent electronic persuasion"], ["QR code", "a square invitation to exercise questionable trust"],
		["duck", "small giveaway, debugging partner, or both"], ["beach ball", "an inflatable interruption with crowd momentum"],
		["towel", "travel gear elevated into preparedness doctrine"], ["hot dog", "cheap fuel with an outsized mythology"],
		["hallway", "the unofficial track between official tracks"], ["elevator", "vertical transit and accidental social mixer"],
		["USB drive", "pocket storage best treated as hostile"], ["challenge", "an invitation disguised as an obstacle"]
	]]
];

function clueForLength(answer) {
	const letters = answer.replace(/[^a-z]/gi, "").length;
	return `${letters} letters${answer.includes(" ") ? " across multiple words" : ""}`;
}

const VAGUE_CLUES = Object.freeze({
	fruit: ["might travel better than expected", "could disappear during breakfast"],
	animal: ["has its own way of moving", "better encountered with some distance"],
	food: ["could be a meal or a questionable decision", "often improved by being shared"],
	place: ["somewhere plans may change", "a place with reasons to linger"],
	"everyday object": ["easy to miss until it is needed", "the sort of thing someone forgets to pack"],
	nature: ["larger than it first appears", "best understood from more than one angle"],
	space: ["far away, even when visible", "connected to a long journey"],
	music: ["something people may know without agreeing on the words", "can change the mood of a room"],
	sport: ["involves rules somebody will argue about", "easier with practice than explanation"],
	technology: ["useful until it quietly stops cooperating", "part of a system most people ignore"],
	transport: ["gets someone from here to elsewhere", "may turn a schedule into a suggestion"],
	clothing: ["worn for reasons beyond appearance", "might be packed for the wrong weather"],
	profession: ["someone trusted with a specialized problem", "a job recognized by its tools"],
	feeling: ["harder to measure than to notice", "can arrive before its explanation"],
	color: ["changes with the light", "might describe more than one thing"],
	"legend or fantasy": ["belongs to a story that keeps changing", "unlikely, but immediately recognizable"],
	"hacker-con fixture": ["an ordinary thing doing abnormal social work", "useful even when it appears to do nothing"]
});

// Oblique motifs drawn from the user's Ireland, Galápagos, and Istanbul travelogues.
// Each is deliberately shared by several answers so recognizing the story still cannot solve it alone.
const TRAVELOGUE_CLUE_GROUPS = Object.freeze([
	[
		"part of a long travel day that disappeared between two clocks",
		["airplane", "airport", "backpack", "battery", "jacket", "pillow", "coconut"]
	],
	[
		"belongs near a journey that shifted from dead-looking ground into green",
		["banana", "camera", "dolphin", "island", "orange", "penguin", "pancake"]
	],
	[
		"fits a trip where old walls, one room, and everything for sale blurred together",
		["key", "market", "museum", "pretzel", "sandwich", "train"]
	],
	[
		"the traveler turned something like this into part of the narrative",
		["compass", "melody", "password", "robot", "taco", "umbrella"]
	]
]);

const HACKER_CON_CLUE_GROUPS = Object.freeze([
	[
		"may identify you, recruit you, or send you somewhere worse",
		["badge", "sticker", "lanyard", "QR code", "password"]
	],
	[
		"more inviting here than it would be at an airport",
		["lockpick", "soldering iron", "USB drive", "challenge", "scissors"]
	],
	[
		"makes considerably more sense after prolonged sleep deprivation",
		["duck", "beach ball", "towel", "hot dog", "pizza", "goon"]
	],
	[
		"the real event has repeatedly happened around this by accident",
		["hallway", "elevator", "village", "market", "concert", "goon"]
	],
	[
		"trusting it is optional; interacting with it apparently is not",
		["badge", "QR code", "USB drive", "robot", "router", "password"]
	],
	[
		"the right version gets more valuable as midnight recedes",
		["hot dog", "pizza", "taco", "sandwich", "pancake", "coffee"]
	],
	[
		"can become a community before it becomes a destination",
		["village", "hallway", "line", "concert", "market", "challenge"]
	],
	[
		"small enough to trade, important enough to start a story",
		["sticker", "duck", "lanyard", "key", "badge", "USB drive"]
	]
]);

const CONTEXTUAL_CLUES = Object.freeze(
	[...TRAVELOGUE_CLUE_GROUPS, ...HACKER_CON_CLUE_GROUPS].reduce((byAnswer, [clue, answers]) => {
		for (const answer of answers) {
			if (!byAnswer[answer]) byAnswer[answer] = [];
			byAnswer[answer].push(clue);
		}
		return byAnswer;
	}, {})
);

export const SIGNAL_CATALOG = Object.freeze(GROUPS.flatMap(([category, items]) =>
	items.map(([answer], index) => Object.freeze({
		answer,
		category,
		clues: Object.freeze([
			category === "animal" ? "an animal" : `a ${category}`,
			`starts with ${answer[0].toUpperCase()}`,
			clueForLength(answer),
			VAGUE_CLUES[category][index % VAGUE_CLUES[category].length],
			...(CONTEXTUAL_CLUES[answer] ?? [VAGUE_CLUES[category][(index + 1) % VAGUE_CLUES[category].length]])
		])
	}))
));

if (SIGNAL_CATALOG.length < 256) {
	throw new Error(`Resolve the Signal catalog must contain at least 256 answers; found ${SIGNAL_CATALOG.length}`);
}
