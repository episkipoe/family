import crypto from 'node:crypto';
import fs from 'node:fs';

const people = JSON.parse(fs.readFileSync('data/family-tree.json', 'utf8'));
const personById = new Map(people.map((person) => [person.id, person]));
const treeAppSource = fs.readFileSync('tree/tree-app.js', 'utf8');
const snapshotOnly = process.argv.includes('--snapshot');
const svgFlagIndex = process.argv.indexOf('--svg');
const svgOutputPath = svgFlagIndex === -1 ? null : process.argv[svgFlagIndex + 1] || 'artifacts/tree-layout-snapshot.svg';
const jsonFlagIndex = process.argv.indexOf('--json');
const jsonOutputPath = jsonFlagIndex === -1 ? null : process.argv[jsonFlagIndex + 1] || 'artifacts/tree-layout-snapshot.json';
const REFERENCE_IMAGE_PATH = 'C:\\Users\\episk\\.codex\\attachments\\d780f3d3-25e3-457b-8b41-432a1a371d0f\\image-1.jpg';
const EXPECTED_REFERENCE_IMAGE_SHA256 = '84b322bd58d47c28646bff3b5f339f0727689c5d2815c15efba2e7c406731112';
const PARENT_ALIGNMENT_DELTA_LIMIT = 155;
const referenceImageExists = fs.existsSync(REFERENCE_IMAGE_PATH);
const referenceImageSha256 = referenceImageExists
  ? crypto.createHash('sha256').update(fs.readFileSync(REFERENCE_IMAGE_PATH)).digest('hex')
  : null;

if (referenceImageExists && referenceImageSha256 !== EXPECTED_REFERENCE_IMAGE_SHA256) {
  console.error(`Reference image hash changed: ${referenceImageSha256}`);
  process.exit(1);
}
const branchLaneMatch = treeAppSource.match(/const BENNETT_BRANCH_LANES = \{([\s\S]*?)\n  \};/);

if (!branchLaneMatch) {
  console.error('Unable to find BENNETT_BRANCH_LANES in tree/tree-app.js.');
  process.exit(1);
}

const BENNETT_BRANCH_LANES = Object.fromEntries(
  [...branchLaneMatch[1].matchAll(/(\d+):\s*(-?\d+)/g)].map((match) => [Number(match[1]), Number(match[2])])
);
const DEFAULT_SIBLING_SPACING_MAX = readTreeAppNumber('DEFAULT_SIBLING_SPACING_MAX');
const BENNETT_PARENT_SIBLING_SPACING_MAX = readTreeAppNumber('BENNETT_PARENT_SIBLING_SPACING_MAX');

function readTreeAppNumber(name) {
  const match = treeAppSource.match(new RegExp(`const ${name} = (\\d+);`));
  if (!match) {
    console.error(`Unable to find ${name} in tree/tree-app.js.`);
    process.exit(1);
  }
  return Number(match[1]);
}

function parentIds(person) {
  return [person.parent1Id, person.parent2Id].filter((id) => id !== null && id !== undefined && personById.has(id));
}

function generationFor(person, seen = new Set()) {
  if (!person || seen.has(person.id)) return 0;
  seen.add(person.id);

  const parents = parentIds(person);
  if (!parents.length) {
    const partner = personById.get(person.partnerId);
    return partner && parentIds(partner).length ? generationFor(partner, seen) : 0;
  }

  return 1 + Math.max(...parents.map((id) => generationFor(personById.get(id), seen)));
}

people.forEach((person) => {
  person.generation = generationFor(person);
});

function familyRank(person) {
  if (person.family === 'Bennett') return 0;
  if (person.family === 'Reynolds') return 1;
  return 2;
}

function birthYear(person) {
  const match = String(person.birthDate || '').match(/^(\d{4})/);
  return match ? Number(match[1]) : 9999;
}

function parentSortKey(person) {
  const parents = parentIds(person).sort((a, b) => a - b);
  if (parents.length) return parents.join('-');

  const partner = personById.get(person.partnerId);
  return partner ? parentIds(partner).sort((a, b) => a - b).join('-') || `partner-${partner.id}` : `self-${person.id}`;
}

function compareTreeOrder(a, b) {
  return (
    familyRank(a) - familyRank(b) ||
    parentSortKey(a).localeCompare(parentSortKey(b)) ||
    birthYear(a) - birthYear(b) ||
    a.name.localeCompare(b.name)
  );
}

function comparePartnerPair(a, b) {
  return (
    familyRank(a) - familyRank(b) ||
    Number(a.gender === 'F') - Number(b.gender === 'F') ||
    birthYear(a) - birthYear(b) ||
    a.name.localeCompare(b.name)
  );
}

function ancestorDistances(id) {
  const distances = new Map();
  const queue = parentIds(personById.get(id)).map((parentId) => [parentId, 1]);

  while (queue.length) {
    const [ancestorId, distance] = queue.shift();
    if (distances.has(ancestorId) && distances.get(ancestorId) <= distance) continue;
    distances.set(ancestorId, distance);
    queue.push(...parentIds(personById.get(ancestorId)).map((parentId) => [parentId, distance + 1]));
  }

  return distances;
}

function branchAnchorForParents(ids) {
  return ids.map((id) => personById.get(id)).sort(compareTreeOrder)[0] || null;
}

function branchRootForParentIds(ids) {
  const parents = ids.map((id) => personById.get(id));
  const directBranchParent = Object.keys(BENNETT_BRANCH_LANES)
    .map((id) => Number(id))
    .find((id) => parents.some((parent) => parent?.id === id));
  if (directBranchParent) return directBranchParent;

  const anchor = branchAnchorForParents(ids);
  if (!anchor) return null;

  const ancestors = ancestorDistances(anchor.id);
  return Object.keys(BENNETT_BRANCH_LANES)
    .map((id) => Number(id))
    .find((id) => ancestors.has(id)) || null;
}

function branchLaneOffsetFor(person) {
  if (person.generation < 4) return 0;

  const branchRootId = branchRootForParentIds(parentIds(person));
  return BENNETT_BRANCH_LANES[branchRootId] || 0;
}

function laneScoreFor(person) {
  return branchLaneOffsetFor(person);
}

function parentKeyFor(person) {
  return parentIds(person).sort((a, b) => a - b).join('-');
}

function compareParentBranchKeys(aKey, bKey) {
  const aAnchor = branchAnchorForParents(aKey.split('-').map(Number).filter((id) => personById.has(id)));
  const bAnchor = branchAnchorForParents(bKey.split('-').map(Number).filter((id) => personById.has(id)));
  if (aAnchor && bAnchor && aAnchor.id !== bAnchor.id) return compareTreeOrder(aAnchor, bAnchor);
  return aKey.localeCompare(bKey, undefined, { numeric: true });
}

function compareSiblingGroups(a, b) {
  const branchOrder = compareParentBranchKeys(a.key, b.key);
  return a.targetX - b.targetX || branchOrder;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function decimalBirthYear(person) {
  const match = String(person.birthDate || '').match(/^(\d{4})(?:-(\d{2})-(\d{2}))?$/);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2] || 1);
  const day = Number(match[3] || 1);
  return year + (month - 1) / 12 + (day - 1) / 365;
}

function birthTime(person) {
  const match = String(person.birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`).getTime();
}

function anchorPersonForUnit(unit) {
  return unit.find((entry) => parentIds(entry).length) || unit[0];
}

function compareSiblingUnits(a, b) {
  const aAnchor = anchorPersonForUnit(a);
  const bAnchor = anchorPersonForUnit(b);
  return birthTime(aAnchor) - birthTime(bAnchor) || aAnchor.name.localeCompare(bAnchor.name);
}

function displayUnitsForGeneration(generationPeople) {
  const remaining = new Set(generationPeople.map((entry) => entry.id));
  const units = [];
  const sorted = [...generationPeople].sort(compareTreeOrder);

  for (const person of sorted) {
    if (!remaining.has(person.id)) continue;
    const partner = personById.get(person.partnerId);

    if (partner && partner.generation === person.generation && remaining.has(partner.id)) {
      const pair = [person, partner].sort(comparePartnerPair);
      units.push(pair);
      remaining.delete(pair[0].id);
      remaining.delete(pair[1].id);
      continue;
    }

    units.push([person]);
    remaining.delete(person.id);
  }

  return units.sort((a, b) => compareTreeOrder(a[0], b[0]));
}

function parentKeyForUnit(unit) {
  return parentKeyFor(anchorPersonForUnit(unit)) || `self-${anchorPersonForUnit(unit).id}`;
}

function parentCenterForKey(key, chartWidth) {
  const xs = key
    .split('-')
    .map(Number)
    .map((id) => personById.get(id)?.targetX)
    .filter(Number.isFinite);
  return xs.length ? mean(xs) : chartWidth / 2;
}

function branchLaneOffsetForGroup(key, units) {
  if (!units.flat().some((person) => person.generation >= 4)) return 0;
  const parentIds = key.split('-').map(Number).filter((id) => personById.has(id));
  const parents = parentIds.map((id) => personById.get(id));
  const branchRootId = Object.keys(BENNETT_BRANCH_LANES)
    .map((id) => Number(id))
    .find((id) => parents.some((parent) => parent?.id === id));
  return BENNETT_BRANCH_LANES[branchRootId] || 0;
}

function unitGroupBounds(units, minimumWidth) {
  const targets = units.map((unit) => unit.targetX).filter(Number.isFinite);
  if (!targets.length) return { targetX: 0, width: minimumWidth };

  return {
    targetX: mean(targets),
    width: Math.max(minimumWidth, Math.max(...targets) - Math.min(...targets) + 112)
  };
}

function alignSingleChildWithBranchParent(units, key) {
  if (units.length !== 1 || units[0].length !== 1) return;

  const child = units[0][0];
  if (child.family !== 'Bennett' || child.generation < 4) return;

  const parents = key.split('-').map(Number).map((id) => personById.get(id));
  const branchParent = parents.find((parent) => parent?.family === child.family && Number.isFinite(parent.targetX));
  const nonBranchParent = parents.find((parent) => parent && parent.family !== child.family);
  if (!branchParent || !nonBranchParent) return;

  units[0].targetX = branchParent.targetX - 46;
}

function generationAgeOffsets(units) {
  const generationPeople = units.flat();
  const datedYears = generationPeople.map(decimalBirthYear).filter(Number.isFinite);
  const middleBirthYear = datedYears.length ? median(datedYears) : NaN;
  const offsets = new Map();

  for (const person of generationPeople) {
    const year = decimalBirthYear(person);
    offsets.set(person.id, Number.isFinite(year)
      ? Math.max(-52, Math.min(52, (year - middleBirthYear) * 7))
      : null);
  }

  for (const person of generationPeople) {
    if (offsets.get(person.id) !== null) continue;
    const partner = personById.get(person.partnerId);
    offsets.set(person.id, partner && offsets.get(partner.id) !== null ? offsets.get(partner.id) : 0);
  }

  return offsets;
}

function placeUnits(units, generation, rowGap, chartWidth) {
  const spacing = Math.max(122, Math.min(190, (chartWidth - 180) / Math.max(1, units.length - 1 || 1)));
  const totalWidth = spacing * (units.length - 1);
  const startX = chartWidth / 2 - totalWidth / 2;
  const ageOffsets = generationAgeOffsets(units);

  units.forEach((unit, index) => {
    const centerX = unit.targetX ?? startX + index * spacing;
    const generationY = 95 + generation * rowGap;

    if (unit.length === 1) {
      unit[0].targetX = centerX;
      unit[0].targetY = generationY + ageOffsets.get(unit[0].id);
      return;
    }

    unit[0].targetX = centerX - 40;
    unit[0].targetY = generationY + ageOffsets.get(unit[0].id);
    unit[1].targetX = centerX + 40;
    unit[1].targetY = generationY + ageOffsets.get(unit[1].id);
  });
}

function groupedUnitsForGeneration(generationPeople, chartWidth) {
  const units = displayUnitsForGeneration(generationPeople);
  const byParent = new Map();

  for (const unit of units) {
    const key = parentKeyForUnit(unit);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(unit);
  }

  const groups = [...byParent.entries()].map(([key, parentUnits]) => {
    const parentCenter = parentCenterForKey(key, chartWidth) + branchLaneOffsetForGroup(key, parentUnits);
    const sortedUnits = parentUnits.sort(compareSiblingUnits);
    const generation = sortedUnits[0]?.[0]?.generation ?? 0;
    const maxSiblingSpacing = generation === 3 && branchRootForParentIds(key.split('-').map(Number).filter((id) => personById.has(id)))
      ? BENNETT_PARENT_SIBLING_SPACING_MAX
      : DEFAULT_SIBLING_SPACING_MAX;
    const siblingSpacing = Math.max(102, Math.min(maxSiblingSpacing, 620 / Math.max(1, sortedUnits.length)));
    const totalWidth = siblingSpacing * (sortedUnits.length - 1);

    sortedUnits.forEach((unit, index) => {
      unit.targetX = parentCenter + index * siblingSpacing - totalWidth / 2;
    });
    alignSingleChildWithBranchParent(sortedUnits, key);
    const bounds = unitGroupBounds(sortedUnits, Math.max(132, totalWidth + 112));

    return {
      key,
      targetX: bounds.targetX,
      width: bounds.width,
      units: sortedUnits
    };
  }).sort(compareSiblingGroups);

  pushGroupsOutwardFromCenter(groups, chartWidth);

  return {
    groups,
    units: groups.flatMap((group) => group.units)
  };
}

function pushGroupsOutwardFromCenter(groups, chartWidth) {
  const center = mean(groups.map((group) => group.targetX)) || chartWidth / 2;
  const gutter = 24;
  const shiftUnits = (group, shift) => {
    group.targetX += shift;
    group.units.forEach((unit) => {
      unit.targetX += shift;
    });
  };

  const leftGroups = groups
    .filter((group) => group.targetX < center)
    .sort((a, b) => b.targetX - a.targetX);
  let leftBoundary = center - gutter;
  for (const group of leftGroups) {
    const groupRight = group.targetX + group.width / 2;
    if (groupRight > leftBoundary) shiftUnits(group, leftBoundary - groupRight);
    leftBoundary = group.targetX - group.width / 2 - gutter;
  }

  const rightGroups = groups
    .filter((group) => group.targetX >= center)
    .sort((a, b) => a.targetX - b.targetX);
  let rightBoundary = center + gutter;
  for (const group of rightGroups) {
    const groupLeft = group.targetX - group.width / 2;
    if (groupLeft < rightBoundary) shiftUnits(group, rightBoundary - groupLeft);
    rightBoundary = group.targetX + group.width / 2 + gutter;
  }
}

function calculateTargetLayout(chartWidth = 1600, chartHeight = 900) {
  const generations = new Map();
  for (const person of people) {
    if (!generations.has(person.generation)) generations.set(person.generation, []);
    generations.get(person.generation).push(person);
  }

  const maxGeneration = Math.max(...generations.keys());
  const rowGap = Math.max(220, Math.min(270, (chartHeight - 190) / Math.max(1, maxGeneration)));
  const groupSnapshots = new Map();

  [...generations.keys()].sort((a, b) => a - b).forEach((generation) => {
    const generationPeople = generations.get(generation);
    const grouped = generation > 0
      ? groupedUnitsForGeneration(generationPeople, chartWidth)
      : { groups: [], units: displayUnitsForGeneration(generationPeople) };
    placeUnits(grouped.units, generation, rowGap, chartWidth);

    groupSnapshots.set(generation, grouped.groups.map((group) => ({
      key: group.key,
      ids: group.units.flat().map((person) => person.id),
      names: group.units.flat().map((person) => person.name),
      targetX: mean(group.units.map((unit) => unit.targetX)),
      width: group.width
    })));
  });

  return groupSnapshots;
}

const expected = [
  ['Clara Marie Bennett', 11, BENNETT_BRANCH_LANES[11]],
  ['Hazel Grace Musser', 12, BENNETT_BRANCH_LANES[12]],
  ['Soren Grey Musser', 12, BENNETT_BRANCH_LANES[12]],
  ['Ryker Alexander Bennett', 12, BENNETT_BRANCH_LANES[12]],
  ['Morgan Aurora Bennett', 12, BENNETT_BRANCH_LANES[12]],
  ['Caroline Lucille Bennett', 13, BENNETT_BRANCH_LANES[13]]
];

const results = expected.map(([name, expectedRoot, expectedOffset]) => {
  const person = people.find((entry) => entry.name === name);
  const branchRoot = branchRootForParentIds(parentIds(person));
  const offset = branchLaneOffsetFor(person);

  return {
    name,
    branchRoot,
    offset,
    ok: branchRoot === expectedRoot && offset === expectedOffset
  };
});

const failed = results.filter((result) => !result.ok);
const person = (id) => personById.get(id);
const targetGroupsByGeneration = calculateTargetLayout();
const generationFiveGroups = targetGroupsByGeneration.get(4);
const groupFor = (id) => generationFiveGroups.find((group) => group.ids.includes(id));
const generationFivePrefix = generationFiveGroups.slice(0, 5).map((group) => group.key);
const expectedGenerationFivePrefix = ['202-203', '214-225', '206-207', '210-211', '17-129'];
const generationFiveReferenceIds = [
  204,
  226,
  208,
  212,
  221
];
const generationFiveReferenceGroups = generationFiveReferenceIds.map((id) => groupFor(id));
const generationFiveReferenceGaps = generationFiveReferenceGroups.slice(1).map((group, index) => ({
  from: generationFiveReferenceGroups[index].names.join(' / '),
  to: group.names.join(' / '),
  gap: round(group.targetX - generationFiveReferenceGroups[index].targetX)
}));
const parentAlignmentReports = [
  { childId: 204, parentIds: [202, 203] },
  { childId: 226, parentIds: [214, 225] },
  { childId: 208, parentIds: [206, 207] },
  { childId: 212, parentIds: [210, 211] },
  { childId: 221, parentIds: [17, 129] }
].map(({ childId, parentIds }) => {
  const group = groupFor(childId);
  const parentCenter = mean(parentIds.map((id) => person(id).targetX));
  return {
    childGroup: group.names.join(' / '),
    parents: parentIds.map((id) => person(id).name).join(' / '),
    parentCenter: round(parentCenter),
    childCenter: round(group.targetX),
    delta: round(group.targetX - parentCenter)
  };
});
const laneChecks = [
  {
    label: 'Clara appears left of Musser children',
    ok: laneScoreFor(person(204)) < laneScoreFor(person(208))
  },
  {
    label: 'Musser children share lane with Dan Bennett children',
    ok: laneScoreFor(person(208)) === laneScoreFor(person(212))
  },
  {
    label: 'Mark branch children appear left of Jonathan branch children',
    ok: laneScoreFor(person(213)) < laneScoreFor(person(221))
  },
  {
    label: 'James Bennett anchors left of Erin Stummer',
    ok: comparePartnerPair(person(202), person(203)) < 0
  },
  {
    label: 'Terri Musser anchors left of Blake Musser',
    ok: comparePartnerPair(person(206), person(207)) < 0
  },
  {
    label: 'Dan Bennett anchors left of Amy Bennett',
    ok: comparePartnerPair(person(210), person(211)) < 0
  },
  {
    label: 'Post-spacing Clara group remains left of Musser group',
    ok: groupFor(204).targetX < groupFor(208).targetX
  },
  {
    label: 'Post-spacing Musser group remains left of Dan Bennett children',
    ok: groupFor(208).targetX < groupFor(212).targetX
  },
  {
    label: 'Post-spacing Dan Bennett children remain left of Caroline',
    ok: groupFor(213).targetX < groupFor(221).targetX
  },
  {
    label: 'Post-spacing Bennett branch prefix matches reference layout',
    ok: JSON.stringify(generationFivePrefix) === JSON.stringify(expectedGenerationFivePrefix)
  },
  {
    label: 'Reference Bennett child groups keep screenshot-like breathing room',
    ok: generationFiveReferenceGaps.every((entry) => entry.gap >= 160 && entry.gap <= 360)
  },
  {
    label: 'Reference Bennett child groups stay visually anchored near their parents',
    ok: parentAlignmentReports.every((entry) => Math.abs(entry.delta) <= PARENT_ALIGNMENT_DELTA_LIMIT)
  }
];
const layoutSnapshot = {
  referenceImage: REFERENCE_IMAGE_PATH,
  referenceImageExists,
  referenceImageSha256,
  expectedReferenceImageSha256: EXPECTED_REFERENCE_IMAGE_SHA256,
  generatedAt: new Date().toISOString(),
  parentAlignmentDeltaLimit: PARENT_ALIGNMENT_DELTA_LIMIT,
  generationFivePrefix,
  expectedGenerationFivePrefix,
  generationFiveReferenceGaps,
  parentAlignmentReports,
  generationFiveReferenceGroups: generationFiveReferenceGroups.map((group) => ({
    key: group.key,
    ids: group.ids,
    names: group.names,
    targetX: round(group.targetX),
    width: group.width
  }))
};
const failedLaneChecks = laneChecks.filter((check) => !check.ok);

if (svgOutputPath) {
  writeReferenceBranchSvg(svgOutputPath);
  verifyReferenceBranchSvg(svgOutputPath);
  writeReferenceBranchHtml(svgOutputPath);
}

if (jsonOutputPath) {
  writeReferenceBranchJson(jsonOutputPath, layoutSnapshot);
  verifyReferenceBranchJson(jsonOutputPath);
}

console.log(JSON.stringify(snapshotOnly ? layoutSnapshot : {
  results,
  laneChecks,
  ...layoutSnapshot
}, null, 2));

if (snapshotOnly) process.exit(0);

if (failed.length || failedLaneChecks.length) {
  const failedNames = failed.map((result) => result.name);
  const failedLabels = failedLaneChecks.map((check) => check.label);
  console.error(`Tree layout verification failed for: ${[...failedNames, ...failedLabels].join(', ')}`);
  process.exit(1);
}

function writeReferenceBranchSvg(filePath) {
  const previewIds = referenceBranchPreviewIds();
  const peopleInPreview = previewIds
    .map((id) => person(id))
    .filter(Boolean);
  const minX = Math.min(...peopleInPreview.map((entry) => entry.targetX)) - 90;
  const maxX = Math.max(...peopleInPreview.map((entry) => entry.targetX)) + 90;
  const minY = Math.min(...peopleInPreview.map((entry) => entry.targetY)) - 70;
  const maxY = Math.max(...peopleInPreview.map((entry) => entry.targetY)) + 90;
  const viewBox = `${round(minX)} ${round(minY)} ${round(maxX - minX)} ${round(maxY - minY)}`;
  const nodes = peopleInPreview.map((entry) => renderPreviewNode(entry)).join('\n');
  const parentLinks = referenceBranchParentLinks(previewIds).map(([parentId, childId]) => {
    const parent = person(parentId);
    const child = person(childId);
    return `<line class="parent-link" x1="${round(parent.targetX)}" y1="${round(parent.targetY)}" x2="${round(child.targetX)}" y2="${round(child.targetY)}" />`;
  }).join('\n');
  const partnerLinks = referenceBranchPartnerLinks(previewIds).map(([firstId, secondId]) => {
    const [first, second] = [person(firstId), person(secondId)].sort(comparePartnerPair);
    return `<line class="partner-link" x1="${round(first.targetX)}" y1="${round(first.targetY)}" x2="${round(second.targetX)}" y2="${round(second.targetY)}" />`;
  }).join('\n');

  fs.mkdirSync(filePath.split(/[\\/]/).slice(0, -1).join('/') || '.', { recursive: true });
  fs.writeFileSync(filePath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1400" height="520" role="img" aria-label="Bennett branch layout snapshot">
  <style>
    svg { background: #fffdf8; font-family: Inter, Arial, sans-serif; }
    .parent-link { stroke: #1f7a8c; stroke-width: 2; opacity: 0.6; }
    .partner-link { stroke: #a04755; stroke-width: 2; stroke-dasharray: 7 7; opacity: 0.7; }
    .avatar { stroke: rgba(24, 33, 47, 0.64); stroke-width: 2.5; }
    .male { fill: #8bd3e6; }
    .female { fill: #f0a8b3; }
    .label { fill: #17202c; font-size: 12px; font-weight: 700; text-anchor: middle; paint-order: stroke; stroke: #fffdf8; stroke-width: 4px; stroke-linejoin: round; }
    .initials { fill: #17202c; font-size: 13px; font-weight: 800; text-anchor: middle; dominant-baseline: central; }
  </style>
  ${parentLinks}
  ${partnerLinks}
  ${nodes}
</svg>
`);
}

function verifyReferenceBranchSvg(filePath) {
  const svg = fs.readFileSync(filePath, 'utf8');
  const expectedLabels = [
    'Gil Bennett',
    'Kathy Bennett',
    'Mark Bennett',
    'Cindy Bennett',
    'Clara Marie Bennett',
    'Ellie Jo Nordgren',
    'Jessie Kay Nordgren',
    'Hazel Grace Musser',
    'Soren Grey Musser',
    'Ryker Alexander Bennett',
    'Morgan Aurora Bennett',
    'Caroline Lucille Bennett'
  ];
  const expectedPreviewIds = referenceBranchPreviewIds();
  const expectedParentLinks = referenceBranchParentLinks(expectedPreviewIds).length;
  const expectedPartnerLinks = referenceBranchPartnerLinks(expectedPreviewIds).length;
  const missingLabels = expectedLabels.filter((label) => !svg.includes(escapeXml(label)));
  const nodeCount = (svg.match(/<circle class="avatar/g) || []).length;
  const parentLinkCount = (svg.match(/class="parent-link"/g) || []).length;
  const partnerLinkCount = (svg.match(/class="partner-link"/g) || []).length;

  if (missingLabels.length || nodeCount !== expectedPreviewIds.length || parentLinkCount !== expectedParentLinks || partnerLinkCount !== expectedPartnerLinks) {
    console.error(JSON.stringify({
      missingLabels,
      nodeCount,
      expectedNodeCount: expectedPreviewIds.length,
      parentLinkCount,
      expectedParentLinks,
      partnerLinkCount,
      expectedPartnerLinks
    }, null, 2));
    console.error('Tree layout SVG snapshot verification failed.');
    process.exit(1);
  }
}

function writeReferenceBranchHtml(svgPath) {
  const htmlPath = svgPath.replace(/\.svg$/i, '.html');
  const svgFileName = svgPath.split(/[\\/]/).at(-1);
  const svgMarkup = fs.readFileSync(svgPath, 'utf8');
  fs.writeFileSync(htmlPath, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tree Layout Snapshot</title>
  <style>
    body {
      margin: 0;
      background: #f7f2ea;
      color: #18212f;
      font-family: Inter, Arial, sans-serif;
    }

    main {
      display: grid;
      gap: 16px;
      padding: 18px;
    }

    h1 {
      margin: 0;
      font-size: 1.1rem;
    }

    .source {
      margin: 0;
      color: #667085;
      font-size: 0.86rem;
    }

    .preview {
      width: 100%;
      border: 1px solid #dacfc0;
      border-radius: 8px;
      background: #fffdf8;
      overflow: auto;
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <main>
    <h1>Bennett Branch Layout Snapshot</h1>
    <p class="source">Reference: ${escapeXml(REFERENCE_IMAGE_PATH)}</p>
    <div class="preview" data-source="${escapeXml(svgFileName)}">
${svgMarkup}
    </div>
  </main>
</body>
</html>
`);
  verifyReferenceBranchHtml(htmlPath, svgFileName);
}

function writeReferenceBranchJson(filePath, snapshot) {
  fs.mkdirSync(filePath.split(/[\\/]/).slice(0, -1).join('/') || '.', { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function verifyReferenceBranchJson(filePath) {
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const requiredKeys = [
    'referenceImage',
    'referenceImageExists',
    'referenceImageSha256',
    'expectedReferenceImageSha256',
    'generatedAt',
    'parentAlignmentDeltaLimit',
    'generationFivePrefix',
    'expectedGenerationFivePrefix',
    'generationFiveReferenceGaps',
    'parentAlignmentReports',
    'generationFiveReferenceGroups'
  ];
  const missingKeys = requiredKeys.filter((key) => !(key in snapshot));

  if (missingKeys.length || snapshot.generationFiveReferenceGroups.length !== 5) {
    console.error(JSON.stringify({
      missingKeys,
      referenceGroupCount: snapshot.generationFiveReferenceGroups?.length
    }, null, 2));
    console.error('Tree layout JSON snapshot verification failed.');
    process.exit(1);
  }
}

function verifyReferenceBranchHtml(htmlPath, svgFileName) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const expectedFragments = [
    '<title>Tree Layout Snapshot</title>',
    '<h1>Bennett Branch Layout Snapshot</h1>',
    `Reference: ${escapeXml(REFERENCE_IMAGE_PATH)}`,
    `<div class="preview" data-source="${escapeXml(svgFileName)}">`,
    '<svg xmlns="http://www.w3.org/2000/svg"'
  ];
  const missingFragments = expectedFragments.filter((fragment) => !html.includes(fragment));

  if (missingFragments.length) {
    console.error(JSON.stringify({ missingFragments }, null, 2));
    console.error('Tree layout HTML snapshot verification failed.');
    process.exit(1);
  }
}

function referenceBranchPreviewIds() {
  const childIds = [204, 226, 208, 212, 221];
  const ids = new Set();

  for (const childId of childIds) {
    for (const groupedChildId of groupFor(childId).ids) ids.add(groupedChildId);
  }

  for (let depth = 0; depth < 2; depth += 1) {
    for (const id of [...ids]) {
      const entry = person(id);
      if (!entry) continue;
      parentIds(entry).forEach((parentId) => ids.add(parentId));
      if (entry.partnerId !== null && entry.partnerId !== undefined && personById.has(entry.partnerId)) ids.add(entry.partnerId);
    }
  }

  return [...ids].sort((a, b) => {
    const first = person(a);
    const second = person(b);
    return first.generation - second.generation || compareTreeOrder(first, second);
  });
}

function referenceBranchParentLinks(previewIds) {
  const visible = new Set(previewIds);
  return previewIds.flatMap((childId) => parentIds(person(childId))
    .filter((parentId) => visible.has(parentId))
    .map((parentId) => [parentId, childId]));
}

function referenceBranchPartnerLinks(previewIds) {
  const visible = new Set(previewIds);
  const seen = new Set();
  const links = [];

  for (const id of previewIds) {
    const partnerId = person(id)?.partnerId;
    if (!visible.has(partnerId)) continue;
    const key = [id, partnerId].sort((a, b) => a - b).join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    links.push([id, partnerId]);
  }

  return links;
}

function renderPreviewNode(entry) {
  const className = entry.gender === 'M' ? 'male' : entry.gender === 'F' ? 'female' : 'neutral';
  const initials = entry.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return `<g>
    <circle class="avatar ${className}" cx="${round(entry.targetX)}" cy="${round(entry.targetY)}" r="20" />
    <text class="initials" x="${round(entry.targetX)}" y="${round(entry.targetY)}">${escapeXml(initials)}</text>
    <text class="label" x="${round(entry.targetX)}" y="${round(entry.targetY + 37)}">${escapeXml(entry.name)}</text>
  </g>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
