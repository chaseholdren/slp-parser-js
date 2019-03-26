import * as lodash from 'lodash';
import {
  ConversionType,
  Frames,
  getSinglesOpponentIndices,
  iterateFramesInOrder,
  OverallType,
} from './common';
import { PreFrameUpdateType } from '../utils/slpReader';
import { default as SlippiGame } from '../SlippiGame';

const JoystickRegion = {
  DZ: 0,
  NE: 1,
  SE: 2,
  SW: 3,
  NW: 4,
  N: 5,
  E: 6,
  S: 7,
  W: 8,
};

export function generateOverall(game: SlippiGame): OverallType[] {
  const playerIndices = getSinglesOpponentIndices(game);

  const inputs = generateInputs(game);

  const inputsByPlayer = lodash.keyBy(inputs, 'playerIndex');
  const stocksByPlayer = lodash.groupBy(game && game.stats && game.stats.stocks, 'playerIndex');
  const conversionsByPlayer = lodash.groupBy(
    game && game.stats && game.stats.conversions,
    'playerIndex',
  );
  const conversionsByPlayerByOpening = lodash.mapValues(conversionsByPlayer, (conversions) =>
    lodash.groupBy(conversions, 'openingType'),
  );

  const gameMinutes = game.stats!.playableFrameCount! / 3600;

  const overall = lodash.map(playerIndices, (indices) => {
    const playerIndex = indices.playerIndex;
    const opponentIndex = indices.opponentIndex;

    const inputCount = lodash.get(inputsByPlayer, [playerIndex, 'inputCount']) || 0;
    const conversions = lodash.get(conversionsByPlayer, playerIndex) || [];
    const successfulConversions = lodash.filter(
      conversions,
      (conversion) => conversion.moves.length > 1,
    );
    const opponentStocks = lodash.get(stocksByPlayer, opponentIndex) || [];
    const opponentEndedStocks = lodash.filter(opponentStocks, 'endFrame');

    const conversionCount = conversions.length;
    const successfulConversionCount = successfulConversions.length;
    const totalDamage = lodash.sumBy(opponentStocks, 'currentPercent') || 0;
    const killCount = opponentEndedStocks.length;

    return {
      playerIndex,
      opponentIndex,

      inputCount,
      conversionCount,
      totalDamage,
      killCount,

      successfulConversions: getRatio(successfulConversionCount, conversionCount),
      inputsPerMinute: getRatio(inputCount, gameMinutes),
      openingsPerKill: getRatio(conversionCount, killCount),
      damagePerOpening: getRatio(totalDamage, conversionCount),
      neutralWinRatio: getOpeningRatio(
        conversionsByPlayerByOpening,
        playerIndex,
        opponentIndex,
        'neutral-win',
      ),
      counterHitRatio: getOpeningRatio(
        conversionsByPlayerByOpening,
        playerIndex,
        opponentIndex,
        'counter-attack',
      ),
      beneficialTradeRatio: getBeneficialTradeRatio(
        conversionsByPlayerByOpening,
        playerIndex,
        opponentIndex,
      ),
    };
  });

  return overall;
}

function getRatio(count: number, total: number) {
  return {
    count,
    total,
    ratio: total ? count / total : null,
  };
}

function getOpeningRatio(
  conversionsByPlayerByOpening: lodash.Dictionary<any>,
  playerIndex: number,
  opponentIndex: number,
  type: string | number,
) {
  const openings = lodash.get(conversionsByPlayerByOpening, [playerIndex, type]) || [];

  const opponentOpenings = lodash.get(conversionsByPlayerByOpening, [opponentIndex, type]) || [];

  return getRatio(openings.length, openings.length + opponentOpenings.length);
}

function getBeneficialTradeRatio(
  conversionsByPlayerByOpening: lodash.Dictionary<any>,
  playerIndex: string | number,
  opponentIndex: string | number,
) {
  const playerTrades = lodash.get(conversionsByPlayerByOpening, [playerIndex, 'trade']) || [];
  const opponentTrades = lodash.get(conversionsByPlayerByOpening, [opponentIndex, 'trade']) || [];

  const benefitsPlayer = [];

  // Figure out which punishes benefited this player
  const zippedTrades = lodash.zip(playerTrades, opponentTrades);
  zippedTrades.forEach((conversionPair) => {
    const playerConversion = lodash.first(conversionPair) as ConversionType;
    const opponentConversion = lodash.last(conversionPair) as ConversionType;
    const playerDamage = playerConversion.currentPercent - playerConversion.startPercent;
    const opponentDamage = opponentConversion.currentPercent - opponentConversion.startPercent;

    if (playerConversion.didKill && !opponentConversion.didKill) {
      benefitsPlayer.push(playerConversion);
    } else if (playerDamage > opponentDamage) {
      benefitsPlayer.push(playerConversion);
    }
  });

  return getRatio(benefitsPlayer.length, playerTrades.length);
}

function generateInputs(game: SlippiGame) {
  const inputs: OverallType[] = [];
  const frames = game.getFrames();

  let state: OverallType;

  // Iterates the frames in order in order to compute stocks
  iterateFramesInOrder(
    game,
    (indices) => {
      const playerInputs = {
        playerIndex: indices.playerIndex,
        opponentIndex: indices.opponentIndex,
        inputCount: 0,
      } as OverallType;

      state = playerInputs;

      inputs.push(playerInputs);
    },
    (indices, frame) => {
      const playerFrame = frame.players[indices.playerIndex].pre;
      const prevPlayerFrame: PreFrameUpdateType = lodash.get(
        frames,
        [playerFrame.frame! - 1, 'players', indices.playerIndex, 'pre'],
        {},
      );

      if (playerFrame.frame! < Frames.FIRST_PLAYABLE) {
        // Don't count inputs until the game actually starts
        return;
      }

      // First count the number of buttons that go from 0 to 1
      // Increment action count by amount of button presses
      const invertedPreviousButtons = ~prevPlayerFrame.physicalButtons!;
      const currentButtons = playerFrame.physicalButtons;
      const buttonChanges = invertedPreviousButtons & currentButtons! & 0xfff;
      state.inputCount += countSetBits(buttonChanges);

      // Increment action count when sticks change from one region to another.
      // Don't increment when stick returns to deadzone
      const prevAnalogRegion = getJoystickRegion(
        prevPlayerFrame.joystickX!,
        prevPlayerFrame.joystickY!,
      );
      const currentAnalogRegion = getJoystickRegion(playerFrame.joystickX!, playerFrame.joystickY!);
      if (prevAnalogRegion !== currentAnalogRegion && currentAnalogRegion !== 0) {
        state.inputCount += 1;
      }

      // Do the same for c-stick
      const prevCstickRegion = getJoystickRegion(
        prevPlayerFrame.cStickX!,
        prevPlayerFrame.cStickY!,
      );
      const currentCstickRegion = getJoystickRegion(playerFrame.cStickX!, playerFrame.cStickY!);
      if (prevCstickRegion !== currentCstickRegion && currentCstickRegion !== 0) {
        state.inputCount += 1;
      }

      // Increment action on analog trigger... I'm not sure when. This needs revision
      // Currently will update input count when the button gets pressed past 0.3
      // Changes from hard shield to light shield should probably count as inputs but
      // are not counted here
      if (prevPlayerFrame.physicalLTrigger! < 0.3 && playerFrame.physicalLTrigger! >= 0.3) {
        state.inputCount += 1;
      }
      if (prevPlayerFrame.physicalRTrigger! < 0.3 && playerFrame.physicalRTrigger! >= 0.3) {
        state.inputCount += 1;
      }
    },
  );

  return inputs;
}

function countSetBits(x: number) {
  // This function solves the Hamming Weight problem. Effectively it counts the number of
  // bits in the input that are set to 1
  // This implementation is supposedly very efficient when most bits are zero.
  // Found: https://en.wikipedia.org/wiki/Hamming_weight#Efficient_implementation
  let bits = x;

  let count;
  for (count = 0; bits; count += 1) {
    bits &= bits - 1;
  }
  return count;
}

function getJoystickRegion(x: number, y: number) {
  let region = JoystickRegion.DZ;

  if (x >= 0.2875 && y >= 0.2875) {
    region = JoystickRegion.NE;
  } else if (x >= 0.2875 && y <= -0.2875) {
    region = JoystickRegion.SE;
  } else if (x <= -0.2875 && y <= -0.2875) {
    region = JoystickRegion.SW;
  } else if (x <= -0.2875 && y >= 0.2875) {
    region = JoystickRegion.NW;
  } else if (y >= 0.2875) {
    region = JoystickRegion.N;
  } else if (x >= 0.2875) {
    region = JoystickRegion.E;
  } else if (y <= -0.2875) {
    region = JoystickRegion.S;
  } else if (x <= -0.2875) {
    region = JoystickRegion.W;
  }

  return region;
}
