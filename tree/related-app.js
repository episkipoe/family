(async function () {
  const people = await loadFamilyMembers();
  const byId = new Map(people.map((person) => [person.id, person]));
  const partnerPairs = new Map();

  people.forEach((person) => {
    addPair(person.id, person.partnerId);
    addPair(person.parent1Id, person.parent2Id);
  });

  const requestedId = Number(new URLSearchParams(window.location.search).get("id"));
  const person = byId.get(requestedId) || people[0];
  const name = document.querySelector("#person-name");
  const summary = document.querySelector("#summary");
  const list = document.querySelector("#relationship-list");
  const search = document.querySelector("#relationship-search");
  const sortNameButton = document.querySelector("#sort-name");
  const sortRelationshipButton = document.querySelector("#sort-relationship");
  let sortMode = "generation";
  let nameSortDirection = "asc";

  if (!person) {
    list.innerHTML = '<p class="empty">No family data is available.</p>';
    return;
  }

  document.title = `${person.name} · Family Relationships`;
  name.textContent = person.name;
  document.querySelector("#view-on-tree").href = `tree.html?id=${person.id}`;
  const relationships = people
    .filter((candidate) => candidate.id !== person.id)
    .map((candidate) => ({ person: candidate, relation: relationshipTo(candidate, person) }))
    .filter((item) => item.relation);
  const proximityById = proximityDistances(person.id);

  summary.textContent = `${relationships.length} known relationships. Each label describes how that person is related to ${person.name}.`;
  updateSortButtons();
  renderFiltered();
  search.addEventListener("input", renderFiltered);
  sortNameButton.addEventListener("click", () => {
    nameSortDirection = sortMode === "name" && nameSortDirection === "asc" ? "desc" : "asc";
    sortMode = "name";
    updateSortButtons();
    renderFiltered();
  });
  sortRelationshipButton.addEventListener("click", () => {
    sortMode = sortMode === "proximity" ? "generation" : "proximity";
    updateSortButtons();
    renderFiltered();
  });

  function renderFiltered() {
    const term = search.value.trim().toLowerCase();
    const items = relationships.filter((item) => `${item.person.name} ${item.relation}`.toLowerCase().includes(term));
    render(sortRelationships(items));
  }

  function sortRelationships(items) {
    return [...items].sort((a, b) => {
      if (sortMode === "name") {
        return nameSortDirectionMultiplier() * a.person.name.localeCompare(b.person.name)
          || generationCompare(a, b);
      }
      if (sortMode === "proximity") return proximityCompare(a, b);
      return generationCompare(a, b);
    });
  }

  function generationCompare(a, b) {
    return generationFor(a.person) - generationFor(b.person)
      || birthTime(a.person) - birthTime(b.person)
      || a.person.name.localeCompare(b.person.name);
  }

  function nameSortDirectionMultiplier() {
    return nameSortDirection === "asc" ? 1 : -1;
  }

  function proximityCompare(a, b) {
    return proximityFor(a.person.id) - proximityFor(b.person.id)
      || generationCompare(a, b);
  }

  function proximityFor(id) {
    return proximityById.get(id) ?? Number.MAX_SAFE_INTEGER;
  }

  function updateSortButtons() {
    sortNameButton.textContent = sortMode === "name"
      ? `Name ${nameSortDirection === "asc" ? "A-Z" : "Z-A"}`
      : "Name";
    sortNameButton.setAttribute("aria-sort", sortMode === "name"
      ? (nameSortDirection === "asc" ? "ascending" : "descending")
      : "none");
    sortRelationshipButton.textContent = sortMode === "proximity"
      ? "Relationship Proximity"
      : "Relationship Generation";
    sortRelationshipButton.setAttribute("aria-sort", sortMode === "proximity" || sortMode === "generation"
      ? "ascending"
      : "none");
  }

  function render(items) {
    list.innerHTML = items.length ? items.map((item) => `
      <article class="relationship">
        <a class="name" href="related.html?id=${item.person.id}">${escapeHtml(item.person.name)}</a>
        <span class="kind">${escapeHtml(item.relation)}</span>
      </article>`).join("") : '<p class="empty">No matching relationships.</p>';
  }

  function relationshipTo(subject, reference) {
    if (arePartners(subject.id, reference.id)) return genderWord(subject, "husband", "wife", "spouse");
    const blood = bloodRelationshipTo(subject, reference);
    if (blood) return blood;
    const subjectPartners = partnerIds(subject.id);
    const referencePartners = partnerIds(reference.id);
    for (const id of subjectPartners) {
      const relation = bloodRelationshipTo(byId.get(id), reference);
      if (relation) return affinityWord(subject, relation);
    }
    for (const id of referencePartners) {
      const relation = bloodRelationshipTo(subject, byId.get(id));
      if (relation) return affinityWord(subject, relation);
    }
    for (const subjectPartner of subjectPartners) {
      for (const referencePartner of referencePartners) {
        const relation = bloodRelationshipTo(byId.get(subjectPartner), byId.get(referencePartner));
        if (relation) return affinityWord(subject, relation);
      }
    }
    return null;
  }

  function bloodRelationshipTo(subject, reference) {
    if (!subject || !reference || subject.id === reference.id) return null;
    const subjectAncestors = ancestorDistances(subject.id);
    const referenceAncestors = ancestorDistances(reference.id);
    if (referenceAncestors.has(subject.id)) return ancestorWord(subject, referenceAncestors.get(subject.id));
    if (subjectAncestors.has(reference.id)) return descendantWord(subject, subjectAncestors.get(reference.id));
    const common = [...subjectAncestors.keys()].filter((id) => referenceAncestors.has(id))
      .map((id) => [subjectAncestors.get(id), referenceAncestors.get(id)])
      .sort((a, b) => a[0] + a[1] - b[0] - b[1])[0];
    if (!common) return null;
    const [subjectDistance, referenceDistance] = common;
    if (subjectDistance === 1 && referenceDistance === 1) return genderWord(subject, "brother", "sister", "sibling");
    if (subjectDistance === 1) return `${"great-".repeat(Math.max(0, referenceDistance - 2))}${genderWord(subject, "uncle", "aunt", "aunt or uncle")}`;
    if (referenceDistance === 1) return `${"great-".repeat(Math.max(0, subjectDistance - 2))}${genderWord(subject, "nephew", "niece", "niece or nephew")}`;
    const degree = Math.min(subjectDistance, referenceDistance) - 1;
    const removed = Math.abs(subjectDistance - referenceDistance);
    return `${ordinal(degree)} cousin${removed ? ` ${removed === 1 ? "once" : `${removed} times`} removed` : ""}`;
  }

  function ancestorDistances(id) {
    const result = new Map();
    const queue = parentIds(byId.get(id)).map((parentId) => [parentId, 1]);
    while (queue.length) {
      const [ancestorId, distance] = queue.shift();
      if (result.has(ancestorId) && result.get(ancestorId) <= distance) continue;
      result.set(ancestorId, distance);
      parentIds(byId.get(ancestorId)).forEach((parentId) => queue.push([parentId, distance + 1]));
    }
    return result;
  }

  function affinityWord(subject, relation) {
    if (/brother|sister|sibling/.test(relation)) return genderWord(subject, "brother-in-law", "sister-in-law", "sibling-in-law");
    if (/father|mother|parent/.test(relation)) return genderWord(subject, "father-in-law", "mother-in-law", "parent-in-law");
    if (/son|daughter|child/.test(relation)) return genderWord(subject, "son-in-law", "daughter-in-law", "child-in-law");
    if (/uncle|aunt/.test(relation)) return generationPrefix(relation) + genderWord(subject, "uncle", "aunt", "aunt or uncle");
    if (/nephew|niece/.test(relation)) return generationPrefix(relation) + genderWord(subject, "nephew", "niece", "niece or nephew");
    return `${relation} by marriage`;
  }

  function generationPrefix(relation) {
    return relation.match(/^(?:great-)+/)?.[0] || "";
  }

  function partnerIds(id) {
    const ids = [];
    partnerPairs.forEach((pair) => {
      if (pair[0] === id) ids.push(pair[1]);
      if (pair[1] === id) ids.push(pair[0]);
    });
    return ids;
  }

  function proximityDistances(startId) {
    const distances = new Map([[startId, 0]]);
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift();
      const nextDistance = distances.get(id) + 1;
      relatedIds(id).forEach((relatedId) => {
        if (distances.has(relatedId)) return;
        distances.set(relatedId, nextDistance);
        queue.push(relatedId);
      });
    }
    return distances;
  }

  function relatedIds(id) {
    const member = byId.get(id);
    if (!member) return [];
    const ids = new Set([...parentIds(member), ...partnerIds(id)]);
    people.forEach((candidate) => {
      if (candidate.parent1Id === id || candidate.parent2Id === id) ids.add(candidate.id);
    });
    return [...ids];
  }

  function addPair(first, second) {
    if (!byId.has(first) || !byId.has(second) || first === second) return;
    const pair = [first, second].sort((a, b) => a - b);
    partnerPairs.set(pair.join("-"), pair);
  }

  function arePartners(first, second) { return partnerPairs.has([first, second].sort((a, b) => a - b).join("-")); }
  function parentIds(member) { return member ? [member.parent1Id, member.parent2Id].filter((id) => byId.has(id)) : []; }
  function generationFor(member, seen = new Set()) {
    if (!member || seen.has(member.id)) return 0;
    seen.add(member.id);
    const parents = parentIds(member);
    if (!parents.length) {
      const partner = byId.get(member.partnerId);
      const partnerParents = partner ? parentIds(partner) : [];
      return partnerParents.length ? generationFor(partner, seen) : 0;
    }
    return 1 + Math.max(...parents.map((id) => generationFor(byId.get(id), seen)));
  }
  function birthTime(member) {
    const value = String(member.birthDate || "");
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 99999999;
    return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
  }
  function genderWord(member, male, female, neutral) { return member.gender === "M" ? male : member.gender === "F" ? female : neutral; }
  function ancestorWord(member, distance) { return distance === 1 ? genderWord(member, "father", "mother", "parent") : `${"great-".repeat(distance - 2)}${genderWord(member, "grandfather", "grandmother", "grandparent")}`; }
  function descendantWord(member, distance) { return distance === 1 ? genderWord(member, "son", "daughter", "child") : `${"great-".repeat(distance - 2)}${genderWord(member, "grandson", "granddaughter", "grandchild")}`; }
  function ordinal(number) { const n = number % 100; return `${number}${n >= 11 && n <= 13 ? "th" : number % 10 === 1 ? "st" : number % 10 === 2 ? "nd" : number % 10 === 3 ? "rd" : "th"}`; }
  function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  async function loadFamilyMembers() {
    const response = await fetch("/api/family/tree");
    if (!response.ok) throw new Error("Unable to load family tree data.");
    return response.json();
  }
})();
