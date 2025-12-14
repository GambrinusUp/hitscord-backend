import { Device } from "/node_modules/mediasoup-client/lib/Device.js";

let device;
let sendTransport;
let recvTransport;

document.getElementById("join-button").addEventListener("click", async () => {
  const username = document.getElementById("username").value;
  const roomId = document.getElementById("room-id").value;
  console.log(username, roomId);
  if (username && roomId) {
    const socket = io();
    socket.emit("joinRoom", { username, roomId });

    socket.on(
      "transportCreated",
      async ({
        sendTransportOptions,
        recvTransportOptions,
        routerRtpCapabilities,
      }) => {
        await loadDevice(routerRtpCapabilities);

        sendTransport = await createSendTransport(socket, sendTransportOptions);
        recvTransport = await createRecvTransport(socket, recvTransportOptions);

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        addParticipantVideo("local", localStream);

        for (const track of localStream.getTracks()) {
          const producer = await sendTransport.produce({ track });
          socket.emit("sendTrack", {
            producerId: producer.id,
            kind: track.kind,
          });
        }
      }
    );

    socket.on("newProducer", async ({ producerId, kind }) => {
      const consumer = await consume(socket, producerId, kind);
      const remoteStream = new MediaStream([consumer.track]);
      addParticipantVideo(producerId, remoteStream);
    });
  } else {
    alert("Please enter your name and room ID");
  }
});

const loadDevice = async (routerRtpCapabilities) => {
  try {
    device = new Device();
    await device.load({ routerRtpCapabilities });
  } catch (error) {
    console.error("Error loading device", error);
  }
};

const createSendTransport = async (socket, transportOptions) => {
  return device.createSendTransport(transportOptions);
};

const createRecvTransport = async (socket, transportOptions) => {
  return device.createRecvTransport(transportOptions);
};

const consume = async (socket, producerId, kind) => {
  return new Promise((resolve, reject) => {
    socket.emit(
      "consumeTrack",
      { producerId, rtpCapabilities: device.rtpCapabilities },
      async (response) => {
        if (response.error) {
          reject(response.error);
        } else {
          const { id, rtpParameters } = response;
          const consumer = await recvTransport.consume({
            id,
            kind,
            rtpParameters,
          });
          resolve(consumer);
        }
      }
    );
  });
};

const addParticipantVideo = (id, stream) => {
  const videoElement = document.createElement("video");
  videoElement.id = id;
  videoElement.srcObject = stream;
  videoElement.autoplay = true;
  document.getElementById("participant-view").appendChild(videoElement);
};
