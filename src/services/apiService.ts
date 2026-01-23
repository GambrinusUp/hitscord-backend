import axios, { AxiosError, AxiosResponse } from "axios";
import { API_URL } from "../constants";

export const joinVoiceChannel = async (
  voiceChannelId: string,
  accessToken: string
): Promise<AxiosResponse> => {
  try {
    const response = await axios.post(
      `${API_URL}/channel/voice/join`,
      {
        voiceChannelId,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response;
  } catch (error: any) {
    console.error(error);
    if (error instanceof AxiosError) {
      throw new Error(
        `Request failed with status code ${error.response?.status}: ${error.message}`
      );
    } else {
      throw new Error(`Unknown error: ${error.data.message}`);
    }
  }
};

export const removeVoiceChannel = async (
  voiceChannelId: string,
  accessToken: string
): Promise<AxiosResponse> => {
  try {
    const response = await axios.delete(`${API_URL}/channel/voice/remove`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      data: {
        voiceChannelId,
      },
    });

    return response;
  } catch (error: any) {
    console.error(error);
    if (error instanceof AxiosError) {
      throw new Error(
        `Request failed with status code ${error.response?.status}: ${error.message}`
      );
    } else {
      throw new Error(`Unknown error: ${error.data.message}`);
    }
  }
};

export const toggleStream = async (
  accessToken: string
): Promise<AxiosResponse> => {
  try {
    const response = await axios.put(
      `${API_URL}/channel/voice/stream`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response;
  } catch (error: any) {
    console.error(error);
    if (error instanceof AxiosError) {
      throw new Error(
        `Request failed with status code ${error.response?.status}: ${error.message}`
      );
    } else {
      throw new Error(`Unknown error: ${error.data.message}`);
    }
  }
};

export const muteUser = async (
  userId: string,
  accessToken: string
): Promise<AxiosResponse> => {
  try {
    const response = await axios.put(
      `${API_URL}/channel/voice/mute/user`,
      {
        userId,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response;
  } catch (error: any) {
    console.error(error);
    if (error instanceof AxiosError) {
      throw new Error(
        `Request failed with status code ${error.response?.status}: ${error.message}`
      );
    } else {
      throw new Error(`Unknown error: ${error.data.message}`);
    }
  }
};
