import { Namespace } from "socket.io";
import { store } from "../store/store";
import { notifyUsersList } from "./notifyUsersList";

export const informConsumers = (
  roomName: string,
  socketId: string,
  id: string,
  currentServerId: string,
  connections: Namespace
) => {
  const uniqueProducers = new Set();

  store.producers.forEach((producerData) => {
    if (
      producerData.socketId !== socketId &&
      producerData.roomName === roomName &&
      !uniqueProducers.has(producerData.socketId)
    ) {
      uniqueProducers.add(producerData.socketId);
      const producerSocket = store.peers[producerData.socketId].socket;
      producerSocket.emit("new-producer", { producerId: id });
    }
  });

  notifyUsersList(currentServerId, connections);
};
