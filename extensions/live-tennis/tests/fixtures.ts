export const match = {
  id: 1,
  tournament: "Example Open",
  event_status: null,
  players: { p1: { name: "Player One" }, p2: { name: "Player Two" } },
  score: {
    sets: [1, 0],
    games: [
      [6, 3],
      [4, 4],
    ],
    points: ["15", "30"],
    server: 2,
    is_tiebreak: false,
    stale: false,
  },
};

export const payload = { data: [match], meta: { has_more: false } };
