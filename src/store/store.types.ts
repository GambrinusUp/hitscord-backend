import {
  AudioLevelObserver,
  Consumer,
  Producer,
  Router,
  WebRtcTransport,
} from "mediasoup/node/lib/types";
import { Socket } from "socket.io";

export interface RoomData {
  serverId: string;
  router: Router | null;
  peers: string[];
  audioLevelObserver?: AudioLevelObserver;
}

export interface PeerInfo {
  socket: Socket;
  roomName: string;
  transports: string[];
  producers: string[];
  consumers: string[];
  peerDetails: {
    name: string;
    userId: string;
    isAdmin: boolean;
  };
}

export interface TransportInfo {
  socketId: string;
  transport: WebRtcTransport;
  roomName: string;
  consumer: boolean;
}

export interface ProducerInfo {
  socketId: string;
  producer: Producer;
  roomName: string;
  userName: string;
  userId?: string;
  source?: "screen-video" | "screen-audio" | "microphone" | "camera";
}

export interface ConsumerInfo {
  socketId: string;
  consumer: Consumer;
  roomName: string;
}

export interface ServerUsersInfo {
  users: {
    socketId: string;
    userName: string;
    userId: string;
    roomName: string | null;
  }[];
}

export interface ServerInfo {
  roomNames: string[];
}
