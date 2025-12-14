import { createWorker } from "mediasoup";
import { RTC_MAX_PORT, RTC_MIN_PORT } from "../constants";

export const createsWorker = async () => {
  const worker = await createWorker({
    rtcMinPort: RTC_MIN_PORT,
    rtcMaxPort: RTC_MAX_PORT,
  });

  console.log(`worker pid ${worker.pid}`);

  worker.on("died", (error) => {
    // This implies something serious happened, so kill the application
    console.error("mediasoup worker has died: ", error.message);
    setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
  });

  return worker;
};
