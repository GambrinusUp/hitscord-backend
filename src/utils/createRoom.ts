import { AudioLevelObserverVolume, Worker } from "mediasoup/node/lib/types";
import { mediaCodecs } from "../server.configuration";
import { store } from "../store/store";
import { notifyRoomPeers } from "./notifyRoomPeers";

export const createRoom = async (
  roomName: string,
  socketId: string,
  serverId: string,
  worker: Worker
) => {
  let room = store.rooms[roomName];
  let router;
  let audioLevelObserver;

  if (room) {
    router = room.router;
    store.updateRoomPeers(roomName, socketId);
    audioLevelObserver = room.audioLevelObserver;
  } else {
    router = await worker.createRouter({ mediaCodecs });

    audioLevelObserver = await router.createAudioLevelObserver({
      maxEntries: 99,
      threshold: -80,
      interval: 400,
    });

    audioLevelObserver.on(
      "volumes",
      (volumes: Array<AudioLevelObserverVolume>) => {
        const activeSpeakers = volumes.map(({ producer, volume }) => ({
          producerId: producer.id,
          volume,
        }));
        notifyRoomPeers(roomName, "active-speakers", { activeSpeakers });
      }
    );

    audioLevelObserver.on("silence", () => {
      notifyRoomPeers(roomName, "active-speakers", { activeSpeakers: [] });
    });

    store.addRoom(roomName, router, socketId, audioLevelObserver, serverId);
    store.registerRoomToServer(serverId, roomName);
  }

  return router;
};
