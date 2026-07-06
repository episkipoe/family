(async function () {
  let people = await loadFamilyMembers();
  const form = document.querySelector("#person-form");
  const output = document.querySelector("#entry-output");
  const status = document.querySelector("#status");
  const copyButton = document.querySelector("#copy-entry");
  const familyOptions = document.querySelector("#family-options");
  const parent1 = document.querySelector("#parent-1");
  const parent2 = document.querySelector("#parent-2");
  const partner = document.querySelector("#partner");
  const child = document.querySelector("#child");
  const childParentField = document.querySelector("#child-parent-field");

  const fields = {
    name: document.querySelector("#person-name"),
    family: document.querySelector("#family-name"),
    gender: document.querySelector("#gender"),
    birthDate: document.querySelector("#birth-date"),
    deathDate: document.querySelector("#death-date"),
    marriageDate: document.querySelector("#marriage-date"),
    location: document.querySelector("#location")
  };
  const params = new URLSearchParams(window.location.search);

  hydrateOptions();
  hydrateQueryDefaults();
  output.value = buildEntry();

  async function loadFamilyMembers() {
    const response = await fetch("/api/family/tree");
    if (!response.ok) throw new Error("Unable to load family tree data.");
    return await response.json();
  }

  form.addEventListener("input", () => {
    clearStatus();
    output.value = buildEntry();
  });

  form.addEventListener("change", () => {
    clearStatus();
    output.value = buildEntry();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = validationError();
    if (error) {
      setStatus(error, true);
      return;
    }
    setStatus("Saving...");
    try {
      const result = await savePerson();
      people = result.familyTree;
      hydrateOptions();
      const savedResult = JSON.stringify({
        addedPerson: result.person,
        updatedChild: result.updatedChild
      }, null, 2);
      form.reset();
      output.value = savedResult;
      setStatus("Person saved.");
    } catch (error) {
      setStatus(error.message || "Unable to save person.", true);
    }
  });

  copyButton.addEventListener("click", async () => {
    const error = validationError();
    if (error) {
      setStatus(error, true);
      return;
    }
    output.value = buildEntry();
    try {
      await navigator.clipboard.writeText(output.value);
      setStatus("Entry copied.");
    } catch (error) {
      output.select();
      setStatus("Select the entry and copy it manually.", true);
    }
  });

  function hydrateOptions() {
    const families = [...new Set(people.map((person) => person.family).filter(Boolean))].sort();
    familyOptions.innerHTML = families.map((family) => `<option value="${escapeHtml(family)}"></option>`).join("");

    const personOptions = people
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)
      .map((person) => `<option value="${person.id}">${escapeHtml(person.name)} (${person.id})</option>`)
      .join("");

    [parent1, parent2, partner, child].forEach((select) => {
      select.innerHTML = `<option value="">None</option>${personOptions}`;
    });
  }

  function hydrateQueryDefaults() {
    const childId = params.get("childId");
    const parentId = params.get("parentId");
    const requestedParentField = params.get("childParentField");

    if (hasPersonIdValue(childId) && personById(Number(childId))) {
      child.value = childId;
    }

    if (hasPersonIdValue(parentId) && personById(Number(parentId))) {
      parent1.value = parentId;
    }

    if (["parent1Id", "parent2Id"].includes(requestedParentField)) {
      childParentField.value = requestedParentField;
    }
  }

  function buildEntry() {
    const entry = personPayload();
    entry.id = nextId();

    const selectedChild = hasPersonIdValue(child.value) ? personById(Number(child.value)) : null;
    if (!selectedChild) return JSON.stringify(entry, null, 2);

    const updatedChild = {
      ...selectedChild,
      [childParentField.value]: entry.id
    };

    return JSON.stringify({
      addPerson: entry,
      updateChild: updatedChild
    }, null, 2);
  }

  async function savePerson() {
    const response = await fetch("/api/family/tree", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        person: personPayload(),
        childId: numberOrNull(child.value),
        childParentField: childParentField.value
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to save person.");
    return result;
  }

  function personPayload() {
    const entry = {
      name: fields.name.value.trim(),
      gender: fields.gender.value,
      family: fields.family.value.trim(),
      birthDate: fields.birthDate.value.trim(),
      deathDate: fields.deathDate.value.trim(),
      marriageDate: fields.marriageDate.value.trim(),
      location: locationInputValue(fields.location.value),
      partnerId: numberOrNull(partner.value),
      parent1Id: numberOrNull(parent1.value),
      parent2Id: numberOrNull(parent2.value)
    };

    Object.keys(entry).forEach((key) => {
      if (entry[key] === "") delete entry[key];
      if (key === "partnerId" && entry[key] === null) delete entry[key];
    });

    return entry;
  }

  function validationError() {
    if (!fields.name.value.trim()) return "Name is required.";
    if (!fields.family.value.trim()) return "Family is required.";
    if (hasPersonIdValue(parent1.value) && parent1.value === parent2.value) return "Parent 1 and Parent 2 must be different people.";
    if ([parent1.value, parent2.value].includes(partner.value) && hasPersonIdValue(partner.value)) return "Partner cannot also be a parent.";
    if (hasPersonIdValue(child.value) && [parent1.value, parent2.value].includes(child.value)) return "Child cannot also be selected as this person's parent.";
    if (hasPersonIdValue(child.value) && partner.value === child.value) return "Child cannot also be selected as this person's partner.";
    if (hasPersonIdValue(child.value)) {
      const selectedChild = personById(Number(child.value));
      const existingParentId = selectedChild?.[childParentField.value];
      if (existingParentId !== null && existingParentId !== undefined) {
        return `Selected child's ${childParentField.value} is already set. Choose the other parent field or update the JSON manually.`;
      }
    }
    return "";
  }

  function nextId() {
    return Math.max(0, ...people.map((person) => person.id || 0)) + 1;
  }

  function personById(id) {
    return people.find((person) => person.id === id) || null;
  }

  function numberOrNull(value) {
    return hasPersonIdValue(value) ? Number(value) : null;
  }

  function hasPersonIdValue(value) {
    return value !== null && value !== undefined && value !== "";
  }

  function locationInputValue(value) {
    const seen = new Set();
    const locations = String(value || "")
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter((entry) => {
        const key = entry.toLowerCase();
        if (!entry || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (locations.length > 1) return locations;
    return locations[0] || "";
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function clearStatus() {
    status.textContent = "";
    status.classList.remove("error");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
