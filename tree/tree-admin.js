(async function () {
  let people = await loadFamilyMembers();
  const searchInput = document.querySelector("#person-search");
  const personCount = document.querySelector("#person-count");
  const personList = document.querySelector("#person-list");
  const status = document.querySelector("#status");

  render();

  searchInput.addEventListener("input", render);

  personList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-person-id]");
    if (!button) return;

    const personId = Number(button.dataset.deletePersonId);
    const person = people.find((entry) => entry.id === personId);
    if (!person) return;
    if (!window.confirm(`Delete ${person.name}? This will also clear links that point to them.`)) return;

    setStatus("Deleting...");
    try {
      const response = await fetch(`/api/family/tree/${personId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete person.");
      people = result.familyTree;
      render();
      setStatus(`${result.person.name} deleted.`);
    } catch (error) {
      setStatus(error.message || "Unable to delete person.", true);
    }
  });

  async function loadFamilyMembers() {
    const response = await fetch("/api/family/tree");
    if (!response.ok) throw new Error("Unable to load family tree data.");
    return await response.json();
  }

  function render() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const filteredPeople = people
      .filter((person) => !searchTerm || person.name.toLowerCase().includes(searchTerm) || String(person.id).includes(searchTerm))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);

    personCount.textContent = `${filteredPeople.length} of ${people.length} people`;
    personList.innerHTML = filteredPeople.map(personRow).join("");
  }

  function personRow(person) {
    const childCount = people.filter((entry) => entry.parent1Id === person.id || entry.parent2Id === person.id).length;
    const partner = people.find((entry) => entry.id === person.partnerId);
    const meta = [
      `ID ${person.id}`,
      person.family || "Unknown family",
      partner ? `Partner: ${partner.name}` : "",
      childCount ? `${childCount} child${childCount === 1 ? "" : "ren"}` : ""
    ].filter(Boolean).join(" | ");

    return `
      <article class="person-row">
        <div>
          <strong>${escapeHtml(person.name)}</strong>
          <div class="meta">${escapeHtml(meta)}</div>
        </div>
        <button class="danger" type="button" data-delete-person-id="${person.id}">Delete</button>
      </article>
    `;
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
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
