import { Server } from "socket.io";
import * as Y from "yjs";
import { DebouncedFunc } from "lodash";
import _ from "lodash";
import { saveDocumentContent } from "../../helpers/forms/formControllerHelpers";

interface JoinRoomData {
  roomId: string;
}

// Assuming docs is a Map where each document is associated with a room ID.
const docs = new Map<string, Y.Doc>();

export const setUpRealTimeCollaboration = (io: Server) => {
  io.on("connection", (socket) => {
    socket.on("joinRoom", async (data: JoinRoomData) => {
      const { roomId } = data;

      if (!docs.has(roomId)) {
        const ydoc = new Y.Doc();
        docs.set(roomId, ydoc);

        // Setup listener for Yjs updates
        ydoc.on("update", () => {
          const encodedUpdate = Y.encodeStateAsUpdate(ydoc);
          socket.to(roomId).emit("documentUpdate", encodedUpdate);
          void debounceSaveChanges(roomId, ydoc);
        });
      }

      const ydoc = docs.get(roomId);
      await socket.join(roomId);

      if (!ydoc) return;

      socket.emit("initialContent", Y.encodeStateAsUpdate(ydoc));

      socket.on("edit", (update: Uint8Array) => {
        if (ydoc) {
          Y.applyUpdate(ydoc, update);
        } else {
          console.error("Document is undefined");
        }
      });
    });
  });

  const saveInterval = 5000;

  const saveChanges = async (roomId: string, ydoc: Y.Doc): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const content = ydoc.getText("formContent").toString();
    await saveDocumentContent(roomId, content);
  };

  const debounceSaveChanges: DebouncedFunc<typeof saveChanges> = _.debounce(
    saveChanges,
    saveInterval,
    {
      leading: false,
      trailing: true,
    }
  );

};
