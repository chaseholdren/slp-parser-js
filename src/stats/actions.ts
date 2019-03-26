import * as lodash from 'lodash';
import { States, iterateFramesInOrder, ActionCountsType } from './common';
import { default as SlippiGame } from '../SlippiGame';

function isRolling(animation: number) {
  const rollAnimations: { [key: number]: boolean } = {
    [States.ROLL_BACKWARD]: true,
    [States.ROLL_FORWARD]: true,
  };

  return rollAnimations[animation];
}

function didStartRoll(currentAnimation: number, previousAnimation: number) {
  const isCurrentlyRolling = isRolling(currentAnimation);
  const wasPreviouslyRolling = isRolling(previousAnimation);

  return isCurrentlyRolling && !wasPreviouslyRolling;
}

function isSpotDodging(animation: number) {
  return animation === States.SPOT_DODGE;
}

function didStartSpotDodge(currentAnimation: number, previousAnimation: number) {
  const isCurrentlyDodging = isSpotDodging(currentAnimation);
  const wasPreviouslyDodging = isSpotDodging(previousAnimation);

  return isCurrentlyDodging && !wasPreviouslyDodging;
}

function isAirDodging(animation: number) {
  return animation === States.AIR_DODGE;
}

function didStartAirDodge(currentAnimation: number, previousAnimation: number) {
  const isCurrentlyDodging = isAirDodging(currentAnimation);
  const wasPreviouslyDodging = isAirDodging(previousAnimation);

  return isCurrentlyDodging && !wasPreviouslyDodging;
}

export function generateActionCounts(game: SlippiGame): ActionCountsType[] {
  const actionCounts: ActionCountsType[] = [];

  // Frame pattern that indicates a dash dance turn was executed
  const dashDanceAnimations = [States.DASH, States.TURN, States.DASH];

  const initialState: {
    animations: number[];
    playerCounts: Partial<ActionCountsType>;
  } = {
    animations: [],
    playerCounts: {},
  };

  let state = initialState;

  // Helper function for incrementing counts
  const incrementCount = (field: string, condition: boolean) => {
    if (!condition) {
      return;
    }

    if (typeof state.playerCounts[field] === 'undefined') {
      state.playerCounts[field] = 0;
    }

    state.playerCounts[field]! += 1;
  };

  // Iterates the frames in order in order to compute stocks
  iterateFramesInOrder(
    game,
    (indices) => {
      const playerCounts = {
        playerIndex: indices.playerIndex,
        opponentIndex: indices.opponentIndex,
        wavedashCount: 0,
        wavelandCount: 0,
        airDodgeCount: 0,
        dashDanceCount: 0,
        spotDodgeCount: 0,
        rollCount: 0,
      };

      state = {
        ...initialState,
        playerCounts,
      };

      actionCounts.push(playerCounts);
    },
    (indices, frame) => {
      const playerFrame = frame.players[indices.playerIndex].post;

      // Manage animation state
      if (playerFrame.actionStateId) state.animations.push(playerFrame.actionStateId);

      // Grab last 3 frames
      const last3Frames = state.animations.slice(-3);
      const currentAnimation = playerFrame.actionStateId;
      const prevAnimation = last3Frames[last3Frames.length - 2];

      if (currentAnimation) {
        // Increment counts based on conditions
        const didDashDance = lodash.isEqual(last3Frames, dashDanceAnimations);
        incrementCount('dashDanceCount', didDashDance);

        const didRoll = didStartRoll(currentAnimation, prevAnimation);
        incrementCount('rollCount', didRoll);

        const didSpotDodge = didStartSpotDodge(currentAnimation, prevAnimation);
        incrementCount('spotDodgeCount', didSpotDodge);

        const didAirDodge = didStartAirDodge(currentAnimation, prevAnimation);
        incrementCount('airDodgeCount', didAirDodge);
      }

      // Handles wavedash detection (and waveland)
      handleActionWavedash(state.playerCounts, state.animations);
    },
  );

  return actionCounts;
}

function handleActionWavedash(counts: Partial<ActionCountsType>, animations: number[]) {
  const currentAnimation = lodash.last(animations);
  const prevAnimation = animations[animations.length - 2];

  const isSpecialLanding = currentAnimation === States.LANDING_FALL_SPECIAL;
  const isAcceptablePrevious = isWavedashInitiationAnimation(prevAnimation);
  const isPossibleWavedash = isSpecialLanding && isAcceptablePrevious;

  if (!isPossibleWavedash) {
    return;
  }

  // Here we special landed, it might be a wavedash, let's check
  // We grab the last 8 frames here because that should be enough time to execute a
  // wavedash. This number could be tweaked if we find false negatives
  const recentFrames = animations.slice(-8);
  const recentAnimations = lodash.keyBy(recentFrames, (animation) => animation);

  if (lodash.size(recentAnimations) === 2 && recentAnimations[States.AIR_DODGE]) {
    // If the only other animation is air dodge, this might be really late to the point
    // where it was actually an air dodge. Air dodge animation is really long
    return;
  }

  let safeCounts = counts;

  if (typeof safeCounts === 'undefined' || !safeCounts) {
    safeCounts = {
      airDodgeCount: 0,
      wavedashCount: 0,
      wavelandCount: 0,
    };
  }

  if (typeof safeCounts.airDodgeCount === 'undefined') safeCounts.airDodgeCount = 0;
  if (typeof safeCounts.wavedashCount === 'undefined') safeCounts.wavedashCount = 0;
  if (typeof safeCounts.wavelandCount === 'undefined') safeCounts.wavelandCount = 0;

  if (recentAnimations[States.AIR_DODGE]) {
    // If one of the recent animations was an air dodge, let's remove that from the
    // air dodge counter, we don't want to count air dodges used to wavedash/land
    safeCounts.airDodgeCount -= 1;
  }

  if (recentAnimations[States.ACTION_KNEE_BEND]) {
    // If a jump was started recently, we will consider this a wavedash
    safeCounts.wavedashCount += 1;
  } else {
    // If there was no jump recently, this is a waveland
    safeCounts.wavelandCount += 1;
  }
}

function isWavedashInitiationAnimation(animation: number) {
  if (animation === States.AIR_DODGE) {
    return true;
  }

  const isAboveMin = animation >= States.CONTROLLED_JUMP_START;
  const isBelowMax = animation <= States.CONTROLLED_JUMP_END;
  return isAboveMin && isBelowMax;
}
