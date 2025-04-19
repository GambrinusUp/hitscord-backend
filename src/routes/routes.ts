import express, { Router, Request, Response } from "express";
import { store } from "../store/store";

const router: Router = express.Router();

router.post("/rooms/create", (req: Request, res: Response) => {
  const { roomName, serverId } = req.body;

  if (!roomName) {
    res.status(400).json({ error: "roomName is required" });
    return;
  }

  if (store.rooms[roomName]) {
    res.status(409).json({ message: "Room already exists" });
    return;
  }

  store.rooms[roomName] = {
    serverId,
    router: null,
    peers: [],
  };

  res.status(201).json({
    message: `Room '${roomName}' created successfully with serverId '${serverId}'`,
  });
});

router.get("/rooms", (req: Request, res: Response) => {
  const roomList = Object.entries(store.rooms).map(([roomName, room]) => ({
    roomName,
    ...room,
  }));

  res.json(roomList);
});

router.get("/rooms/:serverId", (req: Request, res: Response) => {
  const { serverId } = req.params;
  const filteredRooms = Object.entries(store.rooms)
    .filter(([, room]) => room.serverId === serverId)
    .map(([roomName, room]) => ({
      roomName,
      ...room,
    }));

  res.json(filteredRooms);
});

export default router;
