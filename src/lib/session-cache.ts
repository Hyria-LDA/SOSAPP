// Query keys are not all user-scoped. Discard data before rendering another account.
export function createSessionCacheGuard(clear: () => void) {
  let previousUserId: string | null | undefined;
  return (event: string, userId: string | null) => {
    if (event === "SIGNED_OUT" ||
      (previousUserId !== undefined && previousUserId !== userId) ||
      (previousUserId === undefined && event === "SIGNED_IN")) {
      clear();
    }
    const shouldReload = event === "USER_UPDATED" || event === "SIGNED_OUT" ||
      (event === "SIGNED_IN" && previousUserId !== userId);
    previousUserId = userId;
    return shouldReload;
  };
}
