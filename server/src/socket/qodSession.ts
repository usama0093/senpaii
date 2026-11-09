import type { Socket } from "socket.io";

export const studentRoom = (pin: string) => `qodsession:${pin}`;
export const hostRoom = (pin: string) => `qodsession-host:${pin}`;
// A private room per student, same purpose as Quiz Session's participantRoom — lets
// the server notify exactly one student directly (e.g. "you were removed"), even if
// they haven't submitted a response yet and so have no row in the host's feed.
export const participantRoom = (participantId: string) => `qodsession-participant:${participantId}`;

// Same trust model as Quiz Session's game sockets (join-room / host:join-room in
// socket/index.ts) — no secret check, just room membership by PIN. The host already
// proved ownership over REST before ever getting a pin to join with.
export function registerQodSessionSocket(socket: Socket) {
  socket.on("qod-session:join", ({ pin, participantId }: { pin: string; participantId?: string }) => {
    if (typeof pin === "string") socket.join(studentRoom(pin));
    if (typeof participantId === "string") socket.join(participantRoom(participantId));
  });

  socket.on("qod-session:host-join", ({ pin }: { pin: string }) => {
    if (typeof pin === "string") socket.join(hostRoom(pin));
  });
}