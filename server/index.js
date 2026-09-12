import { createApp } from "./app.js";
import { Game, LOBBY_SIZES } from "./game.js";

const port = Number(process.env.PORT) || 3000;
const requestedSize = Number(process.env.LOBBY_SIZE || 20);
const lobbySize = LOBBY_SIZES[requestedSize] ? requestedSize : 20;
const { server } = createApp({ game: new Game({ lobbySize }) });
server.listen(port, () =>
  console.log(`onco.io is running at http://localhost:${port}`),
);
