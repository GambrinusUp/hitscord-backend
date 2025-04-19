import { Router } from "mediasoup/node/lib/RouterTypes";
import { AppData, WebRtcTransport } from "mediasoup/node/lib/types";
import { ANNOUNCED_IP } from "../constants";

export const createWebRtcTransport = async (
  router: Router
): Promise<WebRtcTransport<AppData>> => {
  return new Promise(async (resolve, reject) => {
    try {
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: "0.0.0.0",
            announcedIp: ANNOUNCED_IP,
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

      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          transport.close();
        }
      });

      resolve(transport);
    } catch (error) {
      reject(error);
    }
  });
};
