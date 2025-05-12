import { Namespace } from "socket.io";
import { store } from "../store/store";

export const notifyUsersList = (serverId: string, connections: Namespace) => {
  const server = store.servers[serverId];
  const serverUsers = store.serversUser[serverId];

  if (!server || !serverUsers) return;

  const roomUsersList = server.roomNames.map((roomName) => {
    const users = store.producers
      .filter(({ roomName: producerRoomName }) => producerRoomName === roomName)
      .map(({ socketId, userName, userId, producer, source }) => ({
        socketId,
        userName,
        userId,
        producerId: producer.id,
        source,
      }));

    return {
      roomName,
      users,
    };
  });

  serverUsers.users.forEach((user) => {
    const targetSocket = connections.sockets.get(user.socketId);
    if (targetSocket) {
      targetSocket.emit("updateUsersList", { rooms: roomUsersList });
    }
  });
};
