import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import https from "https";
import { Server } from "socket.io";
import { store } from "./store/store";
import routes from "./routes/routes";
import { notifyUsersList } from "./utils/notifyUsersList";
import { createRoom } from "./utils/createRoom";
import {
  AppData,
  MediaKind,
  WebRtcTransport,
  Worker,
} from "mediasoup/node/lib/types";
import { createWebRtcTransport } from "./utils/createWebRtcTransport";
import { informConsumers } from "./utils/informConsumers";
import { createsWorker } from "./utils/createsWorker";
import {
  joinVoiceChannel,
  removeVoiceChannel,
  toggleStream,
} from "./services/apiService";

const app = express();
let worker: Worker<AppData>;

app.use(cors());
app.use(express.json());
app.use("/sfu/:room", express.static(path.join(process.cwd(), "public")));
app.use(routes);

const options = {
  key: fs.readFileSync("src/server.key"),
  cert: fs.readFileSync("src/server.cert"),
};

/*const options = {
  key: fs.readFileSync("src/privkey.pem"),
  cert: fs.readFileSync("src/fullchain.pem"),
};*/

const httpsServer = https.createServer(options, app);
httpsServer.listen(3000, "0.0.0.0", () => {
  console.log("Listening on port: 443");
});

const io = new Server(httpsServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const connections = io.of("/mediasoup");

(async () => {
  worker = await createsWorker();
})();

connections.on("connection", async (socket) => {
  socket.emit("connection-success", {
    socketId: socket.id,
  });

  let currentServerId = "";

  socket.on("setServer", ({ serverId, userName, userId }) => {
    for (const otherServerId in store.serversUser) {
      if (store.serversUser.hasOwnProperty(otherServerId)) {
        store.serversUser[otherServerId].users = store.serversUser[
          otherServerId
        ].users.filter((user) => user.socketId !== socket.id);

        notifyUsersList(otherServerId, connections);
      }
    }

    if (!store.serversUser[serverId]) {
      store.serversUser[serverId] = { users: [] };
    }

    const isUserAlreadyOnServer = store.serversUser[serverId].users.some(
      (user) => user.socketId === socket.id
    );

    if (!isUserAlreadyOnServer) {
      store.serversUser[serverId].users.push({
        socketId: socket.id,
        userName: userName,
        userId,
        roomName: null,
      });
    }

    notifyUsersList(serverId, connections);
  });

  socket.on("leaveRoom", async ({ accessToken, voiceChannelId }) => {
    try {
      try {
        const response = await removeVoiceChannel(voiceChannelId, accessToken);

        if (response.status === 200) {
          store.removeConsumer(socket.id);
          store.removeProducer(socket.id);
          store.removeTransport(socket.id);

          store.removePeer(socket.id);

          notifyUsersList(currentServerId, connections);

          socket.emit("leaveConfirmed");
        }
      } catch (error: any) {
        console.log(error.status, error.data);
      }
    } catch (error: any) {
      console.log(error.status, error.data);
    }
  });

  socket.on("disconnect", () => {
    store.removeConsumer(socket.id);
    store.removeProducer(socket.id);
    store.removeTransport(socket.id);

    store.removePeer(socket.id);

    notifyUsersList(currentServerId, connections);
  });

  socket.on(
    "joinRoom",
    async (
      {
        roomName,
        userName,
        userId,
        serverId,
        accessToken,
      }: {
        roomName: string;
        userName: string;
        userId: string;
        serverId: string;
        accessToken: string;
      },
      callback
    ) => {
      currentServerId = serverId;

      try {
        const response = await joinVoiceChannel(roomName, accessToken);

        if (response.status === 200) {
          const router1 = await createRoom(
            roomName,
            socket.id,
            serverId,
            worker
          );

          store.addPeer(socket, roomName, userName, userId);

          if (router1) {
            const rtpCapabilities = router1.rtpCapabilities;

            callback({ rtpCapabilities });
          }
        }
      } catch (error) {
        callback({ error });
        /*if (axios.isAxiosError(error)) {
          callback({
            error: `Request failed with status code ${error.response?.status}: ${error.message}`,
          });
        } else {
          callback({ error: `Unknown error` });
        }*/
      }
    }
  );

  socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
    const roomName = store.peers[socket.id].roomName;

    const router = store.rooms[roomName].router;

    if (router) {
      createWebRtcTransport(router).then(
        (transport: WebRtcTransport<AppData>) => {
          callback({
            params: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
            },
          });

          store.addTransport(transport, roomName, consumer, socket.id);
        },
        (error) => {
          console.log(error);
        }
      );
    }
  });

  socket.on("getProducers", (callback) => {
    const producerList = store.getProducers(socket.id);

    callback(producerList);
  });

  socket.on("transport-connect", ({ dtlsParameters }) => {
    store.getTransport(socket.id).connect({ dtlsParameters });
  });

  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, accessToken, appData }, callback) => {
      //console.log(appData);

      if ((kind as MediaKind) === "video") {
        try {
          await toggleStream(accessToken);
        } catch (error) {
          console.error(error);
        }
      }

      const producer = await store.getTransport(socket.id).produce({
        kind,
        rtpParameters,
        appData,
      });

      const { roomName, peerDetails } = store.peers[socket.id];

      store.addProducer(
        producer,
        roomName,
        peerDetails.name,
        socket.id,
        appData?.source,
        peerDetails.userId
      );

      informConsumers(
        roomName,
        socket.id,
        producer.id,
        currentServerId,
        connections
      );

      producer.on("transportclose", () => {
        producer.close();
      });

      callback({
        id: producer.id,
        producersExist: store.producers.length > 1 ? true : false,
      });
    }
  );

  socket.on(
    "transport-recv-connect",
    async ({ dtlsParameters, serverConsumerTransportId }) => {
      try {
        const consumerTransport = store.getConsumerTransport(
          serverConsumerTransportId
        );

        await consumerTransport.connect({ dtlsParameters });
      } catch (error) {
        console.error("Error connecting consumer transport:", error);
      }
    }
  );

  socket.on("stopProducer", async ({ producerId, accessToken }) => {
    try {
      await toggleStream(accessToken);

      const producer = store.producers.find(
        (p) => p.producer.id === producerId
      );

      if (producer) {
        store.stopProducer(producerId);

        store.notifyProducerClosed(producerId, producer.roomName);
      }

      notifyUsersList(currentServerId, connections);
    } catch (error) {
      console.error(error);
    }
  });

  socket.on("kickUser", ({ targetSocketId }, callback) => {
    const targetSocket = connections.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit("kickedUser");
    }

    callback({ success: true, message: "User kicked successfully." });
  });

  socket.on(
    "consume",
    async (
      { rtpCapabilities, remoteProducerId, serverConsumerTransportId },
      callback
    ) => {
      try {
        const { roomName, router } = store.getRoomData(socket.id);
        const consumerTransport = store.getConsumerTransport(
          serverConsumerTransportId
        );

        if (
          router &&
          router.canConsume({
            producerId: remoteProducerId,
            rtpCapabilities,
          })
        ) {
          const consumer = await consumerTransport.consume({
            producerId: remoteProducerId,
            rtpCapabilities,
            paused: true,
          });

          consumer.on("producerclose", () => {
            socket.emit("producer-closed", {
              remoteProducerId: remoteProducerId,
            });

            consumerTransport.close();
            consumer.close();

            store.closeProducer(consumerTransport.id, consumer.id);
          });

          const producerData = store.producers.find(
            (producer) => producer.producer.id === remoteProducerId
          );
          const userName = producerData ? producerData.userName : "Unknown";
          const source = producerData ? producerData.source : undefined;

          store.addConsumer(consumer, roomName, socket.id);

          const params = {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
            userName,
            source,
          };

          callback({ params });
        }
      } catch (error) {
        callback({
          params: {
            error: error,
          },
        });
      }
    }
  );

  socket.on("consumer-resume", async ({ serverConsumerId }) => {
    const consumerInfo = store.consumers.find(
      (consumerData) => consumerData.consumer.id === serverConsumerId
    );

    await consumerInfo?.consumer.resume();
  });
});
