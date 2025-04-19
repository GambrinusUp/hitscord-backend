import { createWorker } from "mediasoup";

export const createsWorker = async () => {
  const worker = await createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2400, // 401 порт
  });

  console.log(`worker pid ${worker.pid}`);

  worker.on("died", (error) => {
    // This implies something serious happened, so kill the application
    console.error("mediasoup worker has died: ", error.message);
    setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
  });

  return worker;
};
