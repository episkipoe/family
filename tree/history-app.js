(async function () {
  const HISTORICAL_EVENTS = [
    { date: "1929-10-29", title: "Stock Market Crash of 1929", description: "Black Tuesday marked the Wall Street crash that helped lead into the Great Depression." },
    { date: "1933-03-04", title: "Great Depression New Deal Era Begins", description: "Franklin D. Roosevelt took office and began the New Deal response to the Great Depression." },
    { date: "1941-12-07", title: "Pearl Harbor", description: "The attack on Pearl Harbor brought the United States into World War II." },
    { date: "1945-05-08", title: "Victory in Europe Day", description: "Allied nations celebrated the end of World War II in Europe." },
    { date: "1945-08-14", title: "Victory over Japan Day", description: "Japan accepted surrender terms, effectively ending World War II." },
    { date: "1954-05-17", title: "Brown v. Board of Education", description: "The U.S. Supreme Court ruled that racial segregation in public schools was unconstitutional." },
    { date: "1963-11-22", title: "John F. Kennedy Assassinated", description: "President John F. Kennedy was assassinated in Dallas, Texas." },
    { date: "1969-07-20", title: "Moon Landing", description: "Apollo 11 astronauts landed on the Moon, and Neil Armstrong became the first person to walk there." },
    { date: "1974-08-09", title: "Nixon Resigns", description: "Richard Nixon resigned the presidency during the Watergate scandal." },
    { date: "1981-08-01", title: "MTV Launches", description: "Music Television began broadcasting and reshaped pop culture and music promotion." },
    { date: "1983-01-01", title: "Modern Internet Protocols Begin", description: "ARPANET adopted TCP/IP, a foundational step toward the modern internet." },
    { date: "1986-01-28", title: "Challenger Disaster", description: "The Space Shuttle Challenger broke apart shortly after launch." },
    { date: "1989-11-09", title: "Berlin Wall Falls", description: "The opening of the Berlin Wall became a defining moment in the end of the Cold War." },
    { date: "1991-12-26", title: "Soviet Union Dissolves", description: "The Soviet Union formally dissolved, ending one of the central eras of the Cold War." },
    { date: "1995-08-24", title: "Windows 95 Released", description: "Microsoft released Windows 95, bringing a more familiar graphical desktop to many home computers." },
    { date: "1997-07-04", title: "Pathfinder Lands on Mars", description: "NASA's Pathfinder mission landed on Mars and deployed the Sojourner rover." },
    { date: "1998-11-20", title: "International Space Station Begins", description: "The first module of the International Space Station launched into orbit." },
    { date: "2001-09-11", title: "September 11 Attacks", description: "Coordinated terrorist attacks killed thousands in New York, Virginia, and Pennsylvania." },
    { date: "2004-02-04", title: "Facebook Launches", description: "Facebook launched at Harvard before expanding into one of the world's largest social platforms." },
    { date: "2007-06-29", title: "First iPhone Released", description: "Apple released the first iPhone, accelerating the smartphone era." },
    { date: "2008-09-15", title: "Global Financial Crisis", description: "Lehman Brothers filed for bankruptcy, a major flashpoint in the 2008 financial crisis." },
    { date: "2015-06-26", title: "Obergefell v. Hodges", description: "The U.S. Supreme Court ruled that same-sex couples have a constitutional right to marry." },
    { date: "2020-03-11", title: "COVID-19 Declared a Pandemic", description: "The World Health Organization declared COVID-19 a global pandemic." }
  ];

  const people = await loadFamilyMembers();
  const byId = new Map(people.map((person) => [person.id, person]));
  const events = buildEvents(people);
  const timeline = document.querySelector("#history-timeline");
  const summary = document.querySelector("#history-summary");
  const stats = document.querySelector("#history-stats");
  const search = document.querySelector("#history-search");
  const typeFilter = document.querySelector("#history-type");
  const dialog = document.querySelector("#event-dialog");
  const dialogDate = document.querySelector("#dialog-date");
  const dialogTitle = document.querySelector("#dialog-title");
  const dialogDescription = document.querySelector("#dialog-description");
  const ageList = document.querySelector("#age-list");

  summary.textContent = `${events.length} dated family and historical events from ${people.length} people. Click any event to see who was alive and how old they were.`;
  render();

  search.addEventListener("input", render);
  typeFilter.addEventListener("change", render);
  timeline.addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-id]");
    if (!button) return;
    const selected = events.find((item) => item.id === button.dataset.eventId);
    if (selected) openEvent(selected);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-close-dialog]")) dialog.close();
  });

  function buildEvents(members) {
    const familyEvents = [];
    const marriageKeys = new Set();

    members.forEach((person) => {
      const birth = eventDate(person.birthDate);
      if (birth) {
        familyEvents.push({
          id: `birth-${person.id}`,
          type: "family",
          subtype: "Birth",
          date: birth,
          title: `${person.name} was born`,
          description: person.location ? `Location listed: ${person.location}.` : "Family birth event.",
          personIds: [person.id]
        });
      }

      const death = eventDate(person.deathDate);
      if (death) {
        familyEvents.push({
          id: `death-${person.id}`,
          type: "family",
          subtype: "Death",
          date: death,
          title: `${person.name} died`,
          description: "Family death event.",
          personIds: [person.id]
        });
      }

      const marriage = eventDate(person.marriageDate);
      if (!marriage) return;
      const partner = byId.get(person.partnerId);
      const ids = [person.id, partner?.id].filter(Number.isFinite).sort((a, b) => a - b);
      const key = `${ids.join("-") || person.id}-${person.marriageDate}`;
      if (marriageKeys.has(key)) return;
      marriageKeys.add(key);
      familyEvents.push({
        id: `marriage-${key}`,
        type: "family",
        subtype: "Marriage",
        date: marriage,
        title: partner ? `${person.name} and ${partner.name} married` : `${person.name} married`,
        description: "Family marriage event.",
        personIds: ids.length ? ids : [person.id]
      });
    });

    const historicEvents = HISTORICAL_EVENTS.map((event, index) => ({
      ...event,
      id: `historic-${index}`,
      type: "historic",
      subtype: "History",
      date: eventDate(event.date),
      personIds: []
    }));

    return [...familyEvents, ...historicEvents]
      .filter((event) => event.date)
      .sort((a, b) => a.date - b.date || a.title.localeCompare(b.title));
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const selectedType = typeFilter.value;
    const visibleEvents = events.filter((event) => {
      if (selectedType !== "all" && event.type !== selectedType) return false;
      if (!query) return true;
      const peopleText = event.personIds.map((id) => byId.get(id)?.name || "").join(" ");
      return `${event.title} ${event.description} ${event.subtype} ${formatDate(event.date)} ${peopleText}`.toLowerCase().includes(query);
    });

    stats.innerHTML = `
      <span><strong>${visibleEvents.length}</strong> shown</span>
      <span><strong>${events.filter((event) => event.type === "family").length}</strong> family events</span>
      <span><strong>${events.filter((event) => event.type === "historic").length}</strong> historical events</span>
    `;

    timeline.innerHTML = visibleEvents.length
      ? visibleEvents.map(eventMarkup).join("")
      : '<p class="empty">No events match the current filters.</p>';
  }

  function eventMarkup(event) {
    const aliveCount = aliveCountForEvent(event);
    const peopleText = event.personIds.map((id) => byId.get(id)?.name).filter(Boolean).join(", ");
    return `
      <button class="event-button" type="button" data-event-id="${escapeAttribute(event.id)}" data-event-type="${event.type}">
        <span class="event-year">${event.date.getFullYear()}</span>
        <span class="event-card">
          <strong>${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(formatDate(event.date))}</span>
          <span class="event-meta">
            <i class="pill ${event.type === "historic" ? "historic" : ""}">${escapeHtml(event.subtype)}</i>
            <i class="pill">${aliveCount} alive</i>
            ${peopleText ? `<i class="pill">${escapeHtml(peopleText)}</i>` : ""}
          </span>
        </span>
      </button>
    `;
  }

  function openEvent(event) {
    const eventPersonIds = new Set(event.personIds);
    const eventParentIds = parentIdsFor(eventPersonIds);
    const living = alivePeople(event.date)
      .map((person) => ({ person, age: ageOnDate(person.birthDate, event.date) }))
      .sort((a, b) => b.age.years - a.age.years || a.person.name.localeCompare(b.person.name));

    dialogDate.textContent = formatDate(event.date);
    dialogTitle.textContent = event.title;
    dialogDescription.textContent = event.description;
    ageList.innerHTML = living.length ? living.map(({ person, age }) => `
      <article class="${ageRowClass(person, eventPersonIds, eventParentIds)}">
        <strong>${escapeHtml(person.name)}</strong>
        <span>${escapeHtml(formatAge(age))}</span>
      </article>
    `).join("") : '<p class="empty">No one with a known birth date was alive for this event.</p>';

    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  function parentIdsFor(personIds) {
    const parentIds = new Set();
    personIds.forEach((id) => {
      const person = byId.get(id);
      if (!person) return;
      [person.parent1Id, person.parent2Id].forEach((parentId) => {
        if (byId.has(parentId)) parentIds.add(parentId);
      });
    });
    return parentIds;
  }

  function ageRowClass(person, eventPersonIds, eventParentIds) {
    const classes = ["age-row"];
    if (eventPersonIds.has(person.id)) classes.push("is-event-person");
    else if (eventParentIds.has(person.id)) classes.push("is-event-parent");
    return classes.join(" ");
  }

  function alivePeople(date) {
    return people.filter((person) => {
      const birth = eventDate(person.birthDate);
      if (!birth || birth > date) return false;
      const death = eventDate(person.deathDate);
      return !death || death > date;
    });
  }

  function ageOnDate(birthDate, date) {
    const birth = eventDate(birthDate);
    let years = date.getFullYear() - birth.getFullYear();
    let months = date.getMonth() - birth.getMonth();
    if (date.getDate() < birth.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return { years, months };
  }

  function aliveCountForEvent(event) {
    const unknownBirthDeaths = people.filter((person) => {
      const death = eventDate(person.deathDate);
      return !person.birthDate && death && death <= event.date;
    }).length;
    return Math.max(0, alivePeople(event.date).length - unknownBirthDeaths);
  }

  function eventDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function formatAge(age) {
    if (age.years < 1) return `${age.months} ${age.months === 1 ? "month" : "months"} old`;
    return `${age.years} year${age.years === 1 ? "" : "s"}${age.months ? `, ${age.months} month${age.months === 1 ? "" : "s"}` : ""} old`;
  }

  function formatDate(date) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  async function loadFamilyMembers() {
    const response = await fetch("/api/family/tree");
    if (!response.ok) throw new Error("Unable to load family tree data.");
    return response.json();
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
