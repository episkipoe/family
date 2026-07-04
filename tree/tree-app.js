(async function () {
  const members = await loadFamilyMembers();
  const chart = document.querySelector(".tree-chart");
  const svg = d3.select("#family-tree");
  const viewport = svg.append("g").attr("class", "viewport");
  const linkLayer = viewport.append("g").attr("class", "links");
  const nodeLayer = viewport.append("g").attr("class", "nodes");
  const searchInput = document.querySelector("#member-search");
  const generationFilter = document.querySelector("#generation-filter");
  const resetButton = document.querySelector("#reset-view");
  const fitButton = document.querySelector("#fit-view");
  const details = document.querySelector("#member-details");
  const stats = document.querySelector("#tree-stats");

  const width = () => chart.clientWidth;
  const height = () => chart.clientHeight;
  const memberById = new Map(members.map((member) => [member.id, member]));
  const childrenByParent = new Map();
  const partnerPairs = new Map();

  members.forEach((member) => {
    [member.parent1Id, member.parent2Id].forEach((parentId) => {
      if (parentId === null || parentId === undefined) return;
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(member.id);
    });

    addPartnerPair(member.parent1Id, member.parent2Id, member.id);
    addPartnerPair(member.id, member.partnerId);
  });

  const nodes = members.map((member) => ({
    ...member,
    generation: generationFor(member),
    radius: member.featured ? 30 : 24
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  updateLayeredTargets();
  nodes.forEach((node) => {
    node.x = node.targetX;
    node.y = node.targetY;
  });

  const parentLinks = members.flatMap((member) => {
    return [member.parent1Id, member.parent2Id]
      .filter((parentId) => parentId !== null && parentId !== undefined && memberById.has(parentId))
      .map((parentId) => ({
        source: parentId,
        target: member.id,
        type: "parent"
      }));
  });

  const partnerLinks = Array.from(partnerPairs.values()).map((pair) => ({
    ...pair,
    type: "partner"
  }));

  const links = [...parentLinks, ...partnerLinks];
  const defaultCollapsedIds = new Set(
    nodes
      .filter(isDefaultCollapsedOrthBranch)
      .map((node) => node.id)
  );
  const zoom = d3.zoom().scaleExtent([0.28, 2.6]).on("zoom", (event) => {
    viewport.attr("transform", event.transform);
  });

  const requestedSelectedId = Number(new URLSearchParams(window.location.search).get("id"));
  let selectedId = nodeById.has(requestedSelectedId)
    ? requestedSelectedId
    : null;
  let comparisonId = null;
  let touchRelationSourceId = null;
  let touchRelationTargetId = null;
  let touchTapCandidate = null;
  let suppressClickUntil = 0;
  let searchTerm = "";
  let activeGeneration = "all";
  let searchTimer = null;

  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => (d.type === "partner" ? 80 : 170))
        .strength((d) => (d.type === "partner" ? 1 : 0.68))
    )
    .force("charge", d3.forceManyBody().strength(-290))
    .force("collision", d3.forceCollide().radius((d) => d.radius + 34).iterations(4))
    .force("x", d3.forceX((d) => d.targetX).strength(0.42))
    .on("tick", ticked);

  svg.call(zoom);
  svg.on("click", clearSelectionFromBackground);
  hydrateControls();
  resize();
  render();
  if (selectedId === null) {
    clearSelection();
  } else {
    updateSelection(selectedId, { center: true, scale: 1.34 });
  }
  window.addEventListener("resize", resize);

  async function loadFamilyMembers() {
    const response = await fetch("/api/family/tree");
    if (!response.ok) throw new Error("Unable to load family tree data.");
    const people = await response.json();
    return people.map((member) => ({ ...member }));
  }

  function hydrateControls() {
    const generations = [...new Set(nodes.map((node) => node.generation))].sort((a, b) => a - b);

    generations.forEach((generation) => {
      const option = document.createElement("option");
      option.value = String(generation);
      option.textContent = `Generation ${generation + 1}`;
      generationFilter.appendChild(option);
    });

    searchInput.addEventListener("input", (event) => {
      searchTerm = event.target.value.trim().toLowerCase();
      applyState();
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(focusSearchMatch, 180);
    });

    generationFilter.addEventListener("change", (event) => {
      activeGeneration = event.target.value;
      applyState();
    });

    resetButton.addEventListener("click", () => {
      searchInput.value = "";
      generationFilter.value = "all";
      searchTerm = "";
      activeGeneration = "all";
      comparisonId = null;
      nodes.forEach((node) => {
        node.fx = null;
        node.fy = null;
      });
      clearSelection();
      fitToView();
    });

    fitButton.addEventListener("click", fitToView);

    details.addEventListener("click", (event) => {
      const button = event.target.closest("[data-person-id]");
      if (!button) return;
      selectPerson(event, Number(button.dataset.personId));
    });
  }

  function render() {
    linkLayer
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", (d) => `link ${d.type}-link`);

    const node = nodeLayer
      .selectAll(".person-node")
      .data(nodes, (d) => d.id)
      .join((enter) => {
        const group = enter
          .append("g")
          .attr("class", "person-node")
          .attr("tabindex", 0)
          .attr("role", "button")
          .attr("aria-label", (d) => `Select ${d.name}`)
          .on("pointerdown", (event, d) => startTouchTap(event, d.id))
          .on("pointerup", (event, d) => finishTouchTap(event, d.id))
          .on("click", (event, d) => selectPerson(event, d.id))
          .on("keydown", (event, d) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectPerson(event, d.id);
            }
          })
          .call(
            d3
              .drag()
              .on("start", dragStarted)
              .on("drag", dragged)
              .on("end", dragEnded)
          );

        group
          .append((d) => document.createElementNS("http://www.w3.org/2000/svg", d.gender === "M" ? "rect" : "circle"))
          .attr("r", (d) => d.gender === "M" ? null : d.radius)
          .attr("x", (d) => d.gender === "M" ? -d.radius : null)
          .attr("y", (d) => d.gender === "M" ? -d.radius : null)
          .attr("width", (d) => d.gender === "M" ? d.radius * 2 : null)
          .attr("height", (d) => d.gender === "M" ? d.radius * 2 : null)
          .attr("rx", (d) => d.gender === "M" ? 5 : null)
          .attr("class", (d) => `avatar ${genderClass(d.gender)}`);

        group
          .append("text")
          .attr("class", "initials")
          .attr("dy", "0.36em")
          .text((d) => initials(d.name));

        group
          .append("text")
          .attr("class", "node-label")
          .attr("y", (d) => d.radius + 18)
          .text((d) => d.name);

        return group;
      });

    node.append("title").text((d) => d.name);
    applyState();
    if (!nodeById.has(requestedSelectedId)) setTimeout(fitToView, 250);
  }

  function ticked() {
    // Generations are structural rows, not soft suggestions. Forces may arrange
    // relatives horizontally, but they never move a person between row levels.
    nodes.forEach((node) => {
      node.y = node.targetY;
      node.vy = 0;
    });
    lockPartnerPairs();

    linkLayer
      .selectAll("line")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    nodeLayer.selectAll(".person-node").attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  function lockPartnerPairs() {
    partnerLinks.forEach((link) => {
      const first = typeof link.source === "object" ? link.source : nodeById.get(link.source);
      const second = typeof link.target === "object" ? link.target : nodeById.get(link.target);
      if (!first || !second || first.generation !== second.generation) return;

      const pair = [first, second].sort(comparePartnerPair);
      const centerX = (first.x + second.x) / 2;
      pair[0].x = centerX - 40;
      pair[1].x = centerX + 40;
      pair[0].vx = 0;
      pair[1].vx = 0;
    });
  }

  function applyState() {
    const visibleIds = visibleNodeIds();
    const connectedIds = connectedNodeIds(selectedId);
    if (comparisonId !== null) {
      connectedNodeIds(comparisonId).forEach((id) => connectedIds.add(id));
    }
    const matchedIds = matchingNodeIds();
    const isSearching = searchTerm.length > 0;

    nodeLayer.selectAll(".person-node").each(function (d) {
      const matched = matchedIds.has(d.id);
      const visible = visibleIds.has(d.id);
      const connected = connectedIds.has(d.id);
      const collapsed = isCollapsedByDefault(d, connectedIds, isSearching);
      d3.select(this)
        .classed("is-selected", d.id === selectedId || d.id === comparisonId)
        .classed("is-match", Boolean(isSearching && matched))
        .classed("is-hidden", collapsed)
        .classed("is-dimmed", isSearching ? !matched : !visible || !connected)
        .attr("aria-hidden", visible && !collapsed ? "false" : "true");
    });

    linkLayer.selectAll("line").each(function (d) {
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId = typeof d.target === "object" ? d.target.id : d.target;
      const visible = visibleIds.has(sourceId) && visibleIds.has(targetId);
      const connected = connectedIds.has(sourceId) && connectedIds.has(targetId);
      const searchConnected = matchedIds.has(sourceId) || matchedIds.has(targetId);
      const collapsed = isCollapsedByDefault(nodeById.get(sourceId), connectedIds, isSearching)
        || isCollapsedByDefault(nodeById.get(targetId), connectedIds, isSearching);
      d3.select(this)
        .classed("is-hidden", collapsed)
        .classed("is-dimmed", isSearching ? !searchConnected : !visible || !connected);
    });

    updateStats(isSearching ? matchedIds : visibleIds);
  }

  function updateSelection(id, options = { center: true }) {
    selectedId = id;
    const member = nodeById.get(id);
    if (!member) {
      clearSelection();
      return;
    }
    clearGenerationFilter();
    const parents = parentIds(member);
    const siblings = siblingIds(member);
    const children = [...(childrenByParent.get(id) || [])].sort((a, b) => {
      return birthTime(memberById.get(a)) - birthTime(memberById.get(b));
    });
    const partners = partnerLinks
      .filter((link) => link.source.id === id || link.source === id || link.target.id === id || link.target === id)
      .map((link) => {
        const partnerId = (link.source.id ?? link.source) === id ? link.target.id ?? link.target : link.source.id ?? link.source;
        return partnerId;
    });
    const bornText = birthDateWithAge(member);
    const diedDate = formatDate(member.deathDate);
    const marriedDate = formatDate(member.marriageDate);
    const marriedDuration = marriageDuration(member, partners);
    const diedRow = diedDate ? `<div><dt>Died</dt><dd>${diedDate}</dd></div>` : "";
    const marriedRow = marriedDate ? `<div><dt>Married</dt><dd>${marriedDate}${marriedDuration ? ` (${marriedDuration})` : ""}</dd></div>` : "";

    details.innerHTML = `
      <p class="eyebrow">Selected Person</p>
      <h2>${escapeHtml(member.name)}</h2>
      <dl>
        <div><dt>Family</dt><dd>${escapeHtml(member.family || "Unknown")}</dd></div>
        <div><dt>Generation</dt><dd>${member.generation + 1}</dd></div>
        <div><dt>Born</dt><dd>${bornText}</dd></div>
        ${diedRow}
        ${marriedRow}
        <div><dt>Parents</dt><dd>${personLinks(parents, "Not listed")}</dd></div>
        <div><dt>Siblings</dt><dd>${personLinks(siblings, "None listed")}</dd></div>
        <div><dt>Partner link</dt><dd>${personLinks(partners, "Not listed")}</dd></div>
        <div><dt>Children</dt><dd>${personLinks(children, "None listed")}</dd></div>
      </dl>
      <a class="related-link" href="related.html?id=${member.id}">View all relationships</a>
    `;

    applyState();
    if (options.center) centerNode(member, options.scale);
  }

  function selectPerson(event, id) {
    if (Date.now() < suppressClickUntil) return;
    event.stopPropagation();
    if (event.ctrlKey && id !== selectedId) {
      comparisonId = comparisonId === id ? null : id;
      applyState();
      return;
    }
    comparisonId = null;
    updateSelection(id);
  }

  function clearGenerationFilter() {
    if (activeGeneration === "all") return;
    activeGeneration = "all";
    generationFilter.value = "all";
  }

  function clearSelectionFromBackground(event) {
    if (Date.now() < suppressClickUntil || event.defaultPrevented) return;
    if (event.target.closest(".person-node")) return;
    clearSelection();
  }

  function clearSelection() {
    selectedId = null;
    comparisonId = null;
    const generations = new Set(nodes.map((node) => node.generation));
    const families = new Set(nodes.map((node) => node.family).filter(Boolean));
    details.innerHTML = `
      <p class="eyebrow">All People</p>
      <h2>Family tree</h2>
      <dl>
        <div><dt>People</dt><dd>${nodes.length}</dd></div>
        <div><dt>Families</dt><dd>${families.size}</dd></div>
        <div><dt>Generations</dt><dd>${generations.size}</dd></div>
      </dl>
    `;
    applyState();
  }

  function updateStats(visibleIds) {
    const generations = new Set(nodes.filter((node) => visibleIds.has(node.id)).map((node) => node.generation));
    const relationship = comparisonId === null ? "" : relationshipSummary(selectedId, comparisonId);
    stats.innerHTML = `
      ${relationship ? `<span class="relationship-result">${relationship}</span>` : ""}
      <span><strong>${visibleIds.size}</strong> people</span>
      <span><strong>${partnerLinks.length}</strong> partner links</span>
      <span><strong>${generations.size}</strong> generations shown</span>
    `;
  }

  function relationshipSummary(firstId, secondId) {
    const first = nodeById.get(firstId);
    const second = nodeById.get(secondId);
    if (!first || !second) return "";
    return `<strong>${escapeHtml(second.name)}</strong> is ${escapeHtml(relationshipTo(second, first))} of ${escapeHtml(first.name)}.`;
  }

  function relationshipTo(subject, reference) {
    if (arePartners(subject.id, reference.id)) return genderWord(subject, "husband", "wife", "spouse");
    const bloodRelationship = bloodRelationshipTo(subject, reference);
    if (bloodRelationship) return bloodRelationship;

    const subjectPartners = partnerIds(subject.id);
    const referencePartners = partnerIds(reference.id);

    // A person married to the reference's blood relative, or a blood relative
    // of the reference's spouse, is related by marriage.
    for (const partnerId of subjectPartners) {
      const relation = bloodRelationshipTo(nodeById.get(partnerId), reference);
      if (relation) return inLawWord(subject, relation);
    }
    for (const partnerId of referencePartners) {
      const relation = bloodRelationshipTo(subject, nodeById.get(partnerId));
      if (relation) return inLawWord(subject, relation);
    }

    // Spouses of two siblings (Jon Bennett and Michael Schlung, for example)
    // are also siblings-in-law even though neither is a blood relative of the other.
    for (const subjectPartnerId of subjectPartners) {
      for (const referencePartnerId of referencePartners) {
        const relation = bloodRelationshipTo(nodeById.get(subjectPartnerId), nodeById.get(referencePartnerId));
        if (relation) return inLawWord(subject, relation);
      }
    }

    return "not a known relation";
  }

  function bloodRelationshipTo(subject, reference) {
    if (!subject || !reference || subject.id === reference.id) return null;

    const subjectAncestors = ancestorDistances(subject.id);
    const referenceAncestors = ancestorDistances(reference.id);
    if (referenceAncestors.has(subject.id)) {
      return ancestorWord(subject, referenceAncestors.get(subject.id));
    }
    if (subjectAncestors.has(reference.id)) {
      return descendantWord(subject, subjectAncestors.get(reference.id));
    }

    const common = [...subjectAncestors.keys()]
      .filter((id) => referenceAncestors.has(id))
      .map((id) => ({ subjectDistance: subjectAncestors.get(id), referenceDistance: referenceAncestors.get(id) }))
      .sort((a, b) => a.subjectDistance + a.referenceDistance - b.subjectDistance - b.referenceDistance)[0];

    if (!common) return null;
    const { subjectDistance, referenceDistance } = common;
    if (subjectDistance === 1 && referenceDistance === 1) {
      return genderWord(subject, "brother", "sister", "sibling");
    }
    if (subjectDistance === 1 && referenceDistance > 1) {
      const greats = Math.max(0, referenceDistance - 2);
      return `${"great-".repeat(greats)}${genderWord(subject, "uncle", "aunt", "aunt or uncle")}`;
    }
    if (referenceDistance === 1 && subjectDistance > 1) {
      const greats = Math.max(0, subjectDistance - 2);
      return `${"great-".repeat(greats)}${genderWord(subject, "nephew", "niece", "niece or nephew")}`;
    }

    const degree = Math.min(subjectDistance, referenceDistance) - 1;
    const removed = Math.abs(subjectDistance - referenceDistance);
    return `${ordinal(degree)} cousin${removed ? ` ${removed === 1 ? "once" : `${removed} times`} removed` : ""}`;
  }

  function partnerIds(id) {
    const ids = [];
    partnerPairs.forEach((pair) => {
      if (pair.source === id || pair.source.id === id) ids.push(pair.target.id ?? pair.target);
      if (pair.target === id || pair.target.id === id) ids.push(pair.source.id ?? pair.source);
    });
    return [...new Set(ids)];
  }

  function inLawWord(person, relation) {
    if (/brother|sister|sibling/.test(relation)) return genderWord(person, "brother-in-law", "sister-in-law", "sibling-in-law");
    if (/father|mother|parent/.test(relation)) return genderWord(person, "father-in-law", "mother-in-law", "parent-in-law");
    if (/son|daughter|child/.test(relation)) return genderWord(person, "son-in-law", "daughter-in-law", "child-in-law");
    // Everyday kinship treats the spouse of an aunt/uncle as an aunt/uncle,
    // rather than the technically possible but uncommon "aunt/uncle-in-law."
    if (/uncle|aunt/.test(relation)) return generationPrefix(relation) + genderWord(person, "uncle", "aunt", "aunt or uncle");
    if (/nephew|niece/.test(relation)) return generationPrefix(relation) + genderWord(person, "nephew", "niece", "niece or nephew");
    return `${relation} by marriage`;
  }

  function generationPrefix(relation) {
    return relation.match(/^(?:great-)+/)?.[0] || "";
  }

  function ancestorDistances(id) {
    const distances = new Map();
    const queue = parentIds(nodeById.get(id)).map((parentId) => [parentId, 1]);
    while (queue.length) {
      const [ancestorId, distance] = queue.shift();
      if (distances.has(ancestorId) && distances.get(ancestorId) <= distance) continue;
      distances.set(ancestorId, distance);
      parentIds(nodeById.get(ancestorId)).forEach((parentId) => queue.push([parentId, distance + 1]));
    }
    return distances;
  }

  function arePartners(firstId, secondId) {
    return partnerPairs.has([Math.min(firstId, secondId), Math.max(firstId, secondId)].join("-"));
  }

  function ancestorWord(person, distance) {
    if (distance === 1) return genderWord(person, "father", "mother", "parent");
    return `${"great-".repeat(Math.max(0, distance - 2))}${genderWord(person, "grandfather", "grandmother", "grandparent")}`;
  }

  function descendantWord(person, distance) {
    if (distance === 1) return genderWord(person, "son", "daughter", "child");
    return `${"great-".repeat(Math.max(0, distance - 2))}${genderWord(person, "grandson", "granddaughter", "grandchild")}`;
  }

  function genderWord(person, male, female, neutral) {
    return person.gender === "M" ? male : person.gender === "F" ? female : neutral;
  }

  function ordinal(number) {
    const mod100 = number % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${number}th`;
    return `${number}${number % 10 === 1 ? "st" : number % 10 === 2 ? "nd" : number % 10 === 3 ? "rd" : "th"}`;
  }

  function visibleNodeIds() {
    return new Set(
      nodes
        .filter((node) => activeGeneration === "all" || String(node.generation) === activeGeneration)
        .filter((node) => !searchTerm || node.name.toLowerCase().includes(searchTerm))
        .map((node) => node.id)
    );
  }

  function isCollapsedByDefault(node, connectedIds, isSearching) {
    if (!node || !defaultCollapsedIds.has(node.id)) return false;
    if (isSearching || activeGeneration !== "all") return false;
    return selectedId === null || !connectedIds.has(node.id);
  }

  function isDefaultCollapsedOrthBranch(node) {
    if (node.id === 4) return false;
    const lucileParents = [228, 229];
    if (lucileParents.includes(node.id)) return false;
    const parents = parentIds(node);
    return parents.some((id) => lucileParents.includes(id));
  }

  function matchingNodeIds() {
    return new Set(
      nodes
        .filter((node) => !searchTerm || node.name.toLowerCase().includes(searchTerm))
        .map((node) => node.id)
    );
  }

  function focusSearchMatch() {
    if (!searchTerm) return;
    const match = nodes
      .filter((node) => node.name.toLowerCase().includes(searchTerm))
      .sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        return (
          Number(!aName.startsWith(searchTerm)) - Number(!bName.startsWith(searchTerm)) ||
          aName.localeCompare(bName)
        );
      })[0];

    if (match) updateSelection(match.id, { center: true, scale: 1.34 });
  }

  function connectedNodeIds(id) {
    if (id === null || id === undefined) return new Set(nodes.map((node) => node.id));
    const ids = new Set([id]);
    const member = memberById.get(id);
    if (!member) return ids;

    [member.parent1Id, member.parent2Id].forEach((parentId) => {
      if (parentId !== null && parentId !== undefined) ids.add(parentId);
    });

    (childrenByParent.get(id) || []).forEach((childId) => ids.add(childId));

    partnerLinks.forEach((link) => {
      const sourceId = link.source.id ?? link.source;
      const targetId = link.target.id ?? link.target;
      if (sourceId === id) ids.add(targetId);
      if (targetId === id) ids.add(sourceId);
    });

    return ids;
  }

  function centerNode(member, scaleOverride) {
    const node = nodes.find((item) => item.id === member.id);
    if (!node || Number.isNaN(node.x) || Number.isNaN(node.y)) return;
    const scale = scaleOverride || Math.max(1.12, d3.zoomTransform(svg.node()).k || 1);
    const transform = d3.zoomIdentity
      .translate(width() / 2 - node.x * scale, height() / 2 - node.y * scale)
      .scale(scale);
    svg.transition().duration(550).call(zoom.transform, transform);
  }

  function fitToView() {
    const bounds = viewport.node().getBBox();
    if (!bounds.width || !bounds.height) return;

    const fullWidth = width();
    const fullHeight = height();
    const scale = Math.min(1.25, 0.88 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight));
    const translate = [
      fullWidth / 2 - scale * (bounds.x + bounds.width / 2),
      fullHeight / 2 - scale * (bounds.y + bounds.height / 2)
    ];

    svg
      .transition()
      .duration(650)
      .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  }

  function resize() {
    svg.attr("viewBox", `0 0 ${width()} ${height()}`);
    updateLayeredTargets();
    simulation
      .force("x", d3.forceX((d) => d.targetX).strength(0.42))
      .alpha(0.32)
      .restart();
  }

  function updateLayeredTargets() {
    const generations = d3.group(nodes, (node) => node.generation);
    const maxGeneration = d3.max(nodes, (node) => node.generation) || 0;
    const rowGap = Math.max(220, Math.min(270, (height() - 190) / Math.max(1, maxGeneration)));
    const generationNumbers = [...generations.keys()].sort((a, b) => a - b);

    generationNumbers.forEach((generation) => {
      const generationNodes = generations.get(generation);
      const units = generation > 0
        ? siblingGroupedUnits(generationNodes)
        : displayUnitsForGeneration(generationNodes);
      placeUnits(units, generation, rowGap);
    });
  }

  function placeUnits(units, generation, rowGap) {
    const spacing = Math.max(122, Math.min(190, (width() - 180) / Math.max(1, units.length - 1 || 1)));
    const totalWidth = spacing * (units.length - 1);
    const startX = width() / 2 - totalWidth / 2;
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

  function generationAgeOffsets(units) {
    const generationNodes = units.flat();
    const datedNodes = generationNodes.filter((node) => Number.isFinite(decimalBirthYear(node)));
    const middleBirthYear = d3.median(datedNodes, decimalBirthYear);
    const offsets = new Map();

    generationNodes.forEach((node) => {
      const year = decimalBirthYear(node);
      // Seven pixels per year makes sibling age order visible without allowing
      // any generation to spill into the rows above or below it.
      offsets.set(node.id, Number.isFinite(year)
        ? Math.max(-52, Math.min(52, (year - middleBirthYear) * 7))
        : null);
    });

    generationNodes.forEach((node) => {
      if (offsets.get(node.id) !== null) return;
      const partner = nodeById.get(node.partnerId);
      offsets.set(node.id, partner && offsets.get(partner.id) !== null
        ? offsets.get(partner.id)
        : 0);
    });

    return offsets;
  }

  function siblingGroupedUnits(generationNodes) {
    const units = displayUnitsForGeneration(generationNodes);
    const grouped = d3.group(units, parentKeyForUnit);
    const groups = [...grouped.entries()].map(([parentKey, parentUnits]) => {
      const parentCenter = parentCenterForKey(parentKey);
      const sortedUnits = parentUnits.sort(compareSiblingUnits);
      const siblingSpacing = Math.max(102, Math.min(138, 520 / Math.max(1, sortedUnits.length)));
      const totalWidth = siblingSpacing * (sortedUnits.length - 1);

      sortedUnits.forEach((unit, index) => {
        unit.targetX = parentCenter + index * siblingSpacing - totalWidth / 2;
      });

      return {
        key: parentKey,
        targetX: parentCenter,
        width: Math.max(132, totalWidth + 112),
        units: sortedUnits
      };
    });

    groups.sort((a, b) => a.targetX - b.targetX);

    let rightEdge = -Infinity;
    groups.forEach((group) => {
      const leftEdge = group.targetX - group.width / 2;
      if (leftEdge < rightEdge + 24) {
        const shift = rightEdge + 24 - leftEdge;
        group.targetX += shift;
        group.units.forEach((unit) => {
          unit.targetX += shift;
        });
      }
      rightEdge = group.targetX + group.width / 2;
    });

    const minX = d3.min(groups, (group) => group.targetX - group.width / 2) ?? 0;
    const maxX = d3.max(groups, (group) => group.targetX + group.width / 2) ?? width();
    const overflowLeft = Math.max(0, 80 - minX);
    const overflowRight = Math.max(0, maxX - (width() - 80));
    const finalShift = overflowLeft || -overflowRight;

    if (finalShift) {
      groups.forEach((group) => {
        group.units.forEach((unit) => {
          unit.targetX += finalShift;
        });
      });
    }

    return groups.flatMap((group) => group.units);
  }

  function displayUnitsForGeneration(generationNodes) {
    const remaining = new Set(generationNodes.map((node) => node.id));
    const units = [];
    const sorted = [...generationNodes].sort(compareTreeOrder);

    sorted.forEach((node) => {
      if (!remaining.has(node.id)) return;
      const partner = node.partnerId !== null && node.partnerId !== undefined ? nodeById.get(node.partnerId) : null;

      if (partner && partner.generation === node.generation && remaining.has(partner.id)) {
        const pair = [node, partner].sort(comparePartnerPair);
        units.push(pair);
        remaining.delete(pair[0].id);
        remaining.delete(pair[1].id);
        return;
      }

      units.push([node]);
      remaining.delete(node.id);
    });

    return units.sort(compareDisplayUnits);
  }

  function compareDisplayUnits(a, b) {
    return compareTreeOrder(a[0], b[0]);
  }

  function compareSiblingUnits(a, b) {
    const aAnchor = anchorNodeForUnit(a);
    const bAnchor = anchorNodeForUnit(b);
    return birthTime(aAnchor) - birthTime(bAnchor) || aAnchor.name.localeCompare(bAnchor.name);
  }

  function anchorNodeForUnit(unit) {
    return unit.find((node) => parentIds(node).length) || unit[0];
  }

  function parentKeyForUnit(unit) {
    const anchor = anchorNodeForUnit(unit);
    const parents = parentIds(anchor).sort((a, b) => a - b);
    return parents.length ? parents.join("-") : `self-${anchor.id}`;
  }

  function parentCenterForKey(parentKey) {
    const parentIds = parentKey
      .split("-")
      .map((id) => Number(id))
      .filter((id) => nodeById.has(id));

    if (!parentIds.length) return width() / 2;

    const parentXs = parentIds
      .map((id) => nodeById.get(id).targetX)
      .filter((x) => Number.isFinite(x));

    if (!parentXs.length) return width() / 2;
    return d3.mean(parentXs);
  }

  function comparePartnerPair(a, b) {
    return (
      Number(a.gender === "F") - Number(b.gender === "F") ||
      birthYear(a) - birthYear(b) ||
      a.name.localeCompare(b.name)
    );
  }

  function compareTreeOrder(a, b) {
    return (
      familyRank(a) - familyRank(b) ||
      parentSortKey(a).localeCompare(parentSortKey(b)) ||
      birthYear(a) - birthYear(b) ||
      a.name.localeCompare(b.name)
    );
  }

  function parentSortKey(member) {
    const parentIds = [member.parent1Id, member.parent2Id]
      .filter((id) => id !== null && id !== undefined)
      .sort((a, b) => a - b);
    if (parentIds.length) return parentIds.join("-");

    const partner = member.partnerId !== null && member.partnerId !== undefined ? memberById.get(member.partnerId) : null;
    if (!partner) return `self-${member.id}`;
    return [partner.parent1Id, partner.parent2Id]
      .filter((id) => id !== null && id !== undefined)
      .sort((a, b) => a - b)
      .join("-") || `partner-${partner.id}`;
  }

  function familyRank(member) {
    if (member.family === "Bennett") return 0;
    if (member.family === "Reynolds") return 1;
    return 2;
  }

  function birthYear(member) {
    const match = String(member.birthDate || "").match(/^(\d{4})/);
    return match ? Number(match[1]) : 9999;
  }

  function decimalBirthYear(member) {
    const match = String(member.birthDate || "").match(/^(\d{4})(?:-(\d{2})-(\d{2}))?$/);
    if (!match) return NaN;
    const year = Number(match[1]);
    const month = Number(match[2] || 1);
    const day = Number(match[3] || 1);
    return year + (month - 1) / 12 + (day - 1) / 365;
  }

  function birthTime(member) {
    const value = String(member.birthDate || "");
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return birthYear(member) * 10000 + 9999;
    return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
  }

  function generationFor(member, seen = new Set()) {
    if (seen.has(member.id)) return 0;
    seen.add(member.id);
    const parentIds = [member.parent1Id, member.parent2Id].filter((id) => id !== null && id !== undefined);
    if (!parentIds.length) {
      const partner = member.partnerId !== null && member.partnerId !== undefined ? memberById.get(member.partnerId) : null;
      const partnerParents = partner
        ? [partner.parent1Id, partner.parent2Id].filter((id) => id !== null && id !== undefined)
        : [];
      if (partnerParents.length) return generationFor(partner, seen);
      return 0;
    }
    return 1 + Math.max(...parentIds.map((id) => generationFor(memberById.get(id), seen)));
  }

  function parentIds(member) {
    return [member.parent1Id, member.parent2Id]
      .filter((id) => id !== null && id !== undefined)
      .filter((id) => memberById.has(id));
  }

  function siblingIds(member) {
    const ids = new Set();
    parentIds(member).forEach((parentId) => {
      (childrenByParent.get(parentId) || []).forEach((childId) => {
        if (childId !== member.id) ids.add(childId);
      });
    });
    return [...ids].sort((a, b) => birthTime(memberById.get(a)) - birthTime(memberById.get(b)));
  }

  function personLinks(ids, fallback) {
    if (!ids.length) return fallback;
    return `<div class="name-list">${ids.map(personButton).join("")}</div>`;
  }

  function personButton(id) {
    const person = memberById.get(id);
    if (!person) return "";
    return `<button class="person-link" type="button" data-person-id="${id}">${escapeHtml(person.name)}</button>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function addPartnerPair(sourceId, targetId, childId) {
    if (sourceId === null || sourceId === undefined || targetId === null || targetId === undefined) return;
    if (!memberById.has(sourceId) || !memberById.has(targetId) || sourceId === targetId) return;

    const pairId = [sourceId, targetId].sort((a, b) => a - b).join("-");
    if (!partnerPairs.has(pairId)) {
      partnerPairs.set(pairId, {
        source: sourceId,
        target: targetId,
        children: []
      });
    }
    if (childId !== null && childId !== undefined && !partnerPairs.get(pairId).children.includes(childId)) {
      partnerPairs.get(pairId).children.push(childId);
    }
  }

  function formatDate(value) {
    if (!value) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const [year, month, day] = value.split("-");
    return `${Number(month)}/${Number(day)}/${year}`;
  }

  function birthDateWithAge(member) {
    const formattedDate = formatDate(member.birthDate);
    if (!formattedDate) return "Not listed";
    const age = ageFromBirthDate(member.birthDate, member.deathDate);
    return age === null ? formattedDate : `${formattedDate} (age ${age})`;
  }

  function ageFromBirthDate(birthDate, deathDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate || ""))) return null;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(deathDate || ""))
      ? dateFromParts(deathDate)
      : new Date();
    const birth = dateFromParts(birthDate);
    let age = endDate.getFullYear() - birth.getFullYear();
    const hadBirthday = endDate.getMonth() > birth.getMonth()
      || (endDate.getMonth() === birth.getMonth() && endDate.getDate() >= birth.getDate());
    if (!hadBirthday) age -= 1;
    return Math.max(0, age);
  }

  function marriageDuration(member, partnerIds) {
    if (!partnerIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(String(member.marriageDate || ""))) return "";
    const partnerDeathDates = partnerIds
      .map((id) => memberById.get(id)?.deathDate)
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")));
    const deathDates = [member.deathDate, ...partnerDeathDates]
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")))
      .sort();
    const endDate = deathDates.length ? dateFromParts(deathDates[0]) : new Date();
    return durationText(dateFromParts(member.marriageDate), endDate);
  }

  function durationText(startDate, endDate) {
    let years = endDate.getFullYear() - startDate.getFullYear();
    let months = endDate.getMonth() - startDate.getMonth();
    if (endDate.getDate() < startDate.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years <= 0 && months <= 0) return "less than 1 month";
    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
    return parts.join(", ");
  }

  function dateFromParts(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function familyOffset(member) {
    if (member.family === "Bennett") return -120;
    if (member.family === "Reynolds") return 120;
    return 0;
  }

  function genderClass(gender) {
    if (gender === "F") return "avatar-female";
    if (gender === "M") return "avatar-male";
    return "avatar-neutral";
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  function dragStarted(event, d) {
    if (isTouchGesture(event)) {
      touchRelationSourceId = d.id;
      touchRelationTargetId = null;
      comparisonId = null;
      updateSelection(d.id, { center: false });
      return;
    }
    if (!event.active) simulation.alphaTarget(0.25).restart();
    d.fx = d.x;
  }

  function dragged(event, d) {
    if (touchRelationSourceId !== null) {
      const point = clientPoint(event.sourceEvent);
      const element = point ? document.elementFromPoint(point.x, point.y)?.closest(".person-node") : null;
      const target = element ? d3.select(element).datum() : null;
      touchRelationTargetId = target && target.id !== touchRelationSourceId ? target.id : null;
      nodeLayer.selectAll(".person-node").classed("is-relation-target", (node) => node.id === touchRelationTargetId);
      return;
    }
    d.fx = event.x;
  }

  function dragEnded(event, d) {
    if (touchRelationSourceId !== null) {
      if (touchRelationTargetId !== null) comparisonId = touchRelationTargetId;
      touchRelationSourceId = null;
      touchRelationTargetId = null;
      suppressClickUntil = Date.now() + 450;
      nodeLayer.selectAll(".person-node").classed("is-relation-target", false);
      applyState();
      return;
    }
    if (!event.active) simulation.alphaTarget(0);
    d.fx = event.x;
  }

  function startTouchTap(event, id) {
    if (event.pointerType !== "touch") return;
    touchTapCandidate = {
      id,
      x: event.clientX,
      y: event.clientY,
      time: Date.now()
    };
  }

  function finishTouchTap(event, id) {
    if (event.pointerType !== "touch" || !touchTapCandidate || touchTapCandidate.id !== id) return;
    const dx = event.clientX - touchTapCandidate.x;
    const dy = event.clientY - touchTapCandidate.y;
    const elapsed = Date.now() - touchTapCandidate.time;
    const isTap = Math.hypot(dx, dy) < 12 && elapsed < 650;
    touchTapCandidate = null;
    if (!isTap) return;
    event.stopPropagation();
    comparisonId = null;
    updateSelection(id, { center: false });
  }

  function isTouchGesture(event) {
    const source = event.sourceEvent;
    return source?.pointerType === "touch" || Boolean(source?.touches || source?.changedTouches);
  }

  function clientPoint(event) {
    const touch = event?.touches?.[0] || event?.changedTouches?.[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };
    if (Number.isFinite(event?.clientX)) return { x: event.clientX, y: event.clientY };
    return null;
  }
})();
