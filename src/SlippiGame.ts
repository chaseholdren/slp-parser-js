import * as lodash from 'lodash';
import { generateActionCounts } from './stats/actions';
import { generateCombos } from './stats/combos';

import {
  ActionCountsType,
  ComboType,
  ConversionType,
  Frames,
  getLastFrame,
  OverallType,
  StockType,
} from './stats/common';
import { generateConversions } from './stats/conversions';
import { generateOverall as generateOverallStats } from './stats/overall';
import { generateStocks } from './stats/stocks';
import {
  Commands,
  GameStartType,
  iterateEvents,
  MetadataType,
  PlayerType,
  PostFrameUpdateType,
  PreFrameUpdateType,
  readSlpData,
  SlpFileType,
  getMetadata,
} from './utils/slpReader';
import readFileAsArrayBuffer from './utils/readFileAsArrayBuffer';

export type GameSettingsType = {
  stageId: number;
  isTeams: boolean;
  isPAL: boolean;
  players: PlayerType[];
};

export type FrameEntryType = {
  frame: number;
  players: {
    [playerIndex: number]: {
      pre: PreFrameUpdateType;
      post: PostFrameUpdateType;
    };
  };
};

type FramesType = {
  [frameIndex: number]: FrameEntryType;
};

export type StatsType = {
  lastFrame: number;
  playableFrameCount: number;
  stocks: StockType[];
  conversions: ConversionType[];
  combos: ComboType[];
  actionCounts: ActionCountsType[];
  overall: OverallType[];
};

export type DecodedSlippiFileJson = {
  metadata: MetadataType;
  raw: number[];
};

/**
 * Slippi Game class that wraps a file
 */
export default class SlippiGame {
  arrayBuffer: ArrayBuffer;
  file?: SlpFileType;

  settings?: GameSettingsType;
  playerFrames?: FramesType;
  followerFrames?: FramesType;
  stats?: Partial<StatsType>;
  metadata?: MetadataType;
  external: any;

  constructor(arrayBuffer: ArrayBuffer) {
    this.arrayBuffer = arrayBuffer;
  }

  /**
   * Gets the game settings, these are the settings that describe the starting state of
   * the game such as characters, stage, etc.
   */
  getSettings = (): GameSettingsType => {
    if (this.settings) {
      // If header is already generated, return it
      return this.settings;
    }

    const slpfile = readSlpData(this.arrayBuffer);

    // Prepare default settings
    const settings: GameSettingsType = {
      stageId: 0,
      isTeams: false,
      isPAL: false,
      players: [],
    };

    // Generate settings from iterating through file
    iterateEvents(slpfile, (command, payload) => {
      if (!payload) {
        // If payload is falsy, keep iterating. The parser probably just doesn't know
        // about this command yet
        return false;
      }

      switch (command) {
        case Commands.GAME_START:
          const gameStartSettings = payload as GameStartType;

          const players = gameStartSettings.players;

          settings.players = lodash.filter(players, (player) => player.type !== 3);
          break;

        case Commands.POST_FRAME_UPDATE:
          const postFrameUpdate = payload as PostFrameUpdateType;

          if (postFrameUpdate.frame === null || postFrameUpdate.frame > Frames.FIRST) {
            // Once we are an frame -122 or higher we are done getting match settings
            // Tell the iterator to stop
            return true;
          }

          const playerIndex = postFrameUpdate.playerIndex;
          if (playerIndex !== null) {
            const playersByIndex = lodash.keyBy(settings.players, 'playerIndex');

            switch (postFrameUpdate.internalCharacterId) {
              case 0x7:
                playersByIndex[playerIndex].characterId = 0x13; // Sheik
                break;
              case 0x13:
                playersByIndex[playerIndex].characterId = 0x12; // Zelda
                break;
            }
          }
          break;
      }

      return false; // Tell the iterator to keep iterating
    });

    this.settings = settings;
    return settings;
  }

  getFrames = (): FramesType => {
    if (this.playerFrames) {
      return this.playerFrames;
    }

    const slpfile = readSlpData(this.arrayBuffer);

    const playerFrames: FramesType = {};
    const followerFrames: FramesType = {};

    iterateEvents(slpfile, (command, payload) => {
      if (!payload) {
        // If payload is falsy, keep iterating. The parser probably just doesn't know
        // about this command yet
        return false;
      }

      switch (command) {
        case Commands.PRE_FRAME_UPDATE:
        case Commands.POST_FRAME_UPDATE:
          const frameUpdate = payload as PreFrameUpdateType | PostFrameUpdateType;

          if (!frameUpdate.frame && frameUpdate.frame !== 0) {
            // If payload is messed up, stop iterating. This shouldn't ever happen
            return true;
          }

          const location = command === Commands.PRE_FRAME_UPDATE ? 'pre' : 'post';
          const frames = frameUpdate.isFollower ? followerFrames : playerFrames;
          if (frameUpdate.frame !== null && frameUpdate.playerIndex !== null) {
            lodash.set(
              frames,
              [frameUpdate.frame, 'players', frameUpdate.playerIndex, location],
              frameUpdate,
            );
            lodash.set(frames, [frameUpdate.frame, 'frame'], frameUpdate.frame);
          }
          break;
      }

      return false; // Tell the iterator to keep iterating
    });

    this.playerFrames = playerFrames;
    this.followerFrames = followerFrames;

    return playerFrames;
  }

  getStats = (): Partial<StatsType> => {
    if (this.stats) {
      return this.stats;
    }

    const slpfile = readSlpData(this.arrayBuffer);

    const lastFrame = getLastFrame(this);

    // The order here kind of matters because things later in the call order might
    // reference things calculated earlier. More specifically, currently the overall
    // calculation uses the others
    this.stats = {};
    this.stats.stocks = generateStocks(this);
    this.stats.conversions = generateConversions(this);
    this.stats.combos = generateCombos(this);
    this.stats.actionCounts = generateActionCounts(this);
    this.stats.lastFrame = lastFrame;
    this.stats.playableFrameCount = lastFrame + Math.abs(Frames.FIRST_PLAYABLE);
    this.stats.overall = generateOverallStats(this);

    return this.stats;
  }

  getMetadata = (): MetadataType | undefined => {
    if (this.metadata) {
      return this.metadata;
    }

    if (this.file) {
      this.metadata = getMetadata(this.file);
    }

    return this.metadata;
  }
}
