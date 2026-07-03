(function () {
  if (window.io) return;

  window.io = function () {
    return {
      emit(eventName, ...args) {
        const callback = args.find((arg) => typeof arg === "function");
        if (callback) {
          callback({ ok: false, error: "This game needs the realtime game server before it can start." });
        }
      },
      on() {}
    };
  };
})();
