import * as lodash from 'lodash';
import { PostFrameUpdateType } from '../utils/slpReader';
import { default as SlippiGame, FrameEntryType } from '../SlippiGame';

type RatioType = {
  count: number;
  total: number;
  ratio: number | null;
};

type PlayerIndexedType = {
  playerIndex: number;
  opponentIndex: number;
};

export type DurationType = {
  startFrame: number;
  endFrame?: number;
};

export type DamageType = {
  startPercent: number;
  currentPercent: number;
  endPercent?: number;
};

export type StockType = PlayerIndexedType &
  DurationType &
  DamageType & {
    count: number;
    deathAnimation?: number;
  };

export type MoveLandedType = {
  frame: number;
  moveId: number;
  hitCount: number;
};

export type ConversionType = PlayerIndexedType &
  DurationType &
  DamageType & {
    moves: MoveLandedType[];
    openingType: string;
    didKill: boolean;
  };

export type ComboType = PlayerIndexedType &
  DurationType &
  DamageType & {
    moves: MoveLandedType[];
    didKill: boolean;
  };

export type ActionCountsType = PlayerIndexedType & {
  [key: string]: number;
  wavedashCount: number;
  wavelandCount: number;
  airDodgeCount: number;
  dashDanceCount: number;
  spotDodgeCount: number;
  rollCount: number;
};

export type OverallType = PlayerIndexedType & {
  inputCount: number;
  conversionCount: number;
  totalDamage: number;
  killCount: number;

  successfulConversions: RatioType;
  inputsPerMinute: RatioType;
  openingsPerKill: RatioType;
  damagePerOpening: RatioType;
  neutralWinRatio: RatioType;
  counterHitRatio: RatioType;
  beneficialTradeRatio: RatioType;
};

export enum States {
  // Animation ID ranges
  DAMAGE_START = 0x4b,
  DAMAGE_END = 0x5b,
  CAPTURE_START = 0xdf,
  CAPTURE_END = 0xe8,
  GUARD_START = 0xb2,
  GUARD_END = 0xb6,
  GROUNDED_CONTROL_START = 0xe,
  GROUNDED_CONTROL_END = 0x18,
  SQUAT_START = 0x27,
  SQUAT_END = 0x29,
  DOWN_START = 0xb7,
  DOWN_END = 0xc6,
  TECH_START = 0xc7,
  TECH_END = 0xcc,
  DYING_START = 0x0,
  DYING_END = 0xa,
  CONTROLLED_JUMP_START = 0x18,
  CONTROLLED_JUMP_END = 0x22,
  GROUND_ATTACK_START = 0x2c,
  GROUND_ATTACK_END = 0x40,

  // Animation ID specific
  ROLL_FORWARD = 0xe9,
  ROLL_BACKWARD = 0xea,
  SPOT_DODGE = 0xeb,
  AIR_DODGE = 0xec,
  ACTION_WAIT = 0xe,
  ACTION_DASH = 0x14,
  ACTION_KNEE_BEND = 0x18,
  GUARD_ON = 0xb2,
  TECH_MISS_UP = 0xb7,
  TECH_MISS_DOWN = 0xbf,
  DASH = 0x14,
  TURN = 0x12,
  LANDING_FALL_SPECIAL = 0x2b,
  JUMP_FORWARD = 0x19,
  JUMP_BACKWARD = 0x1a,
  FALL_FORWARD = 0x1e,
  FALL_BACKWARD = 0x1f,
  GRAB = 0xd4,
}

export enum Timers {
  PUNISH_RESET_FRAMES = 45,
  RECOVERY_RESET_FRAMES = 45,
  COMBO_STRING_RESET_FRAMES = 45,
}

export enum Frames {
  FIRST = -123,
  FIRST_PLAYABLE = -39,
}

export function getSinglesOpponentIndices(game: SlippiGame): PlayerIndexedType[] {
  const settings = game.getSettings();
  if (settings.players.length !== 2) {
    // Only return opponent indices for singles
    return [];
  }

  return [
    {
      playerIndex: settings.players[0].playerIndex,
      opponentIndex: settings.players[1].playerIndex,
    },
    {
      playerIndex: settings.players[1].playerIndex,
      opponentIndex: settings.players[0].playerIndex,
    },
  ];
}

export function didLoseStock(frame: PostFrameUpdateType, prevFrame: PostFrameUpdateType): boolean {
  if (!frame || !prevFrame.stocksRemaining || !prevFrame || !frame.stocksRemaining) {
    return false;
  }

  return prevFrame.stocksRemaining - frame.stocksRemaining > 0;
}

export function isInControl(state: number): boolean {
  const ground = state >= States.GROUNDED_CONTROL_START && state <= States.GROUNDED_CONTROL_END;
  const squat = state >= States.SQUAT_START && state <= States.SQUAT_END;
  const groundAttack = state > States.GROUND_ATTACK_START && state <= States.GROUND_ATTACK_END;
  const isGrab = state === States.GRAB;
  // TODO: Add grounded b moves?
  return ground || squat || groundAttack || isGrab;
}

export function isTeching(state: number): boolean {
  return state >= States.TECH_START && state <= States.TECH_END;
}

export function isDown(state: number): boolean {
  return state >= States.DOWN_START && state <= States.DOWN_END;
}

export function isDamaged(state: number): boolean {
  return state >= States.DAMAGE_START && state <= States.DAMAGE_END;
}

export function isGrabbed(state: number): boolean {
  return state >= States.CAPTURE_START && state <= States.CAPTURE_END;
}

export function isDead(state: number): boolean {
  return state >= States.DYING_START && state <= States.DYING_END;
}

export function calcDamageTaken(
  frame: PostFrameUpdateType,
  prevFrame: PostFrameUpdateType,
): number {
  const percent = lodash.get(frame, 'percent', 0) as number;
  const prevPercent = lodash.get(prevFrame, 'percent', 0) as number;

  return percent - prevPercent;
}

function getSortedFrames(game: SlippiGame) {
  // TODO: This is obviously jank and probably shouldn't be done this way. I just didn't
  // TODO: want the primary game object to have the concept of sortedFrames because it's
  // TODO: kinda shitty I need to do that anyway. It's required because javascript doesn't
  // TODO: support sorted objects... I could use a Map but that felt pretty heavy for
  // TODO: little reason.
  if (lodash.has(game, ['external', 'sortedFrames'])) {
    // $FlowFixMe
    return game.external.sortedFrames;
  }

  const frames = game.getFrames();
  const sortedFrames = lodash.orderBy(frames, 'frame');
  lodash.set(game, ['external', 'sortedFrames'], sortedFrames);

  // $FlowFixMe
  return game.external.sortedFrames;
}

export function iterateFramesInOrder(
  game: SlippiGame,
  initialize: (indices: PlayerIndexedType) => void,
  processFrame: (indices: PlayerIndexedType, frame: FrameEntryType) => void,
) {
  const opponentIndices = getSinglesOpponentIndices(game);
  if (opponentIndices.length === 0) {
    return;
  }

  const sortedFrames = getSortedFrames(game);

  // Iterates through both of the player/opponent pairs
  lodash.forEach(opponentIndices, (indices) => {
    initialize(indices);

    // Iterates through all of the frames for the current player and opponent
    lodash.forEach(sortedFrames, (frame) => {
      processFrame(indices, frame);
    });
  });
}

export function getLastFrame(game: SlippiGame): number {
  const sortedFrames = getSortedFrames(game);
  const lastFrame = lodash.last(sortedFrames) as FrameEntryType;

  return lastFrame.frame;
}
