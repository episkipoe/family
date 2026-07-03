const USER_ID_KEY = "familyGames.userId";
const PLANNER_USER_ID_KEY = "familyPlanner.userId";
const PLANNER_USER_NAME_KEY = "familyPlanner.userName";

export function getUserId() {
  let userId = localStorage.getItem(PLANNER_USER_ID_KEY) || localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    userId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  localStorage.setItem(USER_ID_KEY, userId);
  return userId;
}

export function getUserName() {
  return localStorage.getItem(PLANNER_USER_NAME_KEY) || "Player";
}
