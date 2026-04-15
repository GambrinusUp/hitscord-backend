import { Namespace } from "socket.io";
import { store } from "../store/store";

export const notifyUsersList = (serverId: string, connections: Namespace) => {
  const server = store.servers[serverId];
  const serverUsers = store.serversUser[serverId];

  if (!server || !serverUsers) return;

  const roomUsersList = server.roomNames.map((roomName) => {
    const room = store.rooms[roomName];
    const peerSocketIds = room?.peers || [];

    // Keep producer-centric shape so existing stream UI logic continues to work.
    const producerUsers = store.producers
      .filter(({ roomName: producerRoomName }) => producerRoomName === roomName)
      .map(({ socketId, userName, userId, producer, source }) => ({
        socketId,
        userName,
        userId,
        producerId: producer.id,
        source,
      }));

    const socketsWithProducer = new Set(producerUsers.map((u) => u.socketId));

    // Append peers without producers (e.g. consumer-only bots) for presence.
    const peersWithoutProducers = peerSocketIds
      .filter((peerSocketId) => !socketsWithProducer.has(peerSocketId))
      .map((peerSocketId) => {
        const peer = store.peers[peerSocketId];
        if (!peer) return null;

        return {
          socketId: peerSocketId,
          userName: peer.peerDetails.name,
          userId: peer.peerDetails.userId,
          producerId: undefined,
          source: undefined,
        };
      })
      .filter((user): user is NonNullable<typeof user> => user !== null);

    const users = [...producerUsers, ...peersWithoutProducers];

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
