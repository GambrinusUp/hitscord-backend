const https = require("https");
const fs = require("fs");
const express = require("express");
const app = express();
//const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");
const port = process.env.PORT || 443;

app.use(cors());
app.use(express.json());

app.use("/sfu/:room", express.static(path.join(process.cwd(), "public")));

const options = {
  key: fs.readFileSync("privkey.pem"),
  cert: fs.readFileSync("fullchain.pem"),
};

const httpServer = https.createServer(options, app);
httpServer.listen(port, "0.0.0.0", () => {
  console.log("Listening on port: 443");
});

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const connections = io.of("/mediasoup");

let worker;
let rooms = {}; // { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
let peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers = []; // [ { socketId1, roomName1, producer, }, ... ]
let consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]
let serversUser = {}; // { serverId1: { users: [ {socketId, userName, roomName}, ... ] }, ... }
let servers = {}; // { serverId1: { roomNames: [ roomName1, roomName2, ...] }, ... }

app.post("/rooms/create", (req, res) => {
  const { roomName, serverId } = req.body;

  if (!roomName) {
    return res.status(400).json({ error: "roomName is required" });
  }

  if (rooms[roomName]) {
    return res.status(409).json({ message: "Room already exists" });
  }

  rooms[roomName] = {
    serverId,
    router: null,
    peers: [],
  };

  res.status(201).json({
    message: `Room '${roomName}' created successfully with serverId '${serverId}'`,
  });
});

app.get("/rooms", (req, res) => {
  const roomList = Object.entries(rooms).map(([roomName, room]) => ({
    roomName,
    ...room,
  }));

  res.json(roomList);
});

app.get("/rooms/:serverId", (req, res) => {
  const { serverId } = req.params;
  const filteredRooms = Object.entries(rooms)
    .filter(([, room]) => room.serverId === serverId)
    .map(([roomName, room]) => ({
      roomName,
      ...room,
    }));

  res.json(filteredRooms);
});

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2400, // 401 порт
  });

  console.log(`worker pid ${worker.pid}`);

  worker.on("died", (error) => {
    // This implies something serious happened, so kill the application
    console.error("mediasoup worker has died");
    setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
  });

  return worker;
};

worker = createWorker();

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

connections.on("connection", async (socket) => {
  const notifyUsersList = (serverId) => {
    const server = servers[serverId];
    const serverUsers = serversUser[serverId];

    if (!server || !serverUsers) return;

    const roomUsersList = server.roomNames.map((roomName) => {
      const users = producers
        .filter(
          ({ roomName: producerRoomName }) => producerRoomName === roomName
        )
        .map(({ socketId, userName, producer }) => ({
          socketId,
          userName,
          producerId: producer.id,
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

  //console.log(socket.id);

  //notifyUsersList();

  socket.emit("connection-success", {
    socketId: socket.id,
  });

  let currentServerId = null;

  socket.on("setServer", ({ serverId, userName }) => {
    for (const otherServerId in serversUser) {
      if (serversUser.hasOwnProperty(otherServerId)) {
        serversUser[otherServerId].users = serversUser[
          otherServerId
        ].users.filter((user) => user.socketId !== socket.id);
        notifyUsersList(otherServerId);
      }
    }

    if (!serversUser[serverId]) {
      serversUser[serverId] = { users: [] };
    }

    const isUserAlreadyOnServer = serversUser[serverId].users.some(
      (user) => user.socketId === socket.id
    );

    if (!isUserAlreadyOnServer) {
      serversUser[serverId].users.push({
        socketId: socket.id,
        userName: userName,
        roomName: null,
      });
    }

    notifyUsersList(serverId);
  });

  const removeItems = (items, socketId, type) => {
    items.forEach((item) => {
      if (item.socketId === socket.id) {
        item[type].close();
      }
    });
    items = items.filter((item) => item.socketId !== socket.id);

    return items;
  };

  socket.on("leaveRoom", () => {
    //console.log("peer leaving room");

    // Удаление consumers, producers, и transports, связанных с пользователем
    consumers = removeItems(consumers, socket.id, "consumer");
    producers = removeItems(producers, socket.id, "producer");
    transports = removeItems(transports, socket.id, "transport");

    if (peers[socket.id]) {
      const { roomName } = peers[socket.id];
      delete peers[socket.id];

      rooms[roomName] = {
        router: rooms[roomName].router,
        audioLevelObserver: rooms[roomName].audioLevelObserver,
        peers: rooms[roomName].peers.filter(
          (socketId) => socketId !== socket.id
        ),
      };
    }

    notifyUsersList(currentServerId);
  });

  socket.on("disconnect", () => {
    //console.log("peer disconnected");
    consumers = removeItems(consumers, socket.id, "consumer");
    producers = removeItems(producers, socket.id, "producer");
    transports = removeItems(transports, socket.id, "transport");

    /*const { roomName } = peers[socket.id];
    delete peers[socket.id];

    rooms[roomName] = {
      router: rooms[roomName].router,
      peers: rooms[roomName].peers.filter((socketId) => socketId !== socket.id),
    };*/

    // Проверка, подключён ли пользователь к комнате
    if (peers[socket.id]) {
      const { roomName } = peers[socket.id];

      delete peers[socket.id];

      rooms[roomName] = {
        router: rooms[roomName].router,
        audioLevelObserver: rooms[roomName].audioLevelObserver,
        peers: rooms[roomName].peers.filter(
          (socketId) => socketId !== socket.id
        ),
      };
    }

    notifyUsersList(currentServerId);
  });

  socket.on("joinRoom", async ({ roomName, userName, serverId }, callback) => {
    //console.log("joinRoom", userName);
    currentServerId = serverId;
    const router1 = await createRoom(roomName, socket.id, serverId);

    peers[socket.id] = {
      socket,
      roomName, // Name for the Router this Peer joined
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: userName || "Anonymous",
        isAdmin: false, // Is this Peer the Admin?
      },
    };

    const rtpCapabilities = router1.rtpCapabilities;

    callback({ rtpCapabilities });
  });

  const notifyRoomPeers = (roomName, event, data) => {
    const roomPeers = rooms[roomName]?.peers || [];

    roomPeers.forEach((socketId) => {
      const peer = peers[socketId];
      if (peer?.socket) {
        peer.socket.emit(event, data);
      }
    });
  };

  const createRoom = async (roomName, socketId, serverId) => {
    let router1;
    let peers = [];

    let audioLevelObserver;

    if (rooms[roomName]) {
      router1 = rooms[roomName].router;
      peers = rooms[roomName].peers || [];

      audioLevelObserver = rooms[roomName].audioLevelObserver;
    } else {
      router1 = await worker.createRouter({ mediaCodecs });

      audioLevelObserver = await router1.createAudioLevelObserver({
        maxEntries: 99, // Максимум пользователей для отслеживания
        threshold: -80, // Порог громкости в децибелах
        interval: 400, // Интервал обновления данных в миллисекундах
      });

      // Обработчик событий для отслеживания громкости
      audioLevelObserver.on("volumes", (volumes) => {
        const activeSpeakers = volumes.map(({ producer, volume }) => ({
          producerId: producer.id,
          volume,
        }));

        // Отправляем информацию всем клиентам в комнате
        //connections.emit("active-speakers", { activeSpeakers });
        notifyRoomPeers(roomName, "active-speakers", { activeSpeakers });
      });

      audioLevelObserver.on("silence", () => {
        // Уведомление о тишине
        //connections.emit("active-speakers", { activeSpeakers: [] });
        notifyRoomPeers(roomName, "active-speakers", { activeSpeakers: [] });
      });

      if (!servers[serverId]) {
        servers[serverId] = { roomNames: [] };
      }
      if (!servers[serverId].roomNames.includes(roomName)) {
        servers[serverId].roomNames.push(roomName);
      }
    }

    //console.log(`Router ID: ${router1.id}`, peers.length);

    rooms[roomName] = {
      router: router1,
      peers: [...peers, socketId],
      audioLevelObserver,
    };

    return router1;
  };

  socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
    const roomName = peers[socket.id].roomName;

    const router = rooms[roomName].router;

    createWebRtcTransport(router).then(
      (transport) => {
        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
        addTransport(transport, roomName, consumer);
      },
      (error) => {
        console.log(error);
      }
    );
  });

  const addTransport = (transport, roomName, consumer) => {
    transports = [
      ...transports,
      { socketId: socket.id, transport, roomName, consumer },
    ];

    peers[socket.id] = {
      ...peers[socket.id],
      transports: [...peers[socket.id].transports, transport.id],
    };
  };

  const addProducer = (producer, roomName, name) => {
    producers = [
      ...producers,
      { socketId: socket.id, producer, roomName, userName: name },
    ];

    peers[socket.id] = {
      ...peers[socket.id],
      producers: [...peers[socket.id].producers, producer.id],
    };

    // Подключаем аудио-продюсера к audioLevelObserver
    const { audioLevelObserver } = rooms[roomName];
    if (producer.kind === "audio") {
      audioLevelObserver
        .addProducer({ producerId: producer.id })
        .catch((err) => {
          console.error("Failed to add producer to audioLevelObserver:", err);
        });
    }
  };

  const addConsumer = (consumer, roomName) => {
    consumers = [...consumers, { socketId: socket.id, consumer, roomName }];

    peers[socket.id] = {
      ...peers[socket.id],
      consumers: [...peers[socket.id].consumers, consumer.id],
    };
  };

  socket.on("getProducers", (callback) => {
    const { roomName } = peers[socket.id];

    let producerList = [];
    producers.forEach((producerData) => {
      if (
        producerData.socketId !== socket.id &&
        producerData.roomName === roomName
      ) {
        producerList = [...producerList, producerData.producer.id];
      }
    });
    callback(producerList);
  });

  const informConsumers = (roomName, socketId, id) => {
    //console.log(`just joined, id ${id} ${roomName}, ${socketId}`);

    // Используем Set для хранения уникальных id продюсеров
    const uniqueProducers = new Set();

    //console.log("producers: ", producers);

    producers.forEach((producerData) => {
      if (
        producerData.socketId !== socketId &&
        producerData.roomName === roomName &&
        !uniqueProducers.has(producerData.socketId) // Проверяем, был ли этот id уже отправлен
      ) {
        uniqueProducers.add(producerData.socketId); // Добавляем id в Set
        const producerSocket = peers[producerData.socketId].socket;
        //console.log("new-producer: ", producerSocket);
        producerSocket.emit("new-producer", { producerId: id });
      }
    });

    notifyUsersList(currentServerId);
  };

  const getTransport = (socketId) => {
    const [producerTransport] = transports.filter(
      (transport) => transport.socketId === socketId && !transport.consumer
    );
    return producerTransport.transport;
  };

  socket.on("transport-connect", ({ dtlsParameters }) => {
    //console.log("DTLS PARAMS... ", { dtlsParameters });

    getTransport(socket.id).connect({ dtlsParameters });
  });

  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      const producer = await getTransport(socket.id).produce({
        kind,
        rtpParameters,
      });

      const { roomName, peerDetails } = peers[socket.id];

      addProducer(producer, roomName, peerDetails.name);

      informConsumers(roomName, socket.id, producer.id);

      //console.log("Producer ID: ", producer.id, producer.kind);

      producer.on("transportclose", () => {
        //console.log("transport for this producer closed ");
        producer.close();
      });

      callback({
        id: producer.id,
        producersExist: producers.length > 1 ? true : false,
      });
    }
  );

  socket.on(
    "transport-recv-connect",
    async ({ dtlsParameters, serverConsumerTransportId }) => {
      //console.log(`DTLS PARAMS: ${dtlsParameters}`);
      const consumerTransport = transports.find(
        (transportData) =>
          transportData.consumer &&
          transportData.transport.id == serverConsumerTransportId
      ).transport;
      await consumerTransport.connect({ dtlsParameters });
    }
  );

  socket.on("stopProducer", ({ producerId }) => {
    const producer = producers.find((p) => p.producer.id === producerId);
    if (producer) {
      producer.producer.close();
      producers = producers.filter((p) => p.producer.id !== producerId);
      //console.log(`Producer ${producerId} закрыт и удалён.`);

      //socket.broadcast.emit("producerClosed", { producerId });

      producers
        .filter((p) => p.roomName === producer.roomName)
        .forEach((p) => {
          const producerSocket = peers[p.socketId].socket;
          if (producerSocket) {
            producerSocket.emit("producerClosed", { producerId });
          }
        });
    }

    notifyUsersList(currentServerId);
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
        const { roomName } = peers[socket.id];
        const router = rooms[roomName].router;
        let consumerTransport = transports.find(
          (transportData) =>
            transportData.consumer &&
            transportData.transport.id == serverConsumerTransportId
        ).transport;

        if (
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

          consumer.on("transportclose", () => {
            console.log("transport close from consumer");
          });

          consumer.on("producerclose", () => {
            //console.log("producer of consumer closed", remoteProducerId);
            socket.emit("producer-closed", {
              remoteProducerId: remoteProducerId,
            });

            consumerTransport.close([]);
            transports = transports.filter(
              (transportData) =>
                transportData.transport.id !== consumerTransport.id
            );
            consumer.close();
            consumers = consumers.filter(
              (consumerData) => consumerData.consumer.id !== consumer.id
            );
          });

          // Найдите username, связанный с `remoteProducerId`
          const producerData = producers.find(
            (producer) => producer.producer.id === remoteProducerId
          );
          const userName = producerData ? producerData.userName : "Unknown";

          addConsumer(consumer, roomName);
          const params = {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
            userName, // передаем имя пользователя
          };
          callback({ params });
        }
      } catch (error) {
        console.log(error.message);
        callback({
          params: {
            error: error,
          },
        });
      }
    }
  );

  socket.on("consumer-resume", async ({ serverConsumerId }) => {
    //console.log("consumer resume");
    const { consumer } = consumers.find(
      (consumerData) => consumerData.consumer.id === serverConsumerId
    );
    await consumer.resume();
  });
});

const createWebRtcTransport = async (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: "0.0.0.0",
            announcedIp: "91.203.232.124",
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        stunServers: [{ urls: "stun:stun.l.google.com:19302" }],
      };

      let transport = await router.createWebRtcTransport(
        webRtcTransport_options
      );
      //console.log(`transport id: ${transport.id}`);

      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          transport.close();
        }
      });

      transport.on("close", () => {
        console.log("transport closed");
      });

      resolve(transport);
    } catch (error) {
      reject(error);
    }
  });
};
