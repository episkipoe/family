(async function () {
  const people = await loadFamilyMembers();
  const byId = new Map(people.map((person) => [person.id, person]));
  const partnerPairs = new Map();
  const today = startOfToday(new Date());
  const storageKey = "familyCalendarPersonId";

  people.forEach((person) => {
    addPair(person.id, person.partnerId);
    addPair(person.parent1Id, person.parent2Id);
  });

  const params = new URLSearchParams(window.location.search);
  const requestedPerson = personFromStoredId(params.get("id"));
  const savedPerson = personFromStoredId(localStorage.getItem(storageKey));
  let person = requestedPerson || savedPerson || people[0];
  let events = [];
  let immediateIds = new Set();
  let selectedPartnerIds = new Set();
  const calendarPerson = document.querySelector("#calendar-person");
  const upcoming = document.querySelector("#upcoming-events");
  const partnerEventsPanel = document.querySelector("#partner-events-panel");
  const partnerEvents = document.querySelector("#partner-events");
  const yearCalendar = document.querySelector("#year-calendar");
  const selectedDateHeading = document.querySelector("#selected-date-heading");
  const selectedDateDialog = document.querySelector("#selected-date-dialog");
  const selectedDateEvents = document.querySelector("#selected-date-events");

  if (!person) {
    upcoming.innerHTML = '<p class="empty">No family data is available.</p>';
    return;
  }

  document.title = `${person.name} Calendar`;
  renderPersonOptions();
  refreshCalendar();

  yearCalendar.addEventListener("click", (event) => {
    const dayButton = event.target.closest("[data-year][data-month][data-day]");
    if (!dayButton) return;
    selectDate(Number(dayButton.dataset.year), Number(dayButton.dataset.month), Number(dayButton.dataset.day));
  });

  selectedDateDialog.addEventListener("click", (event) => {
    if (event.target === selectedDateDialog) selectedDateDialog.close();
  });

  calendarPerson.addEventListener("change", () => {
    person = byId.get(Number(calendarPerson.value)) || person;
    selectedDateDialog.close();
    localStorage.setItem(storageKey, String(person.id));
    window.history.replaceState(null, "", `calendar.html?id=${person.id}`);
    refreshCalendar();
  });

  function renderPersonOptions() {
    calendarPerson.innerHTML = people
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((member) => `<option value="${member.id}"${member.id === person.id ? " selected" : ""}>${escapeHtml(member.name)}</option>`)
      .join("");
  }

  function refreshCalendar() {
    document.title = `${person.name} Calendar`;
    document.querySelector("#back-to-related").href = `related.html?id=${person.id}`;
    document.querySelector("#back-to-tree").href = `tree.html?id=${person.id}`;
    calendarPerson.value = String(person.id);

    const relatedPeople = people
      .filter((candidate) => candidate.id !== person.id)
      .map((candidate) => ({ person: candidate, relation: relationshipTo(candidate, person) }))
      .filter((item) => item.relation)
      .map((item) => item.person);
    const relatedIds = new Set(relatedPeople.map((member) => member.id));
    immediateIds = immediateFamilyIds(person);
    selectedPartnerIds = new Set(partnerIds(person.id));
    partnerEventsPanel.hidden = selectedPartnerIds.size === 0;
    events = buildEvents(relatedPeople, relatedIds);
    const upcomingEvents = events
      .map((event) => ({ ...event, nextDate: nextOccurrence(event.month, event.day) }))
      .sort((a, b) => a.nextDate - b.nextDate || a.title.localeCompare(b.title))
      .slice(0, 10);
    const upcomingPartnerEvents = events
      .filter(isPartnerEvent)
      .map((event) => ({ ...event, nextDate: nextOccurrence(event.month, event.day) }))
      .sort((a, b) => a.nextDate - b.nextDate || a.title.localeCompare(b.title))
      .slice(0, 10);

    renderUpcoming(upcomingEvents);
    renderPartnerEvents(upcomingPartnerEvents);
    renderYear(events);
    highlightDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  }

  function buildEvents(members, memberIds) {
    const events = [];
    const anniversaryKeys = new Set();
    members.forEach((member) => {
      const birthday = dateParts(member.birthDate);
      if (birthday) {
        events.push({
          type: "birthday",
          title: `${member.name}'s birthday`,
          memberIds: [member.id],
          month: birthday.month,
          day: birthday.day,
          originalYear: birthday.year
        });
      }

      const anniversary = dateParts(member.marriageDate);
      if (!anniversary) return;
      const partner = byId.get(member.partnerId);
      if (partner && !memberIds.has(partner.id) && partner.id !== person.id) return;
      const ids = [member.id, member.partnerId].filter(Number.isFinite).sort((a, b) => a - b);
      const key = ids.length === 2 ? `${ids[0]}-${ids[1]}-${member.marriageDate}` : `${member.id}-${member.marriageDate}`;
      if (anniversaryKeys.has(key)) return;
      anniversaryKeys.add(key);
      events.push({
        type: "anniversary",
        title: partner ? `${member.name} and ${partner.name}'s anniversary` : `${member.name}'s anniversary`,
        memberIds: [member.id, partner?.id].filter(Number.isFinite),
        month: anniversary.month,
        day: anniversary.day,
        originalYear: anniversary.year
      });
    });
    return events.sort((a, b) => a.month - b.month || a.day - b.day || a.title.localeCompare(b.title));
  }

  function renderUpcoming(items) {
    upcoming.innerHTML = items.length ? items.map((event) => eventCardMarkup(event, event.nextDate)).join("") : '<p class="empty">No birthdays or anniversaries are listed for these relatives.</p>';
  }

  function renderPartnerEvents(items) {
    partnerEvents.innerHTML = items.length ? items.map((event) => eventCardMarkup(event, event.nextDate)).join("") : '<p class="empty">No partner events are listed for this calendar.</p>';
  }

  function renderYear(events) {
    const byMonthDay = new Map();
    events.forEach((event) => {
      const key = `${event.month}-${event.day}`;
      if (!byMonthDay.has(key)) byMonthDay.set(key, []);
      byMonthDay.get(key).push(event);
    });
    yearCalendar.innerHTML = visibleMonths().map((month) => monthMarkup(month, byMonthDay)).join("");
  }

  function monthMarkup(month, byMonthDay) {
    const { year, monthIndex } = month;
    const first = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const blanks = Array.from({ length: first.getDay() }, () => '<span class="day is-empty"></span>').join("");
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const monthNumber = monthIndex + 1;
      const events = byMonthDay.get(`${monthNumber}-${day}`) || [];
      const hasImmediateEvent = events.some(isImmediateEvent);
      const hasPartnerEvent = events.some(isPartnerEvent);
      const titleText = events.map((event) => event.title).join("; ");
      const dots = events.slice(0, 4).map((event) => `<i class="dot ${event.type}${isImmediateEvent(event) ? " is-immediate" : ""}${isPartnerEvent(event) ? " is-partner" : ""}" aria-hidden="true"></i>`).join("");
      const classes = ["day"];
      if (events.length) classes.push("has-event");
      if (hasImmediateEvent) classes.push("has-immediate-event");
      if (hasPartnerEvent) classes.push("has-partner-event");
      if (isToday(year, monthNumber, day)) classes.push("is-today");
      const label = events.length
        ? `${monthName(year, monthIndex)} ${day}, ${year}: ${titleText}`
        : `${monthName(year, monthIndex)} ${day}, ${year}: no events`;
      return `<button class="${classes.join(" ")}" type="button" data-year="${year}" data-month="${monthNumber}" data-day="${day}" title="${escapeAttribute(titleText || "No events")}" aria-label="${escapeAttribute(label)}">${day}${dots ? `<span class="dots">${dots}</span>` : ""}</button>`;
    }).join("");
    return `
      <section class="month" aria-label="${monthName(year, monthIndex)} ${year}">
        <h3>${monthName(year, monthIndex)} ${year}</h3>
        <div class="weekdays" aria-hidden="true"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
        <div class="days">${blanks}${days}</div>
      </section>
    `;
  }

  function selectDate(year, month, day) {
    if (!year || !month || !day) {
      selectedDateHeading.textContent = "Selected Date";
      selectedDateEvents.innerHTML = '<p class="empty">No events are listed.</p>';
      openSelectedDateDialog();
      return;
    }
    const selectedDate = new Date(year, month - 1, day);
    const matchingEvents = events.filter((event) => event.month === month && event.day === day);
    highlightDate(year, month, day);
    selectedDateHeading.textContent = formatDate(selectedDate);
    selectedDateEvents.innerHTML = matchingEvents.length ? matchingEvents.map((event) => eventCardMarkup(event, selectedDate)).join("") : `<p class="empty">No events on ${escapeHtml(formatDate(selectedDate))}.</p>`;
    openSelectedDateDialog();
  }

  function highlightDate(year, month, day) {
    yearCalendar.querySelectorAll(".day").forEach((element) => {
      element.classList.toggle(
        "is-selected",
        Number(element.dataset.year) === year && Number(element.dataset.month) === month && Number(element.dataset.day) === day
      );
    });
  }

  function eventCardMarkup(event, date) {
    const classes = ["event-card"];
    if (isImmediateEvent(event)) classes.push("is-immediate");
    if (isPartnerEvent(event)) classes.push("is-partner");
    return `
      <article class="${classes.join(" ")}">
        <div>
          <strong>${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(formatDate(date))}${event.originalYear ? `, ${date.getFullYear() - event.originalYear} years` : ""}</span>
        </div>
        <a class="calendar-button" href="${googleCalendarUrl(event, date)}" target="_blank" rel="noreferrer">Add to Google Calendar</a>
      </article>
    `;
  }

  function openSelectedDateDialog() {
    if (!selectedDateDialog.open) selectedDateDialog.showModal();
  }

  function immediateFamilyIds(member) {
    const directParentIds = new Set(parentIds(member));
    const ids = new Set(directParentIds);
    people.forEach((candidate) => {
      if (candidate.id === member.id) return;
      const candidateParents = parentIds(candidate);
      const hasSharedParent = candidateParents.some((id) => directParentIds.has(id));
      const isChild = candidateParents.includes(member.id);
      if (hasSharedParent || isChild) ids.add(candidate.id);
    });
    ids.delete(member.id);
    return ids;
  }

  function isImmediateEvent(event) {
    return event.memberIds.some((id) => immediateIds.has(id));
  }

  function isPartnerEvent(event) {
    return event.memberIds.some((id) => selectedPartnerIds.has(id));
  }

  function googleCalendarUrl(event, date) {
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${calendarDate(date)}/${calendarDate(end)}`,
      details: `Family ${event.type} from the family calendar.`
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
    return "cousin";
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
    if (/uncle|aunt/.test(relation)) return generationPrefix(relation) + genderWord(subject, "uncle-in-law", "aunt-in-law", "aunt- or uncle-in-law");
    if (/nephew|niece/.test(relation)) return generationPrefix(relation) + genderWord(subject, "nephew-in-law", "niece-in-law", "niece- or nephew-in-law");
    return `${relation} by marriage`;
  }

  function nextOccurrence(month, day) {
    let date = new Date(today.getFullYear(), month - 1, day);
    if (date < today) date = new Date(today.getFullYear() + 1, month - 1, day);
    return date;
  }

  function visibleMonths() {
    return Array.from({ length: 12 }, (_, offset) => {
      const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      return { year: date.getFullYear(), monthIndex: date.getMonth() };
    });
  }

  function isToday(year, month, day) {
    return year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();
  }

  function dateParts(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  function addPair(first, second) {
    if (!byId.has(first) || !byId.has(second) || first === second) return;
    const pair = [first, second].sort((a, b) => a - b);
    partnerPairs.set(pair.join("-"), pair);
  }

  function partnerIds(id) {
    const ids = [];
    partnerPairs.forEach((pair) => {
      if (pair[0] === id) ids.push(pair[1]);
      if (pair[1] === id) ids.push(pair[0]);
    });
    return ids;
  }

  function calendarDate(date) { return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`; }
  function personFromStoredId(value) {
    if (!value) return null;
    const id = Number(value);
    return Number.isFinite(id) ? byId.get(id) || null : null;
  }
  function startOfToday(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function formatDate(date) { return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
  function monthName(year, index) { return new Date(year, index, 1).toLocaleDateString(undefined, { month: "long" }); }
  function generationPrefix(relation) { return relation.match(/^(?:great-)+/)?.[0] || ""; }
  function arePartners(first, second) { return partnerPairs.has([first, second].sort((a, b) => a - b).join("-")); }
  function parentIds(member) { return member ? [member.parent1Id, member.parent2Id].filter((id) => byId.has(id)) : []; }
  function genderWord(member, male, female, neutral) { return member.gender === "M" ? male : member.gender === "F" ? female : neutral; }
  function ancestorWord(member, distance) { return distance === 1 ? genderWord(member, "father", "mother", "parent") : `${"great-".repeat(distance - 2)}${genderWord(member, "grandfather", "grandmother", "grandparent")}`; }
  function descendantWord(member, distance) { return distance === 1 ? genderWord(member, "son", "daughter", "child") : `${"great-".repeat(distance - 2)}${genderWord(member, "grandson", "granddaughter", "grandchild")}`; }
  function pad(value) { return String(value).padStart(2, "0"); }
  function escapeHtml(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
  async function loadFamilyMembers() {
    const response = await fetch("/api/family/tree");
    if (!response.ok) throw new Error("Unable to load family tree data.");
    return response.json();
  }
})();
