import { Socket } from "socket.io";
import {
  RoomData,
  PeerInfo,
  TransportInfo,
  ProducerInfo,
  ConsumerInfo,
  ServerUsersInfo,
  ServerInfo,
} from "./store.types";
import { Router } from "mediasoup/node/lib/RouterTypes";
import { AudioLevelObserver } from "mediasoup/node/lib/AudioLevelObserverTypes";
import { Consumer, Producer, WebRtcTransport } from "mediasoup/node/lib/types";

class InMemoryStore {
  rooms: Record<string, RoomData> = {};
  peers: Record<string, PeerInfo> = {};
  transports: TransportInfo[] = [];
  producers: ProducerInfo[] = [];
  consumers: ConsumerInfo[] = [];
  serversUser: Record<string, ServerUsersInfo> = {};
  servers: Record<string, ServerInfo> = {};
  store: any;

  reset() {
    this.rooms = {};
    this.peers = {};
    this.transports = [];
    this.producers = [];
    this.consumers = [];
    this.serversUser = {};
    this.servers = {};
  }

  removeTransport(socketId: string) {
    this.transports = this.transports.filter((item) => {
      if (item.socketId === socketId) {
        item.transport.close();
        return false;
      }
      return true;
    });
  }

  removeProducer(socketId: string) {
    this.producers = this.producers.filter((item) => {
      if (item.socketId === socketId) {
        item.producer.close();
        return false;
      }
      return true;
    });
  }

  removeConsumer(socketId: string) {
    this.consumers = this.consumers.filter((item) => {
      if (item.socketId === socketId) {
        item.consumer.close();
        return;
      }
      return true;
    });
  }

  removePeer(socketId: string) {
    if (this.peers[socketId]) {
      const { roomName } = this.peers[socketId];
      delete this.peers[socketId];

      if (this.rooms[roomName]) {
        this.rooms[roomName] = {
          serverId: this.rooms[roomName].serverId,
          router: this.rooms[roomName].router,
          audioLevelObserver: this.rooms[roomName].audioLevelObserver,
          peers: this.rooms[roomName].peers.filter(
            (peerSocketId) => peerSocketId !== socketId
          ),
        };

        // Если комната стала пустой, можно удалить её
        /* if (this.rooms[roomName].peers.length === 0) {
          delete this.rooms[roomName];
        } */
      }
    }
  }

  addPeer(socket: Socket, roomName: string, userName: string, userId: string) {
    this.peers[socket.id] = {
      socket,
      roomName,
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: userName || "Anonymous",
        userId,
        isAdmin: false,
      },
    };
  }

  updateRoomPeers(roomName: string, socketId: string) {
    const room = this.rooms[roomName];
    if (!room) return;

    if (!room.peers.includes(socketId)) {
      room.peers.push(socketId);
    }
  }

  addRoom(
    roomName: string,
    router: Router,
    socketId: string,
    audioLevelObserver: AudioLevelObserver,
    serverId: string
  ) {
    this.rooms[roomName] = {
      router,
      peers: [socketId],
      audioLevelObserver,
      serverId,
    };
  }

  registerRoomToServer(serverId: string, roomName: string) {
    if (!this.servers[serverId]) {
      this.servers[serverId] = { roomNames: [] };
    }

    const server = this.servers[serverId];
    if (!server.roomNames.includes(roomName)) {
      server.roomNames.push(roomName);
    }
  }

  addTransport = (
    transport: WebRtcTransport,
    roomName: string,
    consumer: boolean,
    socketId: string
  ) => {
    this.transports = [
      ...this.transports,
      { socketId, transport, roomName, consumer },
    ];

    this.peers[socketId] = {
      ...this.peers[socketId],
      transports: [...this.peers[socketId].transports, transport.id],
    };
  };

  addProducer = (
    producer: Producer,
    roomName: string,
    name: string,
    socketId: string,
    source?: "screen-video" | "screen-audio" | "microphone" | "camera",
    userId?: string
  ) => {
    this.producers = [
      ...this.producers,
      { socketId, producer, roomName, userName: name, userId, source },
    ];

    this.peers[socketId] = {
      ...this.peers[socketId],
      producers: [...this.peers[socketId].producers, producer.id],
    };

    const { audioLevelObserver } = this.rooms[roomName];
    if (
      producer.kind === "audio" &&
      audioLevelObserver &&
      source !== "screen-audio"
    ) {
      audioLevelObserver
        .addProducer({ producerId: producer.id })
        .catch((err) => {
          console.error("Failed to add producer to audioLevelObserver:", err);
        });
    }
  };

  addConsumer = (consumer: Consumer, roomName: string, socketId: string) => {
    this.consumers = [...this.consumers, { socketId, consumer, roomName }];

    this.peers[socketId] = {
      ...this.peers[socketId],
      consumers: [...this.peers[socketId].consumers, consumer.id],
    };
  };

  getProducers(socketId: string) {
    const { roomName } = this.peers[socketId];

    let producerList: string[] = [];

    this.producers.forEach((producerData) => {
      if (
        producerData.socketId !== socketId &&
        producerData.roomName === roomName
      ) {
        producerList = [...producerList, producerData.producer.id];
      }
    });

    return producerList;
  }

  getTransport = (socketId: string) => {
    const [producerTransport] = this.transports.filter(
      (transport) => transport.socketId === socketId && !transport.consumer
    );

    return producerTransport.transport;
  };

  getConsumerTransport(serverConsumerTransportId: string): WebRtcTransport {
    const transportInfo = this.transports.find(
      (transportData) =>
        transportData.consumer &&
        transportData.transport.id === serverConsumerTransportId
    );

    if (!transportInfo) {
      throw new Error(
        `Consumer transport with ID ${serverConsumerTransportId} not found`
      );
    }

    return transportInfo.transport;
  }

  stopProducer(producerId: string) {
    const producerInfo = this.producers.find(
      (p) => p.producer.id === producerId
    );

    if (producerInfo) {
      producerInfo.producer.close();
      this.producers = this.producers.filter(
        (p) => p.producer.id !== producerId
      );
    }
  }

  notifyProducerClosed(producerId: string, roomName: string) {
    this.producers
      .filter((p) => p.roomName === roomName)
      .forEach((p) => {
        const producerSocket = this.peers[p.socketId]?.socket;
        if (producerSocket) {
          producerSocket.emit("producerClosed", { producerId });
        }
      });
  }

  getRoomData(socketId: string) {
    const peer = this.peers[socketId];

    const { roomName } = peer;
    const room = this.rooms[roomName];

    return { roomName, router: room.router };
  }

  closeProducer(consumerTransportId: string, consumerId: string) {
    this.transports = this.transports.filter(
      (transportData) => transportData.transport.id !== consumerTransportId
    );

    this.consumers = this.consumers.filter(
      (consumerData) => consumerData.consumer.id !== consumerId
    );
  }
}

export const store = new InMemoryStore();
