(async function () {
  const people = await loadFamilyMembers();
  const byId = new Map(people.map((person) => [person.id, person]));
  const partnerPairs = new Map();
  const today = startOfToday(new Date());

  people.forEach((person) => {
    addPair(person.id, person.partnerId);
    addPair(person.parent1Id, person.parent2Id);
  });

  const requestedId = Number(new URLSearchParams(window.location.search).get("id"));
  const person = byId.get(requestedId) || people[0];
  const title = document.querySelector("#calendar-title");
  const summary = document.querySelector("#calendar-summary");
  const upcoming = document.querySelector("#upcoming-events");
  const yearCalendar = document.querySelector("#year-calendar");
  const selectedDateEvents = document.querySelector("#selected-date-events");

  if (!person) {
    upcoming.innerHTML = '<p class="empty">No family data is available.</p>';
    return;
  }

  document.title = `${person.name} Calendar`;
  title.textContent = `${person.name} Calendar`;
  document.querySelector("#back-to-related").href = `related.html?id=${person.id}`;
  document.querySelector("#back-to-tree").href = `tree.html?id=${person.id}`;

  const relatedPeople = people
    .filter((candidate) => candidate.id !== person.id)
    .map((candidate) => ({ person: candidate, relation: relationshipTo(candidate, person) }))
    .filter((item) => item.relation)
    .map((item) => item.person);
  const relatedIds = new Set(relatedPeople.map((member) => member.id));
  const events = buildEvents(relatedPeople, relatedIds);
  const upcomingEvents = events
    .map((event) => ({ ...event, nextDate: nextOccurrence(event.month, event.day) }))
    .sort((a, b) => a.nextDate - b.nextDate || a.title.localeCompare(b.title))
    .slice(0, 10);

  summary.textContent = `${events.length} events from the same ${relatedPeople.length} people shown on ${person.name}'s relationships page.`;
  renderUpcoming(upcomingEvents);
  renderYear(events);
  selectDate(today.getFullYear(), today.getMonth() + 1, today.getDate());

  yearCalendar.addEventListener("click", (event) => {
    const dayButton = event.target.closest("[data-year][data-month][data-day]");
    if (!dayButton) return;
    selectDate(Number(dayButton.dataset.year), Number(dayButton.dataset.month), Number(dayButton.dataset.day));
  });

  function buildEvents(members, memberIds) {
    const events = [];
    const anniversaryKeys = new Set();
    members.forEach((member) => {
      const birthday = dateParts(member.birthDate);
      if (birthday) {
        events.push({
          type: "birthday",
          title: `${member.name}'s birthday`,
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
        month: anniversary.month,
        day: anniversary.day,
        originalYear: anniversary.year
      });
    });
    return events.sort((a, b) => a.month - b.month || a.day - b.day || a.title.localeCompare(b.title));
  }

  function renderUpcoming(items) {
    upcoming.innerHTML = items.length ? items.map((event) => `
      <article class="event-card">
        <div>
          <strong>${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(formatDate(event.nextDate))}${event.originalYear ? `, ${event.nextDate.getFullYear() - event.originalYear} years` : ""}</span>
        </div>
        <a class="calendar-button" href="${googleCalendarUrl(event, event.nextDate)}" target="_blank" rel="noreferrer">Add to Google Calendar</a>
      </article>
    `).join("") : '<p class="empty">No birthdays or anniversaries are listed for these relatives.</p>';
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
      const titleText = events.map((event) => event.title).join("; ");
      const dots = events.slice(0, 4).map((event) => `<i class="dot ${event.type}" aria-hidden="true"></i>`).join("");
      const classes = ["day"];
      if (events.length) classes.push("has-event");
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
      selectedDateEvents.innerHTML = '<p class="empty">No events are listed.</p>';
      return;
    }
    const selectedDate = new Date(year, month - 1, day);
    const matchingEvents = events.filter((event) => event.month === month && event.day === day);
    yearCalendar.querySelectorAll(".day").forEach((element) => {
      element.classList.toggle(
        "is-selected",
        Number(element.dataset.year) === year && Number(element.dataset.month) === month && Number(element.dataset.day) === day
      );
    });
    selectedDateEvents.innerHTML = matchingEvents.length ? matchingEvents.map((event) => `
      <article class="event-card">
        <div>
          <strong>${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(formatDate(selectedDate))}${event.originalYear ? `, ${selectedDate.getFullYear() - event.originalYear} years` : ""}</span>
        </div>
        <a class="calendar-button" href="${googleCalendarUrl(event, selectedDate)}" target="_blank" rel="noreferrer">Add to Google Calendar</a>
      </article>
    `).join("") : `<p class="empty">No events on ${escapeHtml(formatDate(selectedDate))}.</p>`;
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
