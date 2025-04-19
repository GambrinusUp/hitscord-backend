import { store } from "../store/store";

export const notifyRoomPeers = (roomName: string, event: string, data: any) => {
  const roomPeers = store.rooms[roomName]?.peers || [];

  roomPeers.forEach((socketId) => {
    const peer = store.peers[socketId];
    if (peer?.socket) {
      peer.socket.emit(event, data);
    }
  });
};
