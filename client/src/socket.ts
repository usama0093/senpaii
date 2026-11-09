// import { io, Socket } from "socket.io-client";

// export const socket: Socket = io("http://localhost:5000", {
//   autoConnect: false, // we'll connect manually when actually needed
// });


//temporary socket connection for testing purposes
// import { io, Socket } from "socket.io-client";

// const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000"; // WIFI

// export const socket: Socket = io(SOCKET_URL, {
//   autoConnect: false, // we'll connect manually when actually needed
// });


// ---------------------------------------------

// ---- TUNNEL-TEMP (ACTIVE): no URL passed — socket.io-client connects to whatever
// origin the page was loaded from, and vite.config.ts's "/socket.io" proxy entry
// forwards that connection to the backend on :5000. Mirrors axios.ts's relative baseURL.
import { io, Socket } from "socket.io-client";

export const socket: Socket = io({
  autoConnect: false, // we'll connect manually when actually needed
});