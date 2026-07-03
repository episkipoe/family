export function markActive(user) {
  if (user) {
    user.lastActiveAt = Date.now();
  }
}
