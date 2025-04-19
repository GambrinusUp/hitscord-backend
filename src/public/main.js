import { Device } from "/node_modules/mediasoup-client/lib/Device.js";

// Добавьте эти переменные в нужное место в вашем коде
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

    // Ждем параметры WebRTC транспорта от сервера
    socket.on(
      "transportCreated",
      async ({
        sendTransportOptions,
        recvTransportOptions,
        routerRtpCapabilities,
      }) => {
        // Установка устройства Mediasoup
        await loadDevice(routerRtpCapabilities);

        // Создание транспортов для отправки и приема медиа
        sendTransport = await createSendTransport(socket, sendTransportOptions);
        recvTransport = await createRecvTransport(socket, recvTransportOptions);

        // Получаем локальный медиапоток
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        addParticipantVideo("local", localStream);

        // Отправляем медиа потоки на сервер
        for (const track of localStream.getTracks()) {
          const producer = await sendTransport.produce({ track });
          socket.emit("sendTrack", {
            producerId: producer.id,
            kind: track.kind,
          });
        }
      }
    );

    // Получение медиапотоков от других участников
    socket.on("newProducer", async ({ producerId, kind }) => {
      const consumer = await consume(socket, producerId, kind);
      const remoteStream = new MediaStream([consumer.track]);
      addParticipantVideo(producerId, remoteStream);
    });
  } else {
    alert("Please enter your name and room ID");
  }
});

// Функция для загрузки устройства Mediasoup
const loadDevice = async (routerRtpCapabilities) => {
  try {
    device = new Device();
    await device.load({ routerRtpCapabilities });
  } catch (error) {
    console.error("Error loading device", error);
  }
};

// Создание WebRTC транспорта для отправки медиа
const createSendTransport = async (socket, transportOptions) => {
  return device.createSendTransport(transportOptions);
};

// Создание WebRTC транспорта для приема медиа
const createRecvTransport = async (socket, transportOptions) => {
  return device.createRecvTransport(transportOptions);
};

// Подписка на медиа-поток (создание consumer)
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
