import * as _ from 'lodash';
import * as iconvLite from 'iconv-lite';
import { toHalfwidth } from './fullwidth';
import { decode } from './ubjson';

export const Commands = {
  MESSAGE_SIZES: 53,
  GAME_START: 54,
  PRE_FRAME_UPDATE: 55,
  POST_FRAME_UPDATE: 56,
  GAME_END: 57,
};

export type SlpFileType = {
  dataBuffer: ArrayBuffer;
  rawDataPosition: number;
  rawDataLength: number;
  metadataPosition: number;
  metadataLength: number;
  messageSizes: { [command: number]: number };
};

export type PlayerType = {
  playerIndex: number;
  port: number;
  characterId: number | null;
  characterColor: number | null;
  startStocks: number | null;
  type: number | null;
  teamId: number | null;
  controllerFix: string | null;
  nametag: string | null;
};

export type GameStartType = {
  isTeams: boolean | null;
  isPAL: boolean | null;
  stageId: number | null;
  players: PlayerType[];
};

export type PreFrameUpdateType = {
  frame: number | null;
  playerIndex: number | null;
  isFollower: boolean | null;
  seed: number | null;
  actionStateId: number | null;
  positionX: number | null;
  positionY: number | null;
  facingDirection: number | null;
  joystickX: number | null;
  joystickY: number | null;
  cStickX: number | null;
  cStickY: number | null;
  trigger: number | null;
  buttons: number | null;
  physicalButtons: number | null;
  physicalLTrigger: number | null;
  physicalRTrigger: number | null;
  percent: number | null;
};

export type PostFrameUpdateType = {
  frame: number | null;
  playerIndex: number | null;
  isFollower: boolean | null;
  internalCharacterId: number | null;
  actionStateId: number | null;
  positionX: number | null;
  positionY: number | null;
  facingDirection: number | null;
  percent: number | null;
  shieldSize: number | null;
  lastAttackLanded: number | null;
  currentComboCount: number | null;
  lastHitBy: number | null;
  stocksRemaining: number | null;
  actionStateCounter: number | null;
};

export type GameEndType = {
  gameEndMethod: number | null;
};

export type MetadataType = {
  startAt?: string;
  playedOn?: string;
  lastFrame?: number;
  players?: {
    [playerIndex: number]: {
      characters: {
        [internalCharacterId: number]: number;
      };
    };
  };
};

/**
 * Opens a file at path
 */
export function readSlpData(arrayBuffer: ArrayBuffer): SlpFileType {
  const rawDataPosition = getRawDataPosition(arrayBuffer);
  const rawDataLength = getRawDataLength(arrayBuffer, rawDataPosition);
  const metadataPosition = rawDataPosition + rawDataLength + 10;
  const metadataLength = getMetadataLength(arrayBuffer, metadataPosition);
  const messageSizes = getMessageSizes(arrayBuffer, rawDataPosition);

  return {
    rawDataPosition,
    rawDataLength,
    metadataPosition,
    metadataLength,
    messageSizes,
    dataBuffer: arrayBuffer,
  };
}

// This function gets the position where the raw data starts
function getRawDataPosition(arrayBuffer: ArrayBuffer) {
  const buffer = new Uint8Array(arrayBuffer, 0, 1);

  if (buffer[0] === 0x36) {
    return 0;
  }

  if (buffer[0] !== '{'.charCodeAt(0)) {
    return 0; // return error?
  }

  return 15;
}

function getRawDataLength(arrayBuffer: ArrayBuffer, position: number) {
  const fileSize = arrayBuffer.byteLength;
  if (position === 0) {
    return fileSize;
  }

  const endBytes = new Uint8Array(arrayBuffer, fileSize - 2, 2);

  const endFileByte = '}'.charCodeAt(0);
  if (endBytes[0] !== endFileByte && endBytes[1] !== endFileByte) {
    // If the two final bytes do not close out the UBJSON file,
    // return a file size based on file length. This enables
    // some support for severed files
    return fileSize - position;
  }

  const buffer = new Uint8Array(arrayBuffer, position - 4, 4);

  return (buffer[0] << 24) | (buffer[1] << 16) | (buffer[2] << 8) | buffer[3];
}

function getMetadataLength(arrayBuffer: ArrayBuffer, position: number) {
  const fileSize = arrayBuffer.byteLength;
  return fileSize - position - 1;
}

function getMessageSizes(
  arrayBuffer: ArrayBuffer,
  position: number,
): { [command: number]: number } {
  const messageSizes: { [command: number]: number } = {};
  // Support old file format
  if (position === 0) {
    messageSizes[Commands.GAME_START] = 0x140;
    messageSizes[Commands.PRE_FRAME_UPDATE] = 0x6;
    messageSizes[Commands.POST_FRAME_UPDATE] = 0x46;
    messageSizes[Commands.GAME_END] = 0x1;
    return messageSizes;
  }

  const buffer = new Uint8Array(arrayBuffer, position, 2);

  if (buffer[0] !== Commands.MESSAGE_SIZES) {
    return {};
  }

  const payloadLength = buffer[1];
  messageSizes[Commands.MESSAGE_SIZES] = payloadLength;

  const messageSizesBuffer = new Uint8Array(arrayBuffer, position + 2, payloadLength - 1);

  for (let i = 0; i < payloadLength - 1; i += 3) {
    const command = messageSizesBuffer[i];

    // Get size of command
    messageSizes[command] = (messageSizesBuffer[i + 1] << 8) | messageSizesBuffer[i + 2];
  }

  return messageSizes;
}

type EventPayloadTypes = GameStartType | PreFrameUpdateType | PostFrameUpdateType | GameEndType;
type EventCallbackFunc = (command: number, payload?: EventPayloadTypes) => boolean;

/**
 * Iterates through slp events and parses payloads
 */
export function iterateEvents(slpFile: SlpFileType, callback: EventCallbackFunc) {
  const arrayBuffer = slpFile.dataBuffer;

  let readPosition = slpFile.rawDataPosition;
  const stopReadingAt = readPosition + slpFile.rawDataLength;

  // Generate read buffers for each
  const commandPayloadBuffers = _
    .mapValues(slpFile.messageSizes, (size) => new Uint8Array(size + 1));

  while (readPosition < stopReadingAt) {
    // $FlowFixMe
    const commandByteBuffer = new Uint8Array(arrayBuffer, readPosition, 1);
    const commandByte = commandByteBuffer[0];
    const buffer = commandPayloadBuffers[commandByte];
    if (buffer === undefined) {
      // If we don't have an entry for this command, return false to indicate failed read
      return false;
    }

    const otherBuffer = new Uint8Array(arrayBuffer, readPosition, buffer.length);

    // I have no clue why I need to do this but if I don't, every parseMessage always returns the same wrong data
    const anotherOne = Uint8Array.from(otherBuffer);

    const parsedPayload = parseMessage(commandByte, anotherOne);

    const shouldStop = callback(commandByte, parsedPayload);
    if (shouldStop) {
      break;
    }

    readPosition += buffer.length;
  }

  return true;
}

//

function parseMessage(command: number, payload: Uint8Array): EventPayloadTypes | undefined {
  const view = new DataView(payload.buffer);
  switch (command) {
    case Commands.GAME_START:
      return {
        isTeams: readBool(view, 0xd),
        isPAL: readBool(view, 0x1a1),
        stageId: readUint16(view, 0x13),
        players: _.map([0, 1, 2, 3], (playerIndex) => {
          // Controller Fix stuff
          const cfOffset = playerIndex * 0x8;
          const dashback = readUint32(view, 0x141 + cfOffset);
          const shieldDrop = readUint32(view, 0x145 + cfOffset);
          let cfOption = 'None';
          if (dashback !== shieldDrop) {
            cfOption = 'Mixed';
          } else if (dashback === 1) {
            cfOption = 'UCF';
          } else if (dashback === 2) {
            cfOption = 'Dween';
          }

          // Nametag stuff
          const nametagOffset = playerIndex * 0x10;
          const nametagStart = 0x161 + nametagOffset;
          const nametagBuf = payload.slice(nametagStart, nametagStart + 16);
          const nametag = toHalfwidth(
            iconvLite
              // @ts-ignore
              .decode(nametagBuf, 'Shift_JIS')
              .split('\0')
              .shift(),
          );

          const offset = playerIndex * 0x24;
          return {
            nametag,
            playerIndex,
            port: playerIndex + 1,
            characterId: readUint8(view, 0x65 + offset),
            characterColor: readUint8(view, 0x68 + offset),
            startStocks: readUint8(view, 0x67 + offset),
            type: readUint8(view, 0x66 + offset),
            teamId: readUint8(view, 0x6e + offset),
            controllerFix: cfOption,
          };
        }),
      };
    case Commands.PRE_FRAME_UPDATE:
      return {
        frame: readInt32(view, 0x1),
        playerIndex: readUint8(view, 0x5),
        isFollower: readBool(view, 0x6),
        seed: readUint32(view, 0x7),
        actionStateId: readUint16(view, 0xb),
        positionX: readFloat(view, 0xd),
        positionY: readFloat(view, 0x11),
        facingDirection: readFloat(view, 0x15),
        joystickX: readFloat(view, 0x19),
        joystickY: readFloat(view, 0x1d),
        cStickX: readFloat(view, 0x21),
        cStickY: readFloat(view, 0x25),
        trigger: readFloat(view, 0x29),
        buttons: readUint32(view, 0x2d),
        physicalButtons: readUint16(view, 0x31),
        physicalLTrigger: readFloat(view, 0x33),
        physicalRTrigger: readFloat(view, 0x37),
        percent: readFloat(view, 0x3c),
      };
    case Commands.POST_FRAME_UPDATE:
      return {
        frame: readInt32(view, 0x1),
        playerIndex: readUint8(view, 0x5),
        isFollower: readBool(view, 0x6),
        internalCharacterId: readUint8(view, 0x7),
        actionStateId: readUint16(view, 0x8),
        positionX: readFloat(view, 0xa),
        positionY: readFloat(view, 0xe),
        facingDirection: readFloat(view, 0x12),
        percent: readFloat(view, 0x16),
        shieldSize: readFloat(view, 0x1a),
        lastAttackLanded: readUint8(view, 0x1e),
        currentComboCount: readUint8(view, 0x1f),
        lastHitBy: readUint8(view, 0x20),
        stocksRemaining: readUint8(view, 0x21),
        actionStateCounter: readFloat(view, 0x22),
      };
    case Commands.GAME_END:
      return {
        gameEndMethod: readUint8(view, 0x1),
      };
    default:
      return undefined;
  }
}

function canReadFromView(view: DataView, offset: number, length: number) {
  const viewLength = view.byteLength;
  return offset + length <= viewLength;
}

function readFloat(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 4)) {
    return null;
  }

  return view.getFloat32(offset);
}

function readInt32(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 4)) {
    return null;
  }

  return view.getInt32(offset);
}

function readUint32(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 4)) {
    return null;
  }

  return view.getUint32(offset);
}

function readUint16(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 2)) {
    return null;
  }

  return view.getUint16(offset);
}

function readUint8(view: DataView, offset: number): number | null {
  if (!canReadFromView(view, offset, 1)) {
    return null;
  }

  return view.getUint8(offset);
}

function readBool(view: DataView, offset: number): boolean | null {
  if (!canReadFromView(view, offset, 1)) {
    return null;
  }

  return !!view.getUint8(offset);
}

export function getMetadata(slpFile: SlpFileType): MetadataType {
  if (slpFile.metadataLength <= 0) {
    // This will happen on a severed incomplete file
    return {};
  }

  const buffer = new Uint8Array(
    slpFile.dataBuffer,
    slpFile.metadataPosition,
    slpFile.metadataLength,
  );

  let metadata = {};
  try {
    metadata = decode(buffer);
  } catch (ex) {
    // Do nothing
    console.log(ex);
  }

  // $FlowFixMe
  return metadata;
}
